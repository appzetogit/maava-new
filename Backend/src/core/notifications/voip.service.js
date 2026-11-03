import crypto from 'crypto';
import { existsSync, readFileSync } from 'fs';
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import { resolve } from 'path';
import { FoodRestaurant } from '../../modules/food/restaurant/models/restaurant.model.js';
import { logger } from '../../utils/logger.js';

/**
 * iOS PushKit VoIP pushes, sent straight to APNs over HTTP/2.
 *
 * A VoIP push wakes the iOS app even when it was killed, and the app reports it
 * to CallKit, so a new order rings like an incoming phone call on the lock
 * screen. Android does not use this: its native order card already rings.
 *
 * Only restaurants register VoIP tokens for now. Each owner type gets its own
 * APNs topic (the app's bundle ID + ".voip") because each is its own app.
 */

const OWNER_MODELS = {
    RESTAURANT: FoodRestaurant,
};

const OWNER_TOPIC_ENV = {
    RESTAURANT: 'APNS_VOIP_TOPIC_RESTAURANT',
};

const APNS_AUTHORITY = {
    production: 'https://api.push.apple.com',
    sandbox: 'https://api.sandbox.push.apple.com',
};

/** How long the phone rings. The app passes this to CallKit as the call timeout. */
export const VOIP_RING_DURATION_MS = 45000;

/** Keep only a few recent devices per owner. */
const MAX_PUSH_DEVICES = 10;

/** One HTTP/2 connection per APNs environment. */
const apnsClients = new Map();
let apnsJwtToken = null;
let apnsJwtTokenExpiry = 0;

