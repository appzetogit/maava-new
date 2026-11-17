import mongoose from 'mongoose';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { WhatsAppTemplate } from './whatsappTemplate.model.js';

/**
 * WhatsApp template messages through yourbulksms, which speaks the WhatsApp
 * Cloud API format (POST {phone-number-id}/messages).
 *
 * Promotional use only. WhatsApp only delivers templates approved in the
 * business account, and marketing templates only to people who agreed to
 * receive them, so a "sent" here means the provider accepted it, not that it
 * was read.
 *
 * Never throws: a failed send is a result, so one bad number cannot stop a
 * campaign. The bearer token is never logged.
 */

export const isWhatsAppConfigured = () => Boolean(config.whatsappApiUrl && config.whatsappApiToken);

/** 10-digit Indian number -> 91XXXXXXXXXX. Anything else that is not already 12 digits starting 91 -> null. */
export const toWhatsAppNumber = (phone) => {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return null;
};

/** Public https URL of a JPEG/PNG image, or '' if absent/invalid. WhatsApp fetches it itself. */
export const normalizeHeaderImage = (url) => {
    const s = String(url || '').trim();
    return /^https:\/\/[^\s]+$/i.test(s) ? s : '';
};

const buildPayload = ({ to, template, language, bodyParams, headerImage }) => {
    const params = (Array.isArray(bodyParams) ? bodyParams : [])
        .map((p) => String(p ?? ''))
        .filter((p) => p !== '');
    const image = normalizeHeaderImage(headerImage);
    // Only templates approved with an IMAGE header accept the header component.
    const components = [
        ...(image ? [{ type: 'header', parameters: [{ type: 'image', image: { link: image } }] }] : []),
        ...(params.length ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] : [])
    ];
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
            name: template,
            language: { code: language || config.whatsappDefaultLanguage },
            ...(components.length ? { components } : {})
        }
    };
};

/**
 * Send one approved template.
 * @param {{ phone: string, template: string, language?: string, bodyParams?: string[], headerImage?: string }} input
 * @returns {Promise<{ ok: boolean, to: string|null, messageId?: string, error?: string }>}
 */
export const sendWhatsAppTemplate = async ({ phone, template, language, bodyParams, headerImage } = {}) => {
    const to = toWhatsAppNumber(phone);
    if (!to) return { ok: false, to: null, error: 'invalid phone number' };
    if (!template) return { ok: false, to, error: 'template is required' };
    if (!isWhatsAppConfigured()) return { ok: false, to, error: 'WhatsApp is not configured (WHATSAPP_API_URL / WHATSAPP_API_TOKEN)' };

    try {
        const res = await fetch(config.whatsappApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.whatsappApiToken}`
            },
            body: JSON.stringify(buildPayload({ to, template, language, bodyParams, headerImage })),
            signal: AbortSignal.timeout(15000)
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON error body */ }

        const messageId = json?.messages?.[0]?.id;
        if (res.ok && messageId) return { ok: true, to, messageId };

        // Cloud API errors come as { error: { message } }; yourbulksms's own
        // checks (e.g. unknown template) as { isValid: false, response: [{ status, message }] }.
        const provider = json?.response?.[0];
        const providerText = [provider?.status, provider?.message].filter(Boolean).join(' ');
        const error = json?.error?.message || providerText || json?.message || `HTTP ${res.status}: ${text.slice(0, 200)}`;
        return { ok: false, to, error };
    } catch (e) {
        return { ok: false, to, error: e?.name === 'TimeoutError' ? 'timed out' : String(e?.message || e) };
    }
};

/**
 * Remember a template that just sent successfully, so the admin panel can
 * suggest it next time. Never throws: suggestions must not break a send.
 */
export const rememberWhatsAppTemplate = async ({ template, language, bodyParams, headerImage } = {}) => {
    try {
        const name = String(template || '').trim();
        if (!name) return;
        const values = (Array.isArray(bodyParams) ? bodyParams : []).map((v) => String(v ?? '')).filter(Boolean).slice(0, 10);
        const image = normalizeHeaderImage(headerImage);
        await WhatsAppTemplate.updateOne(
            { name, language: String(language || config.whatsappDefaultLanguage).trim() },
            {
                $set: { variables: values.length, lastValues: values, hasImage: Boolean(image), lastHeaderImage: image, lastUsedAt: new Date() },
                $inc: { useCount: 1 }
            },
            { upsert: true }
        );
    } catch (e) {
        logger.warn(`[WHATSAPP] could not remember template "${template}": ${e?.message || e}`);
    }
};

/** Remembered templates, most recently used first. */
export const listWhatsAppTemplates = () =>
    WhatsAppTemplate.find({}).sort({ lastUsedAt: -1 }).limit(100)
        .select('name language variables lastValues hasImage lastHeaderImage lastUsedAt useCount').lean();

/** Drop a suggestion (e.g. a template that was deleted in the business account). */
export const forgetWhatsAppTemplate = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) return false;
    const r = await WhatsAppTemplate.deleteOne({ _id: id });
    return r.deletedCount > 0;
};

/**
 * Send one template to many phones, a few at a time.
 * @param {string[]} phones
 * @param {{ template: string, language?: string, bodyParams?: string[], headerImage?: string, concurrency?: number }} options
 */
export const sendWhatsAppTemplateBulk = async (phones = [], { template, language, bodyParams, headerImage, concurrency = 5 } = {}) => {
    const seen = new Set();
    const queue = [];
    let skipped = 0;
    for (const phone of phones) {
        const to = toWhatsAppNumber(phone);
        if (!to) { skipped += 1; continue; }
        if (seen.has(to)) continue;
        seen.add(to);
        queue.push(to);
    }

    let sent = 0;
    let failed = 0;
    const errors = [];
    let next = 0;
    const worker = async () => {
        while (next < queue.length) {
            const to = queue[next++];
            const r = await sendWhatsAppTemplate({ phone: to, template, language, bodyParams, headerImage });
            if (r.ok) sent += 1;
            else {
                failed += 1;
                if (errors.length < 10) errors.push({ to: `******${to.slice(-4)}`, error: r.error });
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));

    logger.info(`[WHATSAPP] template "${template}": ${sent} sent, ${failed} failed, ${skipped} without a valid phone`);
    return { attempted: queue.length, sent, failed, skipped, errors };
};
