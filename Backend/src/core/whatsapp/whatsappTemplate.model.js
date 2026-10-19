import mongoose from 'mongoose';

/**
 * WhatsApp templates the admin panel suggests in its template box.
 *
 * yourbulksms does not expose the business account's template list over the
 * API, so the list builds itself: every template that sends successfully (a
 * test or a broadcast) is remembered here with its language and how many
 * {{n}} values it took. One list for every vertical: the WhatsApp number is shared.
 */
const whatsappTemplateSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        language: { type: String, required: true, trim: true, default: 'en' },
        variables: { type: Number, min: 0, max: 10, default: 0 },
        /** Values from the last successful send, as a hint for the next one. */
        lastValues: { type: [String], default: [] },
        /** Sent with a header image last time, i.e. an image template. */
        hasImage: { type: Boolean, default: false },
        lastHeaderImage: { type: String, default: '' },
        lastUsedAt: { type: Date, default: Date.now },
        useCount: { type: Number, default: 0 }
    },
    { collection: 'food_whatsapp_templates', timestamps: true }
);

whatsappTemplateSchema.index({ name: 1, language: 1 }, { unique: true });

export const WhatsAppTemplate = mongoose.model('WhatsAppTemplate', whatsappTemplateSchema);
