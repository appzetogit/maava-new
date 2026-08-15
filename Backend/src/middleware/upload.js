import multer from 'multer';
import { currentVertical, runWithVertical } from '../core/vertical/verticalScope.js';

const storage = multer.memoryStorage();

/**
 * Keep the vertical alive across body parsing.
 *
 * Multer reads the body from the request socket, and the callback that resumes
 * the middleware chain is scheduled by that socket -- an async resource created
 * when the connection was accepted, before any request-scoped context existed.
 * AsyncLocalStorage therefore does NOT survive it: after `upload.array(...)`,
 * `currentVertical()` reads undefined and falls back to the process default,
 * `food`.
 *
 * The effect was silent and wrong in the worst way. A banner uploaded with the
 * admin panel on Quick reached `/v1/quick/hero-banners/multiple`, was scoped
 * correctly for every read on the way in, and was then written with
 * `vertical: 'food'` -- so it vanished from Quick and appeared in Food. The same
 * applied to every other multipart route: seller, product, category and profile
 * images all landed in the food vertical.
 *
 * Verified against this Node/multer build: a plain POST keeps the context, the
 * identical POST behind `upload.array()` loses it.
 *
 * This wrapper still runs inside the request's context, so it captures the
 * vertical before parsing and re-enters it when handing control on.
 */
const preserveVertical = (handler) => (req, res, next) => {
    const vertical = currentVertical();
    handler(req, res, (err) => runWithVertical(vertical, () => next(err)));
};

/** Wraps every multer factory so the middleware it returns keeps the vertical. */
export const withVerticalSafeUploads = (instance) => ({
    single: (...args) => preserveVertical(instance.single(...args)),
    array: (...args) => preserveVertical(instance.array(...args)),
    fields: (...args) => preserveVertical(instance.fields(...args)),
    any: (...args) => preserveVertical(instance.any(...args)),
    none: (...args) => preserveVertical(instance.none(...args)),
});

/**
 * Per-file upload ceiling.
 *
 * There was no limit here at all, so the only thing stopping a huge upload was
 * nginx's client_max_body_size — which rejects at the proxy with a bare 413 and
 * an HTML body, giving the panel nothing it can show the admin. A limit here
 * fails inside the app, as JSON, with a message that names the actual cap.
 *
 * 25MB rather than 20: animated GIFs are the largest thing anyone uploads, and
 * multipart framing plus the field data mean a 20MB file is slightly more than
 * 20MB on the wire. A cap set exactly at the intended file size rejects files
 * that are just under it. nginx is set to match.
 *
 * Files are buffered in memory (memoryStorage), so this is also the per-request
 * memory cost — worth remembering before raising it much further.
 */
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 25 * 1024 * 1024;

export const upload = withVerticalSafeUploads(
    multer({
        storage,
        limits: { fileSize: MAX_UPLOAD_BYTES },
    })
);

export const MAX_UPLOAD_MB = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