const sanitizeString = (value) => String(value ?? '').trim().replace(/^["']|["']$/g, '');

const normalizeOwnerType = (ownerType) => String(ownerType || '').trim().toUpperCase();

const getOwnerModel = (ownerType) => OWNER_MODELS[normalizeOwnerType(ownerType)] || null;

export const isVoipSupportedOwner = (ownerType) => Boolean(getOwnerModel(ownerType));

const normalizeVoipTopic = (topic) => {
    const normalized = sanitizeString(topic);
    if (!normalized) return '';
    return normalized.endsWith('.voip') ? normalized : `${normalized}.voip`;
};

const getVoipTopic = (ownerType) => {
    const envName = OWNER_TOPIC_ENV[normalizeOwnerType(ownerType)];
    return normalizeVoipTopic(envName ? process.env[envName] : '');
};

const isApnsProduction = () =>
    String(process.env.APNS_PRODUCTION ?? 'true').toLowerCase() === 'true';

const getApnsAuthority = () => (isApnsProduction() ? APNS_AUTHORITY.production : APNS_AUTHORITY.sandbox);

const getOtherApnsAuthority = () => (isApnsProduction() ? APNS_AUTHORITY.sandbox : APNS_AUTHORITY.production);

const resolveKeyPath = () => {
    const keyPathValue = sanitizeString(process.env.APNS_VOIP_P8_PATH);
    if (!keyPathValue) return null;
    return [keyPathValue, resolve(process.cwd(), keyPathValue)].find((candidate) => existsSync(candidate)) || null;
};

/** True when every setting needed to reach APNs is present. Sends are skipped otherwise. */
const isVoipConfigured = (ownerType) =>
    Boolean(
        sanitizeString(process.env.APNS_TEAM_ID) &&
        sanitizeString(process.env.APNS_KEY_ID) &&
        resolveKeyPath() &&
        getVoipTopic(ownerType)
    );

const getApnsJwtToken = () => {
    const now = Math.floor(Date.now() / 1000);
    if (apnsJwtToken && apnsJwtTokenExpiry > now) return apnsJwtToken;

    const teamId = sanitizeString(process.env.APNS_TEAM_ID);
    const keyId = sanitizeString(process.env.APNS_KEY_ID);
    const keyPath = resolveKeyPath();
    if (!teamId || !keyId || !keyPath) {
        throw new Error('APNS_TEAM_ID, APNS_KEY_ID and APNS_VOIP_P8_PATH must be set for VoIP pushes.');
    }

    apnsJwtToken = jwt.sign({ iss: teamId, iat: now }, readFileSync(keyPath, 'utf8'), {
        algorithm: 'ES256',
        header: { alg: 'ES256', kid: keyId },
    });
    // Apple accepts a provider token for up to 60 minutes; refresh at ~50.
    apnsJwtTokenExpiry = now + 3000;
    return apnsJwtToken;
};

const getApnsClient = (authority) => {
    const cached = apnsClients.get(authority);
    if (cached && !cached.destroyed && !cached.closed) return cached;

    const client = http2.connect(authority);
    client.on('error', (error) => {
        logger.warn(`[VoIP] APNs connection error: ${error?.message || error}`);
    });
    client.on('close', () => {
        if (apnsClients.get(authority) === client) apnsClients.delete(authority);
    });
    // Don't let an idle APNs connection keep the process alive on shutdown.
    client.unref();

    apnsClients.set(authority, client);
    return client;
};

const APNS_REASON_HINTS = {
    BadDeviceToken: 'Token was refused by this APNs environment; it is removed if the other one refuses it too.',
    DeviceTokenNotForTopic: 'Token belongs to a different app than the topic (bundle ID) being sent to.',
    TopicDisallowed: 'Topic (bundle ID) is not allowed for this .p8 key/team.',
    InvalidProviderToken: 'JWT rejected: wrong APNS_KEY_ID, APNS_TEAM_ID, or .p8 file does not match the team.',
    ExpiredProviderToken: 'JWT expired; it is regenerated on the next send.',
    Unregistered: 'App was uninstalled or the token is no longer valid; it is removed.',
    PayloadTooLarge: 'Payload exceeds the APNs size limit.',
    TooManyRequests: 'APNs rate limit hit.',
};

const describeApnsReason = (responseBody) => {
    try {
        const reason = JSON.parse(responseBody || '{}').reason || '';
        return { reason, hint: APNS_REASON_HINTS[reason] || 'See the Apple APNs error reference.' };
    } catch {
        return { reason: responseBody || 'unknown', hint: 'Unparseable APNs response.' };
    }
};

const maskToken = (token) => (token ? `...${String(token).slice(-6)}` : 'none');

/**
 * CallKit identifies a call by UUID. Deriving it from the order id means the
 * "stop ringing" push can name the exact call the "new order" push started.
 */
export const callUuidForOrder = (orderId) => {
    const hex = crypto.createHash('md5').update(`order:${orderId}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const logVoipConfigurationWarnings = () => {
    const keyPathValue = sanitizeString(process.env.APNS_VOIP_P8_PATH);
    const keyPath = resolveKeyPath();
    const keyId = sanitizeString(process.env.APNS_KEY_ID);
    const keyFileId = keyPathValue.match(/AuthKey_([A-Z0-9]+)\.p8$/i)?.[1] || '';
    const restaurantTopic = getVoipTopic('RESTAURANT');

    if (!keyPathValue && !restaurantTopic) {
        logger.info('[VoIP] Not configured; iPhones get the regular FCM alert only.');
        return;
    }

    logger.info(`[VoIP] APNs ${isApnsProduction() ? 'PRODUCTION' : 'SANDBOX'} | team=${sanitizeString(process.env.APNS_TEAM_ID) || 'MISSING'} | key=${keyId || 'MISSING'} | .p8=${keyPath ? 'found' : 'NOT FOUND'} | restaurant topic=${restaurantTopic || 'MISSING'}`);
    if (keyPathValue && !keyPath) {
        logger.warn(`[VoIP] .p8 file not found at APNS_VOIP_P8_PATH=${keyPathValue} (cwd=${process.cwd()}).`);
    }
    if (keyFileId && keyId && keyFileId.toUpperCase() !== keyId.toUpperCase()) {
        logger.warn(`[VoIP] APNS_KEY_ID=${keyId} but the file is AuthKey_${keyFileId}.p8; Apple will reject with InvalidProviderToken.`);
    }
};

/**
 * Registers (or refreshes) one device's VoIP token for an owner.
 *
 * A device belongs to one account at a time, so the same VoIP token is pulled
 * from every owner first: an iPhone that switched restaurants without logging
 * out must stop ringing for the old one.
 */
export const upsertVoipDevice = async ({ ownerType, ownerId, voipToken, fcmToken }) => {
    const model = getOwnerModel(ownerType);
    const normalizedVoipToken = sanitizeString(voipToken);
    if (!model || !normalizedVoipToken) return null;

    const normalizedFcmToken = sanitizeString(fcmToken);
    const previous = await model
        .findOne({ _id: ownerId, 'pushDevices.voipToken': normalizedVoipToken }, { 'pushDevices.$': 1 })
        .lean();

    // Atomic updates, not load-modify-save: the app re-registers on every
    // launch and token refresh, and concurrent save()s on this array fail with
    // a VersionError (the same trap upsertFirebaseDeviceToken documents).
    await model.updateMany(
        { 'pushDevices.voipToken': normalizedVoipToken },
        { $pull: { pushDevices: { voipToken: normalizedVoipToken } } }
    );
    const updated = await model.findOneAndUpdate(
        { _id: ownerId },
        {
            $push: {
                pushDevices: {
                    $each: [{
                        voipToken: normalizedVoipToken,
                        fcmToken: normalizedFcmToken || previous?.pushDevices?.[0]?.fcmToken || undefined,
                        devicePlatform: 'ios',
                        lastSeenAt: new Date(),
                    }],
                    $slice: -MAX_PUSH_DEVICES,
                },
            },
        },
        { new: true, projection: { pushDevices: 1 } }
    ).lean();
    if (!updated) return null;

    logger.info(`[VoIP] Registered device ${maskToken(normalizedVoipToken)} for ${ownerType}:${ownerId} (${updated.pushDevices.length} device(s))`);
    return updated.pushDevices;
};

export const removeVoipDevice = async ({ ownerType, ownerId, voipToken }) => {
    const model = getOwnerModel(ownerType);
    const normalizedVoipToken = sanitizeString(voipToken);
    if (!model || !normalizedVoipToken) return;
    await model.updateOne({ _id: ownerId }, { $pull: { pushDevices: { voipToken: normalizedVoipToken } } });
};

/** Logout only knows the FCM token; drop the VoIP registration paired with it. */
export const removeVoipDevicesByFcmToken = async (fcmToken) => {
    const normalizedFcmToken = sanitizeString(fcmToken);
    if (!normalizedFcmToken) return;
    await Promise.all(
        Object.values(OWNER_MODELS).map((model) =>
            model.updateMany(
                { 'pushDevices.fcmToken': normalizedFcmToken },
                { $pull: { pushDevices: { fcmToken: normalizedFcmToken } } }
            )
        )
    );
};

const listOwnerVoipDevices = async ({ ownerType, ownerId }) => {
    const model = getOwnerModel(ownerType);
    if (!model || !ownerId) return [];
    const doc = await model.findById(ownerId).select('pushDevices').lean();
    const devices = Array.isArray(doc?.pushDevices) ? doc.pushDevices : [];
    return devices.filter((device) => device?.voipToken);
};

const sendOne = (client, { token, topic, body }) => new Promise((resolveResult) => {
    let req;
    try {
        req = client.request({
            ':method': 'POST',
            ':path': `/3/device/${token}`,
            'apns-topic': topic,
            'apns-push-type': 'voip',
            'apns-priority': '10',
            // A ring that arrives late is worse than none; don't let APNs store it.
            'apns-expiration': '0',
            'content-type': 'application/json',
            authorization: `bearer ${getApnsJwtToken()}`,
        });
    } catch (error) {
        resolveResult({ token, ok: false, remove: false, error: error?.message || String(error) });
        return;
    }

    let responseBody = '';
    let statusCode = 0;
    req.setEncoding('utf8');
    req.setTimeout(10000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.on('response', (headers) => {
        statusCode = Number(headers[':status'] || 0);
    });
    req.on('data', (chunk) => {
        responseBody += chunk;
    });
    req.on('close', () => {
        if (statusCode >= 200 && statusCode < 300) {
            resolveResult({ token, ok: true, statusCode });
            return;
        }
        const { reason, hint } = describeApnsReason(responseBody);
        resolveResult({
            token,
            ok: false,
            // 410 = unregistered. BadDeviceToken is only final once both
            // environments have refused it; see sendToDevice.
            remove: statusCode === 410,
            statusCode,
            reason,
            hint,
        });
    });
    req.on('error', (error) => {
        logger.warn(`[VoIP] Network error for device=${maskToken(token)}: ${error?.message || error}`);
    });
    req.end(JSON.stringify(body));
});

/**
 * Sends one push, trying the other APNs environment if this token is not valid here.
 *
 * Xcode builds get sandbox tokens and TestFlight/App Store builds get production
 * ones, and APNS_PRODUCTION can only name one. Sending a development build's token
 * to production answers BadDeviceToken, which used to delete the registration, so
 * that iPhone silently fell back to FCM until the app next launched. BadDeviceToken
 * means APNs did not take the push, so the retry cannot ring a phone twice.
 */
const sendToDevice = async ({ token, topic, body }) => {
    const first = await sendOne(getApnsClient(getApnsAuthority()), { token, topic, body });
    if (first.ok) return first;

    let result = first;
    if (first.reason === 'BadDeviceToken') {
        const second = await sendOne(getApnsClient(getOtherApnsAuthority()), { token, topic, body });
        if (second.ok) {
            logger.info(`[VoIP] device=${maskToken(token)} is on ${isApnsProduction() ? 'SANDBOX' : 'PRODUCTION'} (a ${isApnsProduction() ? 'development' : 'release'} build); delivered there.`);
            return second;
        }
        result = second.reason === 'BadDeviceToken' ? { ...second, remove: true } : second;
    }
    logger.warn(`[VoIP] APNs rejected device=${maskToken(token)} [${result.statusCode || 'no response'}] ${result.reason}: ${result.hint}`);
    return result;
};

/**
 * Sends one VoIP push to every iOS device the owner registered.
 *
 * Returns the FCM tokens of the devices that took the push, so the caller can
 * leave exactly those out of the FCM alert. Other devices — an Android tablet
 * on the same restaurant, or an iPhone whose VoIP push failed — still get FCM.
 */
export const sendVoipToOwner = async ({ ownerType, ownerId, body }) => {
    const empty = { successCount: 0, failureCount: 0, deliveredFcmTokens: [], skipped: true };
    if (!isVoipSupportedOwner(ownerType)) return empty;
    if (!isVoipConfigured(ownerType)) {
        logger.warn(`[VoIP] SKIPPED ${body.type} for ${ownerType}:${ownerId}: APNs is not configured on this server.`);
        return empty;
    }

    const devices = await listOwnerVoipDevices({ ownerType, ownerId });
    if (!devices.length) {
        logger.info(`[VoIP] SKIPPED ${body.type} for ${ownerType}:${ownerId}: no iPhone has registered a VoIP token.`);
        return empty;
    }

    const topic = getVoipTopic(ownerType);
    const results = await Promise.all(
        devices.map(async (device) => ({
            ...(await sendToDevice({ token: device.voipToken, topic, body })),
            fcmToken: device.fcmToken,
        }))
    );

    const staleTokens = results.filter((result) => !result.ok && result.remove).map((result) => result.token);
    if (staleTokens.length) {
        await getOwnerModel(ownerType)
            .updateOne({ _id: ownerId }, { $pull: { pushDevices: { voipToken: { $in: staleTokens } } } })
            .catch((error) => logger.warn(`[VoIP] Stale token cleanup failed: ${error?.message || error}`));
    }

    const delivered = results.filter((result) => result.ok);
    logger.info(`[VoIP] ${body.type} to ${ownerType}:${ownerId}: delivered=${delivered.length}/${results.length}`);
    return {
        successCount: delivered.length,
        failureCount: results.length - delivered.length,
        deliveredFcmTokens: delivered.map((result) => result.fcmToken).filter(Boolean),
        skipped: false,
    };
};

/**
 * Rings the restaurant's iPhones for a new order.
 *
 * Field names follow flutter_callkit_incoming, which the app hands this
 * payload to: `id` is the CallKit call UUID, `nameCaller` the big line on the
 * call screen, `handle` the line under it, `duration` the ring timeout. The
 * order fields are also sent at the top level, because a PushKit handler reads
 * the raw payload before the plugin ever sees it.
 */
export const ringRestaurantForOrder = async ({ restaurantId, orderId, title, body, data = {} }) => {
    const orderIdString = String(orderId);
    return sendVoipToOwner({
        ownerType: 'RESTAURANT',
        ownerId: restaurantId,
        body: {
            aps: {
                alert: { title, body },
                sound: 'default',
                'content-available': 1,
            },
            ...data,
            type: 'new_order',
            title,
            body,
            id: callUuidForOrder(orderIdString),
            nameCaller: title,
            callerName: title,
            handle: body,
            textAccept: 'Accept',
            textDecline: 'Decline',
            duration: VOIP_RING_DURATION_MS,
            orderId: orderIdString,
            orderMongoId: orderIdString,
            extra: { ...data, orderId: orderIdString, orderMongoId: orderIdString },
        },
    });
};

/**
 * Stops the ring once the order no longer needs the restaurant: accepted,
 * rejected, cancelled, timed out or deleted.
 *
 * iOS requires every VoIP push to be reported to CallKit, so the app handles
 * this one by ending the call with this `id` — or, if that call is already
 * gone, reporting it and ending it at once.
 */
export const stopRestaurantRingForOrder = async ({ restaurantId, orderId }) => {
    const orderIdString = String(orderId);
    return sendVoipToOwner({
        ownerType: 'RESTAURANT',
        ownerId: restaurantId,
        body: {
            aps: {},
            type: 'order_ring_end',
            id: callUuidForOrder(orderIdString),
            nameCaller: 'Order updated',
            handle: '',
            duration: 0,
            orderId: orderIdString,
            extra: { orderId: orderIdString },
        },
    });
};
