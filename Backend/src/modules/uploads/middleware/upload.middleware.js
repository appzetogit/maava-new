import multer from 'multer';
import { config } from '../../../config/env.js';
import { withVerticalSafeUploads } from '../../../middleware/upload.js';

const memoryStorage = multer.memoryStorage();

// Wrapped for the same reason as `upload` in middleware/upload.js: multer
// parses off the socket and the AsyncLocalStorage vertical does not survive it,
// so anything written after this middleware would default to `food`.
export const imageUpload = withVerticalSafeUploads(multer({
    storage: memoryStorage,
    limits: {
        fileSize: config.uploadMaxFileSizeBytes,
        files: 1
    },
    fileFilter: (_req, file, cb) => {
        const mimeType = String(file.mimetype || '').toLowerCase();
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
            return cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
        }
        return cb(null, true);
    }
}));

export { uploadRateLimiter } from '../../../middleware/rateLimit.js';
