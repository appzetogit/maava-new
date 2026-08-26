import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const rangeSchema = z.object({
    min: z.number().min(0),
    max: z.number().min(0),
    fee: z.number().min(0),
    deliveryBoyPerKm: z.number().min(0).optional().default(0),
    deliveryBoyBasePay: z.number().min(0).optional().default(0)
});

const feeSettingsUpsertSchema = z.object({
    deliveryFee: z.number().min(0).nullable().optional(),
    deliveryFeeRanges: z.array(rangeSchema).optional(),
    platformFee: z.number().min(0).nullable().optional(),
    freeDeliveryThreshold: z.number().min(0).nullable().optional(),
    tipPresets: z.array(z.number().min(0).max(1000)).max(6).optional(),
    quickDeliveryFee: z.number().min(0).nullable().optional(),
    gstRate: z.number().min(0).max(100).nullable().optional(),
    isActive: z.boolean().optional()
});

export const validateFeeSettingsUpsertDto = (body) => {
    const normalized = {
        deliveryFee:
            body?.deliveryFee === null
                ? null
                : body?.deliveryFee !== undefined
                    ? Number(body.deliveryFee)
                    : undefined,
        deliveryFeeRanges: Array.isArray(body?.deliveryFeeRanges)
            ? body.deliveryFeeRanges.map((r) => ({
                min: Number(r?.min),
                max: Number(r?.max),
                fee: Number(r?.fee),
                deliveryBoyPerKm: Number(r?.deliveryBoyPerKm || 0),
                deliveryBoyBasePay: Number(r?.deliveryBoyBasePay || 0)
            }))
            : undefined,
        platformFee:
            body?.platformFee === null ? null : body?.platformFee !== undefined ? Number(body.platformFee) : undefined,
        quickDeliveryFee:
            body?.quickDeliveryFee === null
                ? null
                : body?.quickDeliveryFee !== undefined
                    ? Number(body.quickDeliveryFee)
                    : undefined,
        gstRate:
            body?.gstRate === null ? null : body?.gstRate !== undefined ? Number(body.gstRate) : undefined,
        // Normalised like every sibling: the schema alone is not enough, this
        // object is built key by key and anything missing here is dropped
        // before the parse ever sees it.
        freeDeliveryThreshold:
            body?.freeDeliveryThreshold === null
                ? null
                : body?.freeDeliveryThreshold !== undefined
                    ? Number(body.freeDeliveryThreshold)
                    : undefined,
        // Sorted and de-duplicated so the card's chips read low -> high whatever
        // order they were typed in; non-numeric and negative entries are dropped
        // rather than becoming NaN chips. Capped to match MAX_DELIVERY_TIP, or
        // the panel could offer an amount the order endpoint then rejects.
        tipPresets: Array.isArray(body?.tipPresets)
            ? [...new Set(
                body.tipPresets
                    .map((v) => Number(v))
                    .filter((v) => Number.isFinite(v) && v > 0),
            )].sort((a, b) => a - b)
            : undefined,
        isActive: body?.isActive !== undefined ? Boolean(body.isActive) : undefined
    };

    const result = feeSettingsUpsertSchema.safeParse(normalized);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    // Validate ranges: min < max, non-overlapping after sorting
    const ranges = Array.isArray(result.data.deliveryFeeRanges) ? result.data.deliveryFeeRanges : undefined;
    if (ranges) {
        const sorted = [...ranges].sort((a, b) => a.min - b.min);
        for (const r of sorted) {
            if (r.min >= r.max) {
                throw new ValidationError('Each range must have min less than max');
            }
        }
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const cur = sorted[i];
            if (cur.min < prev.max) {
                throw new ValidationError('Delivery fee ranges must not overlap');
            }
        }
        result.data.deliveryFeeRanges = sorted;
    }

    return result.data;
};

