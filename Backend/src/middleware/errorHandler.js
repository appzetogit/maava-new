import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { MAX_UPLOAD_MB } from './upload.js';

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Server Error';

    if (err.name === 'MulterError') {
        statusCode = 400;
        if (err.code === 'LIMIT_FILE_SIZE') {
            // Names the actual limit. "Image is too large" left an admin with a
            // 30MB GIF no way to know whether to shrink it a little or a lot.
            statusCode = 413;
            message = `File is too large. Maximum size is ${MAX_UPLOAD_MB}MB.`;
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            message = 'Only one file can be uploaded at a time';
        } else {
            message = err.message || 'Invalid upload';
        }
    }

    // A record that fails its schema is the caller's input, not a server fault:
    // a 400 with the rule that failed ("Zone must have at least 3 coordinates"),
    // instead of a 500 the admin panel can only report as "something went
    // wrong". Mongoose's errors carry no statusCode; ours do and keep theirs.
    if (!err.statusCode && err.name === 'ValidationError' && err.errors) {
        statusCode = 400;
        message = Object.values(err.errors)
            .map((e) => e?.message)
            .filter(Boolean)
            .join(' ') || 'Some details are not valid.';
    } else if (!err.statusCode && err.name === 'CastError') {
        statusCode = 400;
        message = `Invalid ${err.path || 'value'}: ${String(err.value).slice(0, 60)}`;
    }

    // Business-layer rate limits (RateLimitError) must advertise when to retry,
    // the same way the HTTP limiter's handler does. Without this a 429 from the
    // per-phone OTP quota is indistinguishable from a permanent failure.
    if (err.retryAfterSeconds) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }

    const requestId = req.requestId || '-';

    logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} ${statusCode} - ${err.name || 'Error'} - ${message}`
    );
    if (config.nodeEnv === 'development' && err.stack) {
        logger.error(`[${requestId}] ${err.stack}`);
    }

    res.status(statusCode).json({
        success: false,
        // `message` matches sendError() and every success response, so clients reading
        // data.message see thrown-error text (ValidationError, NotFoundError, ...) too.
        message,
        error: message, // retained for clients already reading this key
        ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {})
    });
};

export default errorHandler;
