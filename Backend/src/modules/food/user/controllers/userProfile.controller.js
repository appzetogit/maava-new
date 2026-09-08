import { sendResponse } from '../../../../utils/response.js';
import { ForbiddenError } from '../../../../core/auth/errors.js';
import { validateUserProfileUpdateDto } from '../../../../dtos/food/userProfileUpdate.dto.js';
import {
    getCurrentUserProfile,
    updateCurrentUserProfile,
    uploadCurrentUserProfileImage,
    deleteCurrentUserAccount
} from '../services/userProfile.service.js';

export const getCurrentUserProfileController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await getCurrentUserProfile(userId);
        return sendResponse(res, 200, 'Profile retrieved successfully', result);
    } catch (error) {
        next(error);
    }
};

export const updateCurrentUserProfileController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const body = validateUserProfileUpdateDto(req.body);
        const result = await updateCurrentUserProfile(userId, body);
        return sendResponse(res, 200, 'Profile updated successfully', result);
    } catch (error) {
        next(error);
    }
};

export const uploadCurrentUserProfileImageController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await uploadCurrentUserProfileImage(userId, req.file);
        return sendResponse(res, 200, 'Profile image uploaded successfully', result);
    } catch (error) {
        next(error);
    }
};

export const deleteCurrentUserAccountController = async (req, res, next) => {
    try {
        // Refused server-side as well as hidden in the apps. Hiding the button
        // only stops the people who use the button; the endpoint is a plain
        // DELETE that an old build, a stale web tab or anything else still
        // reaches. Account deletion is irreversible, so the switch has to hold
        // at the place that does the deleting.
        const { isFeatureEnabled, FEATURE_KEYS } = await import(
            '../../admin/services/featureSettings.service.js'
        );
        if (!(await isFeatureEnabled(FEATURE_KEYS.ACCOUNT_DELETION, true))) {
            throw new ForbiddenError(
                'Account deletion is currently unavailable. Please contact support.'
            );
        }

        const userId = req.user?.userId;
        const result = await deleteCurrentUserAccount(userId);
        return sendResponse(res, 200, 'Account deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

