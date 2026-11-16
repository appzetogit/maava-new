/** "1 x Paneer, 2 x Naan (Large)". Empty when the item is not a combo. */
export const describeCombo = (comboItems) =>
  (Array.isArray(comboItems) ? comboItems : [])
    .map((dish) => `${dish.quantity} x ${dish.name}${dish.variantName ? ` (${dish.variantName})` : ""}`)
    .join(", ")
