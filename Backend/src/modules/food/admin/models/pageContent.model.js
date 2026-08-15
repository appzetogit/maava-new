import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const featureSchema = new mongoose.Schema(
    {
        icon: { type: String, default: 'Heart' },
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        color: { type: String, default: '' },
        bgColor: { type: String, default: '' },
        order: { type: Number, default: 0 }
    },
    { _id: false }
);

const legalPageSchema = new mongoose.Schema(
    {
        title: { type: String, default: '' },
        content: { type: String, default: '' }, // stored as HTML string
        email: { type: String, default: '' },
        mobile: { type: String, default: '' }
    },
    { _id: false }
);

const aboutPageSchema = new mongoose.Schema(
    {
        appName: { type: String, default: 'Switcheats' },
        version: { type: String, default: '1.0.0' },
        description: { type: String, default: '' },
        logo: { type: String, default: '' },
        features: { type: [featureSchema], default: [] },
        stats: { type: Array, default: [] }
    },
    { _id: false }
);

const pageContentSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            index: true,
            enum: ['terms', 'privacy', 'refund', 'shipping', 'cancellation', 'about', 'support']
        },
        module: {
            type: String,
            required: true,
            enum: ['USER', 'DELIVERY', 'RESTAURANT', 'ALL'],
            default: 'ALL'
        },
        legal: { type: legalPageSchema, default: undefined },
        about: { type: aboutPageSchema, default: undefined },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
        updatedByRole: { type: String, default: 'ADMIN' }
    },
    { collection: 'food_page_contents', timestamps: true }
);

pageContentSchema.plugin(verticalPlugin);

/**
 * CMS pages are per vertical: a grocery app's terms, privacy policy and about
 * page are not the restaurant app's, and serving one for the other is a legal
 * problem rather than a cosmetic one.
 *
 * ponytail: the legacy unique index `key_1_module_1` still exists on deployed
 * clusters and must be dropped before the two databases merge -- until then
 * it rejects the second vertical's copy of any given key. Nothing collides
 * while each database holds one vertical, so the drop belongs with the phase 5
 * migration.
 */
pageContentSchema.index({ vertical: 1, key: 1, module: 1 }, { unique: true });

export const FoodPageContent = mongoose.model('FoodPageContent', pageContentSchema);

