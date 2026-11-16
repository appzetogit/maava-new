import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import sharp from 'sharp';
import { config } from '../config/env.js';
import { ValidationError } from '../core/auth/errors.js';
import { logger } from '../utils/logger.js';

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
]);

const WEBP_MIME = 'image/webp';
const GIF_MIME = 'image/gif';
const FOLDER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/;

export const sanitizeUploadFolder = (folder) => {
    const normalized = String(folder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalized) {
        throw new ValidationError('Folder is required');
    }
    if (normalized.includes('..') || normalized.startsWith('.')) {
        throw new ValidationError('Invalid folder path');
    }
    if (!FOLDER_PATTERN.test(normalized)) {
        throw new ValidationError('Folder may only contain letters, numbers, /, _, and -');
    }
    return normalized;
};

const buildFilename = (extension) => {
    const stamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${stamp}-${random}${extension}`;
};

export const fixMediaUrlProtocol = (url) => String(url || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(https?):\/(?!\/)/i, '$1://')
    .replace(/^(https?:\/\/)(https?:\/\/)+/i, '$1');

export const buildPublicUrl = (relativePath) => {
    const cleanPath = String(relativePath || '').replace(/^\/+/, '');
    const base = fixMediaUrlProtocol(String(config.uploadBaseUrl || '').replace(/\/+$/, ''));

    // Never persist localhost URLs — frontend/nginx resolve /uploads/... per environment
    if (
        !base
        || base === '/uploads'
        || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/uploads)?$/i.test(base)
    ) {
        return `/uploads/${cleanPath}`;
    }

    return `${base}/${cleanPath}`;
};

/**
 * Normalize any media URL before saving to MongoDB.
 * Strips localhost origins; fixes protocol typos (https:/ → https://).
 */
export const normalizeMediaUrlForStorage = (url) => {
    const trimmed = fixMediaUrlProtocol(url);
    if (!trimmed) return '';

    if (trimmed.startsWith('/uploads/')) {
        return trimmed;
    }

    try {
        const parsed = new URL(trimmed);
        if (/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname) && parsed.pathname.startsWith('/uploads/')) {
            return parsed.pathname;
        }
        if (parsed.pathname.startsWith('/uploads/')) {
            return fixMediaUrlProtocol(parsed.toString());
        }
    } catch {
        /* not a full URL */
    }

    return trimmed;
};

const getAbsolutePath = (relativePath) => {
    const root = path.resolve(config.uploadStorageRoot);
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
        throw new ValidationError('Invalid file path');
    }
    return absolute;
};

const getWebpQuality = () => {
    const raw = Number(config.uploadWebpQuality);
    if (!Number.isFinite(raw)) return 90;
    return Math.min(100, Math.max(1, Math.round(raw)));
};

const getWebpMaxWidth = () => {
    const raw = Number(config.uploadWebpMaxWidth);
    if (!Number.isFinite(raw) || raw < 1) return 2560;
    return Math.round(raw);
};

/**
 * Convert JPEG/PNG/WebP to optimized WebP for storage.
 * GIF is kept as-is (animation). PNG with alpha uses lossless WebP.
 */
export const optimizeImageForStorage = async (inputBuffer, mimeType) => {
    const normalizedMime = String(mimeType || '').toLowerCase();

    if (normalizedMime === GIF_MIME) {
        return {
            buffer: inputBuffer,
            mimeType: GIF_MIME,
            extension: '.gif'
        };
    }

    if (!['image/jpeg', 'image/jpg', 'image/png', WEBP_MIME].includes(normalizedMime)) {
        throw new ValidationError('Unsupported image type');
    }

    const maxWidth = getWebpMaxWidth();
    const quality = getWebpQuality();

    const metadata = await sharp(inputBuffer, { failOn: 'none' }).metadata();
    const needsResize = Boolean(metadata.width && metadata.width > maxWidth);

    if (normalizedMime === WEBP_MIME && !needsResize) {
        return {
            buffer: inputBuffer,
            mimeType: WEBP_MIME,
            extension: '.webp'
        };
    }

    let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();

    if (needsResize) {
        pipeline = pipeline.resize({
            width: maxWidth,
            withoutEnlargement: true
        });
    }

    const hasAlpha = Boolean(metadata.hasAlpha);
    const webpOptions = hasAlpha
        ? { lossless: true, effort: 4 }
        : { quality, effort: 4, smartSubsample: true };

    const outputBuffer = await pipeline.webp(webpOptions).toBuffer();

    return {
        buffer: outputBuffer,
        mimeType: WEBP_MIME,
        extension: '.webp'
    };
};

const imagekitEnabled = () => Boolean(config.imagekitPrivateKey && config.imagekitUrlEndpoint);
const imagekitAuth = () => `Basic ${Buffer.from(`${config.imagekitPrivateKey}:`).toString('base64')}`;

/**
 * Stores an upload on ImageKit under the same folder/name it would have had
 * on the VPS. Returns null on any failure so the caller falls back to disk:
 * an outage at ImageKit must not stop restaurants and riders uploading.
 */
const uploadToImagekit = async (buffer, relativePath, mimeType) => {
    if (!imagekitEnabled()) return null;
    try {
        const form = new FormData();
        form.append('file', new Blob([buffer], { type: mimeType }), path.posix.basename(relativePath));
        form.append('fileName', path.posix.basename(relativePath));
        form.append('folder', `/${path.posix.dirname(relativePath)}`);
        form.append('useUniqueFileName', 'false');
        const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
            method: 'POST',
            headers: { Authorization: imagekitAuth() },
            body: form,
            signal: AbortSignal.timeout(30000)
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.url) {
            throw new Error(`HTTP ${response.status} ${body.message || ''}`.trim());
        }
        return body.url;
    } catch (error) {
        logger.warn(`ImageKit upload failed for ${relativePath}, saving on the server instead: ${error?.message || error}`);
        return null;
    }
};

/** Writes to ImageKit when configured, otherwise (or if that fails) to the VPS folder. */
const storeBuffer = async (buffer, safeFolder, relativePath, mimeType) => {
    const imagekitUrl = await uploadToImagekit(buffer, relativePath, mimeType);
    if (imagekitUrl) return imagekitUrl;
    await ensureUploadStorageReady(safeFolder);
    await fs.writeFile(getAbsolutePath(relativePath), buffer);
    return buildPublicUrl(relativePath);
};

/** Create upload root (and optional subfolder) if missing. */
export const ensureUploadStorageReady = async (folder = '') => {
    const root = path.resolve(config.uploadStorageRoot);
    await fs.mkdir(root, { recursive: true });

    if (folder) {
        const safeFolder = sanitizeUploadFolder(folder);
        await fs.mkdir(getAbsolutePath(safeFolder), { recursive: true });
    }

    return root;
};

export const saveImageFile = async (file, folder) => {
    if (!file?.buffer?.length) {
        throw new ValidationError('File is required');
    }

    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new ValidationError('Only JPEG, PNG, WebP, and GIF images are allowed');
    }

    const safeFolder = sanitizeUploadFolder(folder);
    const optimized = await optimizeImageForStorage(file.buffer, mimeType);
    const filename = buildFilename(optimized.extension);
    const relativePath = path.posix.join(safeFolder, filename);
    const url = await storeBuffer(optimized.buffer, safeFolder, relativePath, optimized.mimeType);

    return {
        url,
        path: relativePath,
        filename,
        mimeType: optimized.mimeType,
        size: optimized.buffer.length
    };
};

/**
 * Save an image as JPEG (not WebP like saveImageFile). For consumers that do
 * not accept WebP, e.g. WhatsApp template header images (JPEG/PNG, max 5 MB).
 */
export const saveJpegImage = async (file, folder, { maxWidth = 1600, quality = 85 } = {}) => {
    if (!file?.buffer?.length) {
        throw new ValidationError('File is required');
    }
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new ValidationError('Only JPEG, PNG, WebP, and GIF images are allowed');
    }
    const safeFolder = sanitizeUploadFolder(folder);
    const buffer = await sharp(file.buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: maxWidth, withoutEnlargement: true })
        .flatten({ background: '#ffffff' }) // JPEG has no transparency
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
    const filename = buildFilename('.jpg');
    const relativePath = path.posix.join(safeFolder, filename);
    const url = await storeBuffer(buffer, safeFolder, relativePath, 'image/jpeg');
    return { url, path: relativePath, filename, mimeType: 'image/jpeg', size: buffer.length };
};

export const saveImageBuffer = async (buffer, folder, options = {}) => {
    return saveImageFile(
        {
            buffer,
            mimetype: options.mimeType || 'image/jpeg',
            originalname: options.originalname || 'upload.jpg'
        },
        folder
    );
};

/** Best-effort removal from ImageKit by path. Never throws. */
const deleteFromImagekit = async (relativePath) => {
    if (!imagekitEnabled()) return false;
    try {
        // The list API cannot search by full path, only by folder plus name.
        const folder = encodeURIComponent(`/${path.posix.dirname(relativePath)}`);
        const query = encodeURIComponent(`name = "${path.posix.basename(relativePath)}"`);
        const found = await fetch(`https://api.imagekit.io/v1/files?path=${folder}&searchQuery=${query}&limit=1`, {
            headers: { Authorization: imagekitAuth() },
            signal: AbortSignal.timeout(15000)
        }).then((r) => (r.ok ? r.json() : []));
        const fileId = Array.isArray(found) ? found[0]?.fileId : null;
        if (!fileId) return false;
        const removed = await fetch(`https://api.imagekit.io/v1/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: imagekitAuth() },
            signal: AbortSignal.timeout(15000)
        });
        return removed.ok;
    } catch (error) {
        logger.warn(`ImageKit delete failed for ${relativePath}: ${error?.message || error}`);
        return false;
    }
};

export const deleteStoredFile = async (relativePath) => {
    const safePath = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safePath) return false;

    // Uploads made before ImageKit live on disk, newer ones on ImageKit; try both.
    const removedFromImagekit = await deleteFromImagekit(safePath);
    if (removedFromImagekit) return true;

    const absolutePath = getAbsolutePath(safePath);
    try {
        await fs.unlink(absolutePath);
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
    }
};

const inferMimeFromUrl = (url) => {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    const map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
    };
    return map[ext] || 'image/jpeg';
};

export const isHostedUploadUrl = (url) => {
    const normalized = String(url || '').trim();
    if (!normalized) return false;
    const base = String(config.uploadBaseUrl || '').replace(/\/+$/, '');
    if (base && normalized.startsWith(base)) return true;
    if (config.imagekitUrlEndpoint && normalized.startsWith(config.imagekitUrlEndpoint)) return true;
    return /\/uploads\//i.test(normalized);
};

export const saveImageFromUrl = async (imageUrl, folder) => {
    const url = String(imageUrl || '').trim();
    if (!url) {
        throw new ValidationError('Image URL is required');
    }

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: config.uploadMaxFileSizeBytes,
        maxBodyLength: config.uploadMaxFileSizeBytes
    });

    const buffer = Buffer.from(response.data);
    const mimeType = String(response.headers['content-type'] || inferMimeFromUrl(url)).split(';')[0].trim().toLowerCase();

    return saveImageBuffer(buffer, folder, {
        mimeType,
        originalname: path.basename(new URL(url).pathname) || 'remote.jpg'
    });
};
