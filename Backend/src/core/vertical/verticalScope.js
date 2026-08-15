import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../../config/env.js';

/**
 * The two product verticals sharing this codebase and, from phase 5, one
 * database: restaurant food delivery and quick-commerce grocery.
 */
export const VERTICALS = Object.freeze(['food', 'quick']);

export const isVertical = (value) => VERTICALS.includes(value);

const store = new AsyncLocalStorage();

/**
 * Run [fn] with [vertical] as the ambient scope. Every query issued underneath
 * it -- however deep, across any number of awaits -- is filtered to that
 * vertical by the plugin below.
 */
export const runWithVertical = (vertical, fn) => store.run({ vertical }, fn);

/**
 * The vertical in force right now.
 *
 * Falls back to the process default because not every caller arrives through a
 * request: the BullMQ workers, socket-server.js and scripts/run-scheduled-jobs.js
 * have no ambient scope, and a job that wrote documents with no vertical would
 * produce rows invisible to every subsequent query.
 *
 * ponytail: the process default is only correct while one deployment serves one
 * vertical (phases 2-4). Once both share a database, a worker acting on an order
 * must take the vertical FROM that order -- runWithVertical(order.vertical, ...)
 * around the job body -- rather than inheriting whatever the process was started
 * with.
 */
export const currentVertical = () => store.getStore()?.vertical || config.defaultVertical;

/**
 * Add a vertical filter to an aggregation pipeline.
 *
 * Split out as a pure function because of the $geoNear case, which is the only
 * part of this file with a way to be subtly wrong: $geoNear MUST be the first
 * stage of a pipeline, so unshifting a $match in front of it turns a working
 * nearest-seller search into a hard MongoServerError. $geoNear carries its own
 * `query` for exactly this reason, so the filter goes in there instead.
 *
 * Mutates in place and also returns, because mongoose exposes the live pipeline
 * array via this.pipeline() and replacing it wholesale does not take.
 */
export const scopePipeline = (pipeline, vertical) => {
    if (!vertical || !Array.isArray(pipeline)) return pipeline;

    const first = pipeline[0];
    if (first && first.$geoNear) {
        first.$geoNear.query = { ...(first.$geoNear.query || {}), vertical };
        return pipeline;
    }

    pipeline.unshift({ $match: { vertical } });
    return pipeline;
};

/**
 * Query middleware runs for these. Deliberately the full list rather than the
 * few that seemed relevant: the one left off is the one that leaks.
 */
const QUERY_HOOKS = [
    'count',
    'countDocuments',
    'deleteMany',
    'deleteOne',
    'distinct',
    'find',
    'findOne',
    'findOneAndDelete',
    'findOneAndReplace',
    'findOneAndUpdate',
    'replaceOne',
    'updateMany',
    'updateOne',
];

/**
 * Scope a collection to one vertical.
 *
 * Applied only to schemas whose documents can exist twice, once per vertical --
 * see MERGE_PLAN.md section 2.2. Identity (users, riders, admins, wallets)
 * deliberately does NOT get this: one customer, one login, one balance across
 * both verticals is the point of merging.
 *
 * Implicit filtering is action at a distance and normally the wrong trade. It is
 * taken here because the explicit alternative is roughly 400 hand-edited call
 * sites across ~170 admin routes, and the failure mode of missing one is not a
 * visible bug -- it is a food admin quietly reading quick-commerce orders. The
 * unsafe direction is the one you have to type: .setOptions({ skipVerticalScope:
 * true }) on a query, .option({ skipVerticalScope: true }) on an aggregate, for
 * the genuinely cross-vertical reads (a customer's whole order history,
 * platform-wide finance).
 */
export const verticalPlugin = (schema) => {
    schema.add({
        vertical: {
            type: String,
            enum: VERTICALS,
            required: true,
            index: true,
        },
    });

    schema.pre(QUERY_HOOKS, function applyVerticalScope() {
        if (this.getOptions().skipVerticalScope) return;
        // An explicit vertical in the caller's filter wins, so a deliberate
        // cross-vertical query does not get silently narrowed to the ambient one.
        if (this.getQuery().vertical !== undefined) return;

        const vertical = currentVertical();
        if (vertical) this.where({ vertical });
    });

    schema.pre('aggregate', function applyVerticalScopeToPipeline() {
        if (this.options?.skipVerticalScope) return;
        scopePipeline(this.pipeline(), currentVertical());
    });

    schema.pre('save', function stampVertical() {
        if (!this.vertical) this.vertical = currentVertical();
    });

    schema.pre('insertMany', function stampVerticalOnAll(next, docs) {
        const vertical = currentVertical();
        if (vertical && Array.isArray(docs)) {
            for (const doc of docs) {
                if (doc && !doc.vertical) doc.vertical = vertical;
            }
        }
        next();
    });

    // Upserts need no hook: the query middleware above puts `vertical` in the
    // filter as an equality condition, and MongoDB copies those into the
    // document it creates.
};

/**
 * Express middleware pinning a mount point to one vertical.
 *
 * Used to mount the same router at /v1/food and /v1/quick, so the existing Food
 * apps keep byte-identical behaviour and the quick-commerce apps change one
 * constant -- rather than forking the route table and having to remember to fix
 * every bug twice.
 */
export const withVertical = (vertical) => (_req, _res, next) => runWithVertical(vertical, next);
