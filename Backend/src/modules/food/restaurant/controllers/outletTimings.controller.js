import { sendResponse } from '../../../../utils/response.js';
import { getOutletTimingsForRestaurant, upsertOutletTimingsForRestaurant } from '../services/outletTimings.service.js';

export const getOutletTimingsByRestaurantIdController = async (req, res, next) => {
    try {
        const data = await getOutletTimingsForRestaurant(req.params.id);
        return sendResponse(res, 200, 'Outlet timings fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

export const getCurrentRestaurantOutletTimingsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const data = await getOutletTimingsForRestaurant(restaurantId);
        return sendResponse(res, 200, 'Outlet timings fetched successfully', data);
    } catch (error) {
        next(error);
    }
};

/** Admin setting a store's hours for it: PUT /admin/restaurants/:id/outlet-timings */
export const upsertOutletTimingsByRestaurantIdController = async (req, res, next) => {
    try {
        const data = await upsertOutletTimingsForRestaurant(req.params.id, req.body?.outletTimings);
        return sendResponse(res, 200, 'Outlet timings saved successfully', data);
    } catch (error) {
        next(error);
    }
};

export const upsertCurrentRestaurantOutletTimingsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const data = await upsertOutletTimingsForRestaurant(restaurantId, req.body?.outletTimings);
        return sendResponse(res, 200, 'Outlet timings saved successfully', data);
    } catch (error) {
        next(error);
    }
};

