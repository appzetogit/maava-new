import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { FoodItem } from '../admin/models/food.model.js';

const MAX_COMBO_LINES = 20;

const findVariant = (food, variantId) =>
    (Array.isArray(food?.variants) ? food.variants : []).find((v) => String(v?._id) === String(variantId));

const unitPrice = (food, variantId) =>
    Number(variantId ? findVariant(food, variantId)?.price : food?.price) || 0;

/** "1 x Paneer, 2 x Naan (Large)": the description a combo gets when the seller writes none. */
export const describeComboItems = (lines = []) =>
    lines
        .map((line) => `${line.quantity} x ${line.name}${line.variantName ? ` (${line.variantName})` : ''}`)
        .join(', ');

/**
 * Checks what a seller put in a combo and works out what follows from it.
 *
 * Veg/non-veg and the "worth" price are derived rather than accepted from the
 * request, so a combo with chicken in it cannot be listed as veg.
 */
export async function normalizeComboInput(restaurantId, rawItems, { pureVeg = false } = {}) {
    const totals = new Map();
    for (const raw of Array.isArray(rawItems) ? rawItems : []) {
        const itemId = String(raw?.itemId || raw?.id || '').trim();
        const variantId = String(raw?.variantId || '').trim();
        const quantity = Number(raw?.quantity ?? 1);
        if (!mongoose.Types.ObjectId.isValid(itemId)) throw new ValidationError('One of the combo dishes is invalid');
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
            throw new ValidationError('Combo dish quantities must be whole numbers from 1 to 50');
        }
        const key = `${itemId}:${variantId}`;
        const line = totals.get(key) || { itemId, variantId, quantity: 0 };
        line.quantity += quantity;
        totals.set(key, line);
    }

    const lines = [...totals.values()];
    if (lines.reduce((sum, line) => sum + line.quantity, 0) < 2) {
        throw new ValidationError('A combo needs at least 2 items');
    }
    if (lines.length > MAX_COMBO_LINES) {
        throw new ValidationError(`A combo can have at most ${MAX_COMBO_LINES} different dishes`);
    }

    const foods = await FoodItem.find({ _id: { $in: lines.map((l) => l.itemId) }, restaurantId }).lean();
    const byId = new Map(foods.map((food) => [String(food._id), food]));

    let worth = 0;
    let hasNonVeg = false;
    const named = lines.map((line) => {
        const food = byId.get(line.itemId);
        if (!food) throw new ValidationError('One of the combo dishes is not on your menu');
        if (food.isCombo) throw new ValidationError(`${food.name} is already a combo, so it cannot go inside another combo`);
        if (food.approvalStatus !== 'approved') throw new ValidationError(`${food.name} has not been approved yet`);

        const hasVariants = Array.isArray(food.variants) && food.variants.length > 0;
        if (hasVariants && !line.variantId) throw new ValidationError(`Please choose a size for ${food.name}`);
        const variant = line.variantId ? findVariant(food, line.variantId) : null;
        if (line.variantId && !variant) throw new ValidationError(`${food.name} no longer has that size`);

        if (food.foodType !== 'Veg') hasNonVeg = true;
        worth += unitPrice(food, line.variantId) * line.quantity;
        return { ...line, name: food.name, variantName: variant?.name || '' };
    });

    if (pureVeg && hasNonVeg) throw new ValidationError('Pure veg restaurants can only add veg dishes to a combo');

    return {
        comboItems: lines.map(({ itemId, variantId, quantity }) => ({ itemId, variantId, quantity })),
        foodType: hasNonVeg ? 'Non-Veg' : 'Veg',
        worth,
        autoDescription: describeComboItems(named)
    };
}

/** Everything in these combos, read live so renames and price changes show straight away. */
async function loadComboDishes(foods = []) {
    const ids = new Set();
    for (const food of foods) {
        if (!food?.isCombo) continue;
        for (const line of food.comboItems || []) ids.add(String(line.itemId));
    }
    if (ids.size === 0) return new Map();
    const dishes = await FoodItem.find({ _id: { $in: [...ids] } })
        .select('name image foodType price variants isAvailable approvalStatus stockQty maxQtyPerOrder')
        .lean();
    return new Map(dishes.map((dish) => [String(dish._id), dish]));
}

