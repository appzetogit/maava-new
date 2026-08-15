import express from 'express';
import authRoutes from '../core/auth/auth.routes.js';
import deliveryRoutes from '../modules/food/delivery/routes/delivery.routes.js';
import restaurantRoutes from '../modules/food/restaurant/routes/restaurant.routes.js';
import landingRoutes from '../modules/food/landing/routes/landing.routes.js';
import { getPublicDiningCategories, getPublicDiningRestaurants } from '../modules/food/dining/controllers/diningPublic.controller.js';
import uploadRoutes from '../modules/uploads/routes/upload.routes.js';
import restaurantAdminRoutes from '../modules/food/admin/routes/admin.routes.js';
import userRoutes from '../modules/food/user/routes/user.routes.js';
import orderUserRoutes from '../modules/food/orders/routes/order.routes.user.js';
import paymentRoutes from '../core/payments/payment.routes.js';
import fcmRoutes from '../core/notifications/fcm.routes.js';
import notificationRoutes from '../core/notifications/notification.routes.js';
import { authMiddleware } from '../core/auth/auth.middleware.js';
import * as businessSettingsController from '../modules/food/admin/controllers/businessSettings.controller.js';
import * as adminController from '../modules/food/admin/controllers/admin.controller.js';
import { requireRoles } from '../core/roles/role.middleware.js';
import { getQueuesController } from '../controllers/admin.controller.js';
import webhookRoutes from '../core/payments/routes/webhook.routes.js'; // ✅ NEW
import searchRoutes from '../modules/food/search/routes/search.routes.js';
import chatRoutes from '../modules/food/chat/routes/chat.routes.js';
import { getCashbackSettingsPublicController } from '../modules/food/user/controllers/cashback.controller.js';
import { config } from '../config/env.js';
import { getRateLimitSummary } from '../middleware/rateLimit.js';
import { withVertical, withAllVerticals } from '../core/vertical/verticalScope.js';

const router = express.Router();

router.get('/v1/health', (req, res) => {
    res.status(200).json({ status: 'UP', message: 'Server is healthy' });
});

if (config.nodeEnv !== 'production') {
    router.get('/v1/health/rate-limit', (_req, res) => {
        res.status(200).json({ success: true, data: getRateLimitSummary() });
    });
}

/**
 * Everything scoped to one vertical.
 *
 * Extracted from the /v1/food/* mounts unchanged and in the same order --
 * express matches in registration order, and the /admin/*\/public routes must
 * stay ahead of the protected /admin block that would otherwise swallow them.
 *
 * Mounted twice below. One router object rather than two copies of the table:
 * duplicating it would mean every future route had to be added in both places,
 * and one of them would eventually be forgotten.
 */
const verticalScopedRoutes = express.Router();

verticalScopedRoutes.use('/auth', authRoutes);
/**
 * Rider routes run across BOTH verticals.
 *
 * The fleet is shared -- one rider takes a grocery run at 4pm and a dinner
 * order at 8pm -- so their active job, earnings, history and availability are
 * cross-vertical questions. Scoped to the mount prefix instead, a rider signed
 * in through the food app would not see the grocery order they are currently
 * carrying.
 *
 * Both prefixes still resolve, so neither rider app changes its base URL.
 */
verticalScopedRoutes.use('/delivery', withAllVerticals(), deliveryRoutes);
verticalScopedRoutes.use('/restaurant', restaurantRoutes);
// Landing & hero-banners (paths start with /hero-banners/...)
verticalScopedRoutes.use('/', landingRoutes);
verticalScopedRoutes.use('/search', searchRoutes);
verticalScopedRoutes.get('/dining/categories/public', getPublicDiningCategories);
verticalScopedRoutes.get('/dining/restaurants/public', getPublicDiningRestaurants);

// Mark business-settings/public as truly public (must be before protected admin block)
verticalScopedRoutes.get('/admin/business-settings/public', businessSettingsController.getBusinessSettings);
verticalScopedRoutes.get('/admin/power-scanning/public', businessSettingsController.getPowerScanningSettings);
verticalScopedRoutes.get('/admin/restaurant-subscription-settings/public', adminController.getRestaurantSubscriptionSettings);
verticalScopedRoutes.get('/admin/feature-settings/public', adminController.getFeatureSettings);
verticalScopedRoutes.get('/admin/fee-settings/public', adminController.getFeeSettings);
verticalScopedRoutes.get('/admin/cashback-settings/public', getCashbackSettingsPublicController);

verticalScopedRoutes.use('/admin', authMiddleware, requireRoles('ADMIN'), restaurantAdminRoutes);
verticalScopedRoutes.use('/user', authMiddleware, requireRoles('USER'), userRoutes);
verticalScopedRoutes.use('/notifications', authMiddleware, requireRoles('USER', 'RESTAURANT', 'DELIVERY_PARTNER'), notificationRoutes);
verticalScopedRoutes.use('/chat', authMiddleware, requireRoles('USER', 'RESTAURANT', 'DELIVERY_PARTNER', 'ADMIN'), chatRoutes);
verticalScopedRoutes.use('/orders', authMiddleware, requireRoles('USER'), orderUserRoutes);
verticalScopedRoutes.use('/payments', authMiddleware, paymentRoutes);

// The existing Food apps keep this prefix and see byte-identical behaviour.
router.use('/v1/food', withVertical('food'), verticalScopedRoutes);
// The quick-commerce apps change one constant: their base URL.
router.use('/v1/quick', withVertical('quick'), verticalScopedRoutes);

// Backward-compatible auth routes (legacy). Auth is shared across verticals --
// one phone, one login, one identity -- so this needs no scope.
router.use('/v1/auth', authRoutes);
router.use('/v1/uploads', uploadRoutes);
router.use('/v1/payments/webhook', webhookRoutes); // ✅ NEW: Public Webhook
router.use('/v1/fcm-tokens', fcmRoutes);
router.use('/fcm-tokens', fcmRoutes);

router.get('/v1/admin/queues', authMiddleware, requireRoles('ADMIN'), getQueuesController);

export default router;
