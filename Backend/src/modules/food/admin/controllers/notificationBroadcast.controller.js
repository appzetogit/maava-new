import { sendResponse, sendError } from '../../../../utils/response.js';
import {
    createBroadcastNotification,
    getBroadcastNotifications,
    deleteBroadcastNotification
} from '../services/notificationBroadcast.service.js';
import {
    isWhatsAppConfigured,
    sendWhatsAppTemplate,
    rememberWhatsAppTemplate,
    listWhatsAppTemplates,
    forgetWhatsAppTemplate,
    normalizeHeaderImage
} from '../../../../core/whatsapp/whatsapp.service.js';
import { saveJpegImage } from '../../../../services/storage.service.js';
import { createWhatsAppCampaign, listWhatsAppCampaigns } from '../services/whatsappCampaign.service.js';

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
        const name = String(template || '').trim();
        const rawImage = String(req.body?.headerImage || '').trim();
        const headerImage = normalizeHeaderImage(rawImage);
        if (rawImage && !headerImage) return sendError(res, 400, 'Header image must be a public https:// link');
        const result = await sendWhatsAppTemplate({ phone, template: name, language, bodyParams, headerImage });
        if (!result.ok) return sendError(res, 400, `WhatsApp send failed: ${result.error}`);
        await rememberWhatsAppTemplate({ template: name, language, bodyParams, headerImage });
        return sendResponse(res, 200, 'WhatsApp test message sent', { to: result.to, messageId: result.messageId });
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to send WhatsApp test');
    }
};

/** GET /admin/notifications/whatsapp/templates - templates that sent successfully before, newest first. */
export const listWhatsAppTemplatesController = async (_req, res) => {
    try {
        const templates = await listWhatsAppTemplates();
        return sendResponse(res, 200, 'WhatsApp templates', { templates });
    } catch (error) {
        return sendError(res, 500, error.message || 'Failed to load WhatsApp templates');
    }
};

/** DELETE /admin/notifications/whatsapp/templates/:id - stop suggesting a template. */
export const forgetWhatsAppTemplateController = async (req, res) => {
    try {
        const removed = await forgetWhatsAppTemplate(req.params?.id);
        if (!removed) return sendError(res, 404, 'Template suggestion not found');
        return sendResponse(res, 200, 'Template suggestion removed', {});
    } catch (error) {
        return sendError(res, 500, error.message || 'Failed to remove template suggestion');
    }
};

/** POST /admin/notifications/whatsapp/campaigns - start a WhatsApp send (runs in the background). */
export const createWhatsAppCampaignController = async (req, res) => {
    try {
        if (!isWhatsAppConfigured()) return sendError(res, 400, 'WhatsApp is not configured on the server');
        const data = await createWhatsAppCampaign({ body: req.body, adminId: req.user?.userId });
        return sendResponse(res, 201, 'WhatsApp messages are being sent', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to start WhatsApp send');
    }
};

/** GET /admin/notifications/whatsapp/campaigns - past WhatsApp sends, newest first. */
export const listWhatsAppCampaignsController = async (req, res) => {
    try {
        const data = await listWhatsAppCampaigns({ page: req.query?.page, limit: req.query?.limit });
        return sendResponse(res, 200, 'WhatsApp campaigns', data);
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message || 'Failed to load WhatsApp campaigns');
    }
};

/**
 * POST /admin/notifications/whatsapp/image (multipart "file") - store a header
 * image as JPEG (WhatsApp rejects WebP, which the normal upload produces) and
 * return an absolute https link WhatsApp can fetch.
 */
export const uploadWhatsAppImageController = async (req, res) => {
    try {
        if (!req.file) return sendError(res, 400, 'Choose an image to upload');
        const saved = await saveJpegImage(req.file, 'whatsapp/headers');
        let url = saved.url;
        if (url.startsWith('/')) {
            // Relative /uploads/... path: serve it from the site the admin is using.
            const origin = String(req.headers.origin || '');
            const base = /^https:\/\/[a-z0-9.-]+$/i.test(origin) ? origin : `https://${req.get('host')}`;
            url = `${base}${url}`;
        }
        return sendResponse(res, 201, 'Image uploaded', { url, size: saved.size });
    } catch (error) {
        return sendError(res, error.statusCode || 400, error.message || 'Image upload failed');
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
