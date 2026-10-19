import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { WhatsAppCampaign } from '../../../../core/whatsapp/whatsappCampaign.model.js';
import {
    sendWhatsAppTemplateBulk,
    rememberWhatsAppTemplate,
    toWhatsAppNumber
} from '../../../../core/whatsapp/whatsapp.service.js';
import {
    normalizeTargetType,
    resolveTargets,
    normalizeWhatsAppOption,
    phonesForTargets
} from './notificationBroadcast.service.js';

const MAX_PASTED_NUMBERS = 5000;

/**
 * Pasted numbers (array, or text separated by new lines / commas / semicolons)
 * -> distinct numbers. Not split on spaces: "+91 95222 11125" is one number.
 * Deduped on the digits, so the same number written two ways counts once.
 */
const parsePastedNumbers = (raw) => {
    const items = Array.isArray(raw) ? raw : String(raw || '').split(/[\n\r,;]+/);
    const seen = new Map();
    for (const item of items) {
        const text = String(item ?? '').trim();
        if (!text) continue;
        const key = toWhatsAppNumber(text) || text;
        if (!seen.has(key)) seen.set(key, text);
    }
    return [...seen.values()];
};

/** Who gets it, as phone numbers, and how many recipients that was before phone lookup. */
const resolveRecipients = async (body) => {
    const audience = String(body?.audience || '').trim().toUpperCase();
    if (audience === 'NUMBERS') {
        const numbers = parsePastedNumbers(body?.phones);
        if (!numbers.length) throw new ValidationError('Paste at least one phone number');
        if (numbers.length > MAX_PASTED_NUMBERS) {
            throw new ValidationError(`At most ${MAX_PASTED_NUMBERS} numbers per send`);
        }
        const valid = numbers.filter((n) => toWhatsAppNumber(n));
        if (!valid.length) throw new ValidationError('None of the pasted numbers is a valid 10-digit mobile number');
        return { audience, phones: numbers, recipientCount: numbers.length };
    }
    const targetType = normalizeTargetType(audience);
    const targets = await resolveTargets({ targetType, targetIds: body?.targetIds, targets: body?.targets });
    if (!targets.length) throw new ValidationError('No recipients found');
    return { audience: targetType, phones: await phonesForTargets(targets), recipientCount: targets.length };
};

const runCampaign = async (campaignId, phones, option, recipientCount) => {
    try {
        const result = await sendWhatsAppTemplateBulk(phones, option);
        if (result.sent > 0) await rememberWhatsAppTemplate(option);
        await WhatsAppCampaign.updateOne({ _id: campaignId }, {
            $set: {
                status: 'done',
                attempted: result.attempted,
                sent: result.sent,
                failed: result.failed,
                // invalid numbers + recipients without any phone on file
                skipped: result.skipped + Math.max(0, recipientCount - phones.length),
                failures: result.errors,
                finishedAt: new Date()
            }
        });
    } catch (e) {
        logger.error(`[WHATSAPP] campaign ${campaignId} failed: ${e?.message || e}`);
        await WhatsAppCampaign.updateOne({ _id: campaignId }, { $set: { status: 'failed', finishedAt: new Date() } }).catch(() => {});
    }
};

/**
 * Start a WhatsApp campaign. Returns as soon as it is recorded; the sending
 * runs in the background and its counts land on the campaign.
 */
export const createWhatsAppCampaign = async ({ body = {}, adminId } = {}) => {
    const option = normalizeWhatsAppOption({
        template: body?.template, language: body?.language, bodyParams: body?.bodyParams, headerImage: body?.headerImage
    });
    if (!option) throw new ValidationError('Template name is required');
    const { audience, phones, recipientCount } = await resolveRecipients(body);

    const campaign = await WhatsAppCampaign.create({
        template: option.template,
        language: option.language || 'en',
        bodyParams: option.bodyParams,
        headerImage: option.headerImage || '',
        audience,
        recipientCount,
        status: 'sending',
        createdBy: mongoose.Types.ObjectId.isValid(String(adminId)) ? adminId : undefined
    });

    void runCampaign(campaign._id, phones, option, recipientCount);
    return { campaign };
};

export const listWhatsAppCampaigns = async ({ page = 1, limit = 20 } = {}) => {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const [items, total] = await Promise.all([
        WhatsAppCampaign.find({}).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l)
            .populate('createdBy', 'name email').lean(),
        WhatsAppCampaign.countDocuments({})
    ]);
    return { items, pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) } };
};
