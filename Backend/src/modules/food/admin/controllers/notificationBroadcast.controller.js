import { sendResponse, sendError } from '../../../../utils/response.js';
import {
    createBroadcastNotification,
    getBroadcastNotifications,
    deleteBroadcastNotification
} from '../services/notificationBroadcast.service.js';
import { isWhatsAppConfigured, sendWhatsAppTemplate } from '../../../../core/whatsapp/whatsapp.service.js';

export const createBroadcastNotificationController = async (req, res) => {
    try {
        const data = await createBroadcastNotification({
            body: req.body,
            adminId: req.user?.userId
        });
        return sendResponse(res, 201, 'Broadcast notification created successfully', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to create broadcast notification');
    }
};

export const getBroadcastNotificationsController = async (req, res) => {
    try {
        const data = await getBroadcastNotifications({
            page: req.query?.page,
            limit: req.query?.limit
        });
        return sendResponse(res, 200, 'Broadcast notifications fetched successfully', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to fetch broadcast notifications');
    }
};

/** POST /admin/notifications/whatsapp/test - one template to one number, to check it before a campaign. */
export const testWhatsAppController = async (req, res) => {
    try {
        const { phone, template, language, bodyParams } = req.body || {};
        if (!isWhatsAppConfigured()) {
            return sendError(res, 400, 'WhatsApp is not configured on the server');
        }
        const result = await sendWhatsAppTemplate({ phone, template: String(template || '').trim(), language, bodyParams });
        if (!result.ok) return sendError(res, 400, `WhatsApp send failed: ${result.error}`);
        return sendResponse(res, 200, 'WhatsApp test message sent', { to: result.to, messageId: result.messageId });
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to send WhatsApp test');
    }
};

/** GET /admin/notifications/whatsapp/status - whether the panel can offer WhatsApp. */
export const whatsAppStatusController = async (_req, res) =>
    sendResponse(res, 200, 'WhatsApp status', { configured: isWhatsAppConfigured() });

export const deleteBroadcastNotificationController = async (req, res) => {
    try {
        const data = await deleteBroadcastNotification(req.params?.id);
        return sendResponse(res, 200, 'Broadcast notification deleted successfully', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to delete broadcast notification');
    }
};
