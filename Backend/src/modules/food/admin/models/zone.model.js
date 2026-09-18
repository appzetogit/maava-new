import mongoose from 'mongoose';
import { verticalPlugin } from '../../../../core/vertical/verticalScope.js';

const coordinateSchema = new mongoose.Schema(
    {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
    },
    { _id: false }
);

const zoneSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        zoneName: {
            type: String,
            trim: true
        },
        country: {
            type: String,
            required: true,
            trim: true,
            default: 'India',
            index: true
        },
        /** Display label e.g. city/area; optional, can mirror name */
        serviceLocation: {
            type: String,
            trim: true
        },
        unit: {
            type: String,
            enum: ['kilometer', 'miles'],
            default: 'kilometer'
        },
        coordinates: {
            type: [coordinateSchema],
            required: true,
            validate: {
                validator(v) {
                    return Array.isArray(v) && v.length >= 3;
                },
                message: 'Zone must have at least 3 coordinates (polygon).'
            }
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        collection: 'food_zones',
        timestamps: true
    }
);

zoneSchema.index({ isActive: 1, name: 1 });
zoneSchema.index({ country: 1, name: 1 });

/**
 * Zones are per vertical.
 *
 * They were one shared collection, so the Restaurant and Mart panels listed
 * the same rows -- and deleting a zone from one deleted it from the other,
 * because it was literally the same document. A delivery area for restaurants
 * and one for Mart are separate business decisions and have to be editable
 * apart.
 *
 * Every existing zone was in use by BOTH verticals, so scoping alone would
 * have stranded whichever side did not get the row.
 * scripts/split-zones-by-vertical.mjs keeps each original for food and gives
 * quick a duplicate, repointing quick's sellers. It must run BEFORE this
 * plugin ships, or the unstamped rows become invisible to every query.
 */
zoneSchema.plugin(verticalPlugin);
zoneSchema.index({ vertical: 1, isActive: 1 });

export const FoodZone = mongoose.model('FoodZone', zoneSchema);