/** Why a dish stops a combo being sold right now, or null when it is fine. */
const dishProblem = (dish, line, comboQuantity = 1) => {
    if (!dish) return { reason: 'removed', name: 'A dish' };
    const needed = Number(line.quantity) * comboQuantity;
    if (dish.approvalStatus !== 'approved' || dish.isAvailable === false) {
        return { reason: 'unavailable', name: dish.name };
    }
    if (line.variantId && !findVariant(dish, line.variantId)) return { reason: 'unavailable', name: dish.name };
    if (dish.stockQty !== null && dish.stockQty !== undefined && Number(dish.stockQty) < needed) {
        return { reason: Number(dish.stockQty) > 0 ? 'low-stock' : 'unavailable', name: dish.name, left: Number(dish.stockQty) };
    }
    const cap = Number(dish.maxQtyPerOrder);
    if (Number.isFinite(cap) && cap > 0 && needed > cap) return { reason: 'over-cap', name: dish.name, cap };
    return null;
};

const buildComboLines = (combo, dishes) =>
    (combo.comboItems || []).map((line) => {
        const dish = dishes.get(String(line.itemId));
        return {
            itemId: String(line.itemId),
            name: dish?.name || '',
            variantId: line.variantId || '',
            variantName: line.variantId ? findVariant(dish, line.variantId)?.name || '' : '',
            quantity: Number(line.quantity) || 1,
            image: dish?.image || '',
            foodType: dish?.foodType || '',
            isAvailable: !dishProblem(dish, line)
        };
    });

const worthOf = (combo, dishes) =>
    (combo.comboItems || []).reduce((sum, line) => {
        const dish = dishes.get(String(line.itemId));
        return sum + unitPrice(dish, line.variantId) * (Number(line.quantity) || 1);
    }, 0);

/**
 * Adds combo details to a list of menu items.
 *
 * `isAvailable` on a combo becomes false when a dish inside it cannot be sold,
 * which is what customers should see. A seller's own menu passes
 * `keepOwnToggle` so its on/off switch still shows what the seller set, with
 * `comboBlockedBy` explaining why customers cannot order it.
 */
export async function attachComboDetails(foods = [], { keepOwnToggle = false } = {}) {
    const dishes = await loadComboDishes(foods);
    return foods.map((food) => {
        if (!food?.isCombo) return food;
        const comboItems = buildComboLines(food, dishes);
        const comboBlockedBy = comboItems.filter((line) => !line.isAvailable).map((line) => line.name || 'A removed dish');
        const worth = worthOf(food, dishes);
        return {
            ...food,
            comboItems,
            comboBlockedBy,
            otherPrice: worth > Number(food.price) ? worth : 0,
            isAvailable: keepOwnToggle ? food.isAvailable : food.isAvailable !== false && comboBlockedBy.length === 0
        };
    });
}

/**
 * Checkout's view of a combo line: refuses it if a dish cannot be sold, and
 * returns what the order records. Stock is still claimed atomically afterwards;
 * this read only tells the customer early and clearly.
 */
export async function resolveComboForOrder(combo, comboQuantity) {
    const dishes = await loadComboDishes([combo]);
    for (const line of combo.comboItems || []) {
        const problem = dishProblem(dishes.get(String(line.itemId)), line, comboQuantity);
        if (!problem) continue;
        if (problem.reason === 'low-stock') {
            throw new ValidationError(`Only ${problem.left} left of ${problem.name}, which is in ${combo.name}. Please reduce the quantity.`);
        }
        if (problem.reason === 'over-cap') {
            throw new ValidationError(`You can order at most ${problem.cap} of ${problem.name}, which is in ${combo.name}`);
        }
        throw new ValidationError(`${combo.name} is unavailable because ${problem.name} is unavailable`);
    }
    const worth = worthOf(combo, dishes);
    return {
        otherPrice: worth > Number(combo.price) ? worth : 0,
        comboItems: buildComboLines(combo, dishes).map(({ itemId, name, variantId, variantName, quantity }) => ({
            itemId,
            name,
            variantId,
            variantName,
            quantity
        }))
    };
}
