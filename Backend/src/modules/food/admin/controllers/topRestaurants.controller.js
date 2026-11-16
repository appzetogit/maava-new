import { sendResponse } from '../../../../utils/response.js';
import {
    listTopRestaurantSlots,
    createTopRestaurantSlot,
    updateTopRestaurantSlot,
    deleteTopRestaurantSlot,
} from '../services/topRestaurants.service.js';

export async function listTopRestaurantSlotsController(req, res, next) {
    try {
        return sendResponse(res, 200, 'Top restaurant slots fetched', await listTopRestaurantSlots(req.query));
    } catch (error) {
        next(error);
    }
}

export async function createTopRestaurantSlotController(req, res, next) {
    try {
        const slot = await createTopRestaurantSlot(req.body || {});
        return sendResponse(res, 201, 'Top restaurant slot created', { slot });
    } catch (error) {
        next(error);
    }
}

export async function updateTopRestaurantSlotController(req, res, next) {
    try {
        const slot = await updateTopRestaurantSlot(req.params.id, req.body || {});
        return sendResponse(res, 200, 'Top restaurant slot updated', { slot });
    } catch (error) {
        next(error);
    }
}

export async function deleteTopRestaurantSlotController(req, res, next) {
    try {
        return sendResponse(res, 200, 'Top restaurant slot deleted', await deleteTopRestaurantSlot(req.params.id));
    } catch (error) {
        next(error);
    }
}
