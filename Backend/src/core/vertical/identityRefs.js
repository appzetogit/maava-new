/**
 * Every place a user, rider or admin id is stored, and the audit that proves
 * the list is still complete.
 *
 * Merging two databases means one side's identity documents are absorbed into
 * the other's and every reference to them rewritten. Miss one field and those
 * documents are orphaned: they still exist, they just point at an id nothing
 * resolves. The failure is silent -- no error, no crash, an empty list where a
 * customer's orders used to be.
 *
 * The list below is explicit and hand-reviewed rather than derived at runtime,
 * because NO automatic scan finds all of these. Three separate blind spots were
 * found while building it, each of which a ref-driven migration would have
 * skipped:
 *
 *   1. Fields with no `ref` at all. food_user_wallets.userId is declared
 *      { type: ObjectId, required, unique, index } with no ref -- so a scan
 *      over declared refs misses THE WALLET, which is the one collection whose
 *      loss is measured in money.
 *   2. Fields with a ref to a model that does not exist.
 *      food_delivery_cash_deposits.adminId declares ref: 'User'; this codebase
 *      has no 'User' model, it has 'FoodUser'. Any populate() on that path is
 *      already broken.
 *   3. Fields inside subdocument schemas. schema.eachPath() does not descend
 *      into an Embedded child, so food_orders.dispatch.deliveryPartnerId and
 *      statusHistory.byId are invisible to it -- the rider on every order.
 *
 * auditIdentityPaths() below walks all three angles including child schemas.
 * The test asserts the audit finds nothing this list does not already cover, so
 * a field added later fails CI instead of being discovered after a migration.
 */

export const IDENTITY_MODELS = Object.freeze({
    user: 'FoodUser',
    rider: 'FoodDeliveryPartner',
    admin: 'FoodAdmin',
});

/**
 * collection -> [ [dotted path, identity kind], ... ]
 *
 * Dotted paths are applied with MongoDB dot notation, which reaches into
 * embedded documents. Paths under an array of subdocuments use the positional
 * form and are marked, since those need an arrayFilters update rather than a
 * plain $set.
 */
export const IDENTITY_REFS = Object.freeze({
    food_users: [['referredBy', 'user']],
    food_admins: [['createdBy', 'admin'], ['updatedBy', 'admin']],
    food_delivery_partners: [['referredBy', 'rider']],
    food_refresh_tokens: [['userId', 'user']],

    // The wallets. No `ref` on userId in the schema; see blind spot 1.
    food_user_wallets: [['userId', 'user']],
    food_delivery_wallets: [['deliveryPartnerId', 'rider']],

    food_orders: [
        ['userId', 'user'],
        // Inside the `dispatch` subdocument schema; see blind spot 3.
        ['dispatch.deliveryPartnerId', 'rider'],
        ['dispatch.offeredTo.$[].partnerId', 'rider'],
        ['statusHistory.$[].byId', null], // polymorphic: role decides the kind
    ],

    food_transactions: [['userId', 'user'], ['deliveryPartnerId', 'rider']],
    food_offer_usages: [['userId', 'user']],
    food_user_carts: [['userId', 'user']],
    food_user_favorites: [['userId', 'user']],
    food_support_tickets: [['userId', 'user']],
    food_feedback_experiences: [['userId', 'user']],
    food_safety_emergency_reports: [['userId', 'user']],
    food_referral_logs: [['referrerId', null], ['refereeId', null]],

    food_delivery_support_tickets: [['deliveryPartnerId', 'rider']],
    food_delivery_bonus_transactions: [['deliveryPartnerId', 'rider']],
    food_earning_addon_history: [['deliveryPartnerId', 'rider']],
    food_delivery_withdrawals: [['deliveryPartnerId', 'rider']],
    // adminId here declares ref: 'User'; see blind spot 2.
    food_delivery_cash_deposits: [['deliveryPartnerId', 'rider'], ['adminId', 'admin']],
    food_delivery_order_emergency_requests: [
        ['deliveryPartnerId', 'rider'],
        ['resolvedBy', 'admin'],
    ],

    food_notification_broadcasts: [['createdBy', 'admin']],
    food_notifications: [['recipientId', null]],
    food_settings: [['updatedBy.adminId', 'admin']],
    // Polymorphic: a sibling `updatedByRole` says which kind of actor this is,
    // so the remap has to read that field rather than assume admin.
    food_page_contents: [['updatedBy', null]],
    // Chat runs between user, seller, rider and admin, so recipientId is
    // whichever the conversation says. Same treatment as food_notifications.
    food_chat_messages: [['recipientId', null]],

    payments: [['userId', 'user']],
    refunds: [['userId', 'user']],
});

const IDENTITY_NAME_RE = /(^|\.)(userId|deliveryPartnerId|adminId|customerId|riderId|referredBy|referrerId|refereeId|recipientId|partnerId|resolvedBy|createdBy|updatedBy|byId)$/;

/**
 * Walk a schema including its subdocument children and report every path that
 * looks like it holds an identity id.
 *
 * Matches on BOTH a declared ref to an identity model AND the field name,
 * because each angle misses cases the other catches -- see the header.
 */
export const auditSchema = (schema, prefix = '') => {
    const found = [];

    schema.eachPath((path, type) => {
        const full = prefix ? `${prefix}.${path}` : path;
        const ref = type.options?.ref || type.caster?.options?.ref;
        const byRef = Object.values(IDENTITY_MODELS).includes(ref);
        const byName = IDENTITY_NAME_RE.test(full);
        if (byRef || byName) found.push({ path: full, ref: ref || null, byRef, byName });
    });

    for (const child of schema.childSchemas || []) {
        // `model.path` is the parent path the child sits at; arrays and single
        // nested schemas both appear here, which is what eachPath misses.
        const at = child.model?.path || child.model?.$__path;
        if (!at) continue;
        found.push(...auditSchema(child.schema, prefix ? `${prefix}.${at}` : at));
    }

    return found;
};

/**
 * Audit every registered model. Returns collection -> paths.
 * Pass a mongoose instance so this stays free of import-order surprises.
 */
export const auditIdentityPaths = (mongoose) => {
    const report = {};
    for (const name of mongoose.modelNames()) {
        const model = mongoose.model(name);
        const found = auditSchema(model.schema);
        if (found.length) report[model.collection.collectionName] = found;
    }
    return report;
};

/** Normalise a positional path (`a.$[].b`) to the plain dotted form for comparison. */
export const stripPositional = (path) => path.replace(/\.\$\[\]/g, '');

/**
 * Paths the audit finds that IDENTITY_REFS does not cover.
 * Empty is the only acceptable result; anything else means the merge would
 * orphan those documents.
 */
export const findUncoveredPaths = (mongoose) => {
    const audit = auditIdentityPaths(mongoose);
    const gaps = [];
    for (const [collection, paths] of Object.entries(audit)) {
        const known = new Set((IDENTITY_REFS[collection] || []).map(([p]) => stripPositional(p)));
        for (const entry of paths) {
            if (!known.has(stripPositional(entry.path))) {
                gaps.push({ collection, ...entry });
            }
        }
    }
    return gaps;
};
