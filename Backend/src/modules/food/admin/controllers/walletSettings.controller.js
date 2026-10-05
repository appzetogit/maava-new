import { sendResponse } from '../../../../utils/response.js';
import { getWalletTopupLimits, saveWalletTopupLimits } from '../../user/services/walletSettings.service.js';

export async function getWalletSettingsController(_req, res, next) {
    try {
        const walletSettings = await getWalletTopupLimits();
        return sendResponse(res, 200, 'Wallet settings fetched', { walletSettings });
    } catch (e) { next(e); }
}

export async function updateWalletSettingsController(req, res, next) {
    try {
        const walletSettings = await saveWalletTopupLimits(req.body || {});
        return sendResponse(res, 200, 'Wallet settings saved', { walletSettings });
    } catch (e) { next(e); }
}
