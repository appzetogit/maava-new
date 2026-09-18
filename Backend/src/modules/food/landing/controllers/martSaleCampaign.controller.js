import mongoose from 'mongoose';

import { MartSaleCampaign } from '../models/martSaleCampaign.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';

/** Day-precision label, e.g. '30TH NOV, 2025 - 7TH DEC, 2025'. */
const ordinal = (n) => {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}TH`;
    return `${n}${['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH'}`;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const stampDate = (d) => `${ordinal(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;

/**
 * The date strip the banner shows. An explicit `dateLabel` always wins so an
 * admin can write their own copy; otherwise it is derived from the window, and
 * an unscheduled campaign simply has no strip rather than a stale one.
 */
const buildDateLabel = (campaign) => {
    if (campaign.dateLabel) return campaign.dateLabel;
    const { startDate, endDate } = campaign;
    if (startDate && endDate) return `${stampDate(new Date(startDate))} - ${stampDate(new Date(endDate))}`;
    if (startDate) return `FROM ${stampDate(new Date(startDate))}`;
    if (endDate) return `UNTIL ${stampDate(new Date(endDate))}`;
    return '';
};

const toPublicDto = (campaign, products) => ({
    id: campaign._id,
    categoryId: campaign.categoryId || null,
    themeColor: campaign.themeColor || '',
    accentColor: campaign.accentColor || '',
    searchHint: campaign.searchHint || '',
    title: campaign.title,
    dateLabel: buildDateLabel(campaign),
    bannerImageUrl: campaign.bannerImageUrl || '',
    dealLabel: campaign.dealLabel || '',
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    tiles: (campaign.tiles || [])
        .slice()
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((t) => ({
            title: t.title,
            badgeText: t.badgeText || '',
            emojis: t.emojis || '',
            imageUrl: t.imageUrl || '',
            categoryId: t.categoryId || null
        })),
    products
});

/**
 * The live campaign for the Mart home banner, or `data: null` when none is
 * scheduled — the app keeps its existing backend-ranked flash-sale behaviour in
 * that case rather than showing an empty banner.
 */
/**
 * Every live campaign: the default one plus one per header category.
 *
 * All of them are returned in a single call so switching category in the app is
 * instant — re-fetching per tap would put a network round trip in the middle of
 * a theme transition.
 *
 * `data.campaign` repeats the default so older builds, which expect a single
 * object, keep working.
 */
export const getPublicMartSaleCampaignController = async (_req, res, next) => {
    try {
        const live = await MartSaleCampaign.findLive().lean();
        if (!live.length) return sendResponse(res, 200, 'No active campaign', null);

        const ids = live
            .flatMap((c) => c.productIds || [])
            .filter((id) => mongoose.Types.ObjectId.isValid(id));

        // Only products still sellable: a campaign must not advertise something
        // delisted or out of stock since it was configured.
        // Deal-card products obey the shopper's zone like every other product
        // read. Without this the sale banner advertised items from a store that
        // does not serve them, and tapping through led to an empty listing.
        const zoneId = _req.query?.zoneId;
        const sellerFilter = { status: 'approved' };
        if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
            sellerFilter.zoneId = new mongoose.Types.ObjectId(zoneId);
        }
        const zoneSellerIds = (await FoodRestaurant.find(sellerFilter).select('_id').lean())
            .map((seller) => seller._id);

        const products = ids.length
            ? await FoodItem.find({
                  _id: { $in: ids },
                  isAvailable: true,
                  restaurantId: { $in: zoneSellerIds }
              })
                  .select('_id name image images price mrp stockQty packSize rating')
                  .lean()
            : [];
        const byId = new Map(products.map((p) => [String(p._id), p]));

        const campaigns = live.map((c) =>
            toPublicDto(
                c,
                (c.productIds || []).map((id) => byId.get(String(id))).filter(Boolean)
            )
        );
        const fallback = campaigns.find((c) => !c.categoryId) || campaigns[0];

        return sendResponse(res, 200, 'Campaigns fetched', {
            campaigns,
            campaign: fallback
        });
    } catch (error) {
        next(error);
    }
};

export const listMartSaleCampaignsController = async (_req, res, next) => {
    try {
        // Products come back populated so the admin panel can show what it has
        // saved — a bare ObjectId tells whoever is editing nothing about which
        // product is in the deal card.
        const rows = await MartSaleCampaign.find({})
            .populate('productIds', 'name image images price mrp')
            .sort({ sortOrder: 1, createdAt: -1 })
            .lean();
        return sendResponse(res, 200, 'Campaigns fetched', rows);
    } catch (error) {
        next(error);
    }
};

export const createMartSaleCampaignController = async (req, res, next) => {
    try {
        const title = String(req.body?.title || '').trim();
        if (!title) throw new ValidationError('Title is required');
        const created = await MartSaleCampaign.create({ ...req.body, title });
        return sendResponse(res, 201, 'Campaign created', created);
    } catch (error) {
        next(error);
    }
};

export const updateMartSaleCampaignController = async (req, res, next) => {
    try {
        const updated = await MartSaleCampaign.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!updated) throw new NotFoundError('Campaign not found');
        return sendResponse(res, 200, 'Campaign updated', updated);
    } catch (error) {
        next(error);
    }
};

export const deleteMartSaleCampaignController = async (req, res, next) => {
    try {
        const deleted = await MartSaleCampaign.findByIdAndDelete(req.params.id);
        if (!deleted) throw new NotFoundError('Campaign not found');
        return sendResponse(res, 200, 'Campaign deleted', { id: req.params.id });
    } catch (error) {
        next(error);
    }
};
