import { searchUnified, searchProducts, getAdminCategories } from '../services/search.service.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { getStoreStatus } from '../services/storeStatus.service.js';
import { findZoneForPoint } from '../../shared/zoneServiceability.js';

/** Is the Mart open for this zone? GET /quick/search/store-status?zoneId= */
export const storeStatusController = async (req, res, next) => {
    try {
        // The website sends where the customer is rather than a zone id; the
        // Mart zone is resolved here with the same polygon test the app uses.
        let zoneId = req.query.zoneId;
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        // The shopper's own position, when sent, also gives the delivery estimate.
        const point = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        if (!zoneId && point) {
            const zone = await findZoneForPoint(lat, lng);
            if (!zone) {
                return sendResponse(res, 200, 'Outside delivery zones', { hasStores: false, isOpen: false, reason: 'no-zone', opensAt: null });
            }
            zoneId = String(zone._id);
        }
        const data = await getStoreStatus({ zoneId, point });
        return sendResponse(res, 200, data.isOpen ? 'Store is open' : 'Store is closed', data);
    } catch (error) {
        next(error);
    }
};

/**
 * Unified Search for Restaurants, Food Items, and Cuisines
 */
export const searchController = async (req, res, next) => {
    try {
        const { q, lat, lng, radiusKm, categoryId, minRating, maxDeliveryTime, isVeg, page, limit, zoneId, strictZone } = req.query;

        const results = await searchUnified({
            q,
            lat,
            lng,
            radiusKm,
            categoryId,
            minRating,
            maxDeliveryTime,
            isVeg,
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 20,
            zoneId,
            strictZone
        });

        return sendResponse(res, 200, 'Search results fetched successfully', results.data);
    } catch (error) {
        next(error);
    }
};

/**
 * Product search — returns items, not the sellers that stock them.
 */
export const searchProductsController = async (req, res, next) => {
    try {
        const { q, categoryId, zoneId, isVeg, inStockOnly, page, limit } = req.query;

        const results = await searchProducts({
            q,
            categoryId,
            zoneId,
            isVeg,
            inStockOnly,
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 20
        });

        return sendResponse(res, 200, 'Products fetched successfully', results);
    } catch (error) {
        next(error);
    }
};

/**
 * Fetch List of Admin-only Categories
 */
export const listAdminCategoriesController = async (req, res, next) => {
    try {
        const { zoneId } = req.query;
        const categories = await getAdminCategories({ zoneId });
        
        return sendResponse(res, 200, 'Admin categories fetched successfully', { categories });
    } catch (error) {
        next(error);
    }
};
