import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

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

const buildPayload = ({ to, template, language, bodyParams }) => {
    const params = (Array.isArray(bodyParams) ? bodyParams : [])
        .map((p) => String(p ?? ''))
        .filter((p) => p !== '');
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
            name: template,
            language: { code: language || config.whatsappDefaultLanguage },
            ...(params.length
                ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] }
                : {})
        }
    };
};

/**
 * Send one approved template.
 * @param {{ phone: string, template: string, language?: string, bodyParams?: string[] }} input
 * @returns {Promise<{ ok: boolean, to: string|null, messageId?: string, error?: string }>}
 */
export const sendWhatsAppTemplate = async ({ phone, template, language, bodyParams } = {}) => {
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
            body: JSON.stringify(buildPayload({ to, template, language, bodyParams })),
            signal: AbortSignal.timeout(15000)
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON error body */ }

        const messageId = json?.messages?.[0]?.id;
        if (res.ok && messageId) return { ok: true, to, messageId };

        const error = json?.error?.message || json?.message || `HTTP ${res.status}: ${text.slice(0, 200)}`;
        return { ok: false, to, error };
    } catch (e) {
        return { ok: false, to, error: e?.name === 'TimeoutError' ? 'timed out' : String(e?.message || e) };
    }
};

/**
 * Send one template to many phones, a few at a time.
 * @param {string[]} phones
 * @param {{ template: string, language?: string, bodyParams?: string[], concurrency?: number }} options
 */
export const sendWhatsAppTemplateBulk = async (phones = [], { template, language, bodyParams, concurrency = 5 } = {}) => {
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
            const r = await sendWhatsAppTemplate({ phone: to, template, language, bodyParams });
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
