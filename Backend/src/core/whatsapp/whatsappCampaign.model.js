import mongoose from 'mongoose';

/**
 * One WhatsApp promotional send from Admin > WhatsApp Messages.
 *
 * Separate from push broadcasts: a template goes to a resolved list of phone
 * numbers in the background, and the outcome is recorded here. Not per
 * vertical: the WhatsApp number is shared.
 */
const whatsappCampaignSchema = new mongoose.Schema(
    {
        template: { type: String, required: true, trim: true },
        language: { type: String, default: 'en', trim: true },
        bodyParams: { type: [String], default: [] },
        /** Public https URL of the header image, for templates approved with an image header. */
        headerImage: { type: String, default: '' },
        /** ALL | USER | RESTAURANT | DELIVERY | CUSTOM (picked people) | NUMBERS (pasted phones) */
        audience: { type: String, enum: ['ALL', 'USER', 'RESTAURANT', 'DELIVERY', 'CUSTOM', 'NUMBERS'], required: true },
        recipientCount: { type: Number, default: 0 },
        status: { type: String, enum: ['sending', 'done', 'failed'], default: 'sending', index: true },
        attempted: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 },
        /** First few failures (number masked) and why. Not `errors`: mongoose reserves that name. */
        failures: { type: [{ to: String, error: String, _id: false }], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin' },
        finishedAt: { type: Date }
    },
    { collection: 'food_whatsapp_campaigns', timestamps: { createdAt: true, updatedAt: false } }
);

whatsappCampaignSchema.index({ createdAt: -1 });

export const WhatsAppCampaign = mongoose.model('WhatsAppCampaign', whatsappCampaignSchema);
