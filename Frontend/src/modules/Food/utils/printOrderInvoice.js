/**
 * Printable order bill for the restaurant panel.
 *
 * Rendered as HTML and sent to the browser's print dialog through a hidden
 * iframe, so the restaurant can print straight to a thermal or A4 printer.
 * The old jsPDF receipt called doc.save(), which only ever downloaded a file,
 * printed "₹" as garbage (Helvetica has no rupee glyph) and carried no totals.
 */

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);

/** Drops the "N/A" placeholders admin rows fill empty fields with. */
const present = (value) => {
  const text = String(value ?? "").trim();
  return text && text.toUpperCase() !== "N/A" ? text : "";
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const money = (value) => `₹${toNumber(value).toFixed(2)}`;

const PAYMENT_LABELS = {
  cash: "Cash on Delivery",
  razorpay_qr: "Pay on Delivery (QR)",
  wallet: "Wallet",
  razorpay: "Online",
  online: "Online",
};

const formatAddress = (address) => {
  if (!address) return "";
  if (typeof address === "string") return address;
  return [
    address.street,
    address.additionalDetails,
    address.city,
    address.state,
    address.zipCode,
  ]
    .filter(Boolean)
    .join(", ");
};

/** Normalises the shapes the orders page passes around (API order, queue card). */
export const normalizeOrderForInvoice = (order = {}) => {
  const pricing = order.pricing || {};
  const items = (order.items || []).map((item) => {
    const quantity = toNumber(item.quantity) || 1;
    const price = toNumber(item.price);
    return {
      name: item.name || "Item",
      variant: item.variantName || item.variant?.name || "",
      addons: (item.addons || []).map((a) => a?.name).filter(Boolean),
      quantity,
      price,
      lineTotal: price * quantity,
    };
  });
  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const address = order.deliveryAddress || order.customerAddress || order.address;
  const paymentMethod = String(
    order.paymentMethod || order.payment?.method || "",
  ).toLowerCase();

  return {
    orderId: order.orderId || order.order_id || order._id || "",
    restaurantName:
      present(order.restaurantName) || present(order.restaurantId?.restaurantName) ||
      present(order.restaurantId?.name) ||
      (typeof order.restaurant === "string" ? present(order.restaurant) : "") ||
      "Restaurant",
    createdAt: order.createdAt || null,
    customerName:
      present(order.userId?.name) || present(order.customerName) ||
      present(address?.fullName) || present(address?.name),
    customerPhone:
      present(order.customerPhone) || present(address?.phone) ||
      present(order.userId?.phone),
    address: formatAddress(address),
    note: order.note || order.specialInstructions || "",
    paymentLabel: PAYMENT_LABELS[paymentMethod] || paymentMethod || "",
    items,
    subtotal: toNumber(pricing.subtotal) || itemsTotal,
    discount: toNumber(pricing.discount),
    couponCode: pricing.couponCode || "",
    packagingFee: toNumber(pricing.packagingFee),
    tax: toNumber(pricing.tax),
    gstRate: toNumber(pricing.gstRate),
    deliveryFee: toNumber(pricing.deliveryFee) + toNumber(pricing.deliveryFeeGst),
    platformFee: toNumber(pricing.platformFee),
    deliveryTip: toNumber(pricing.deliveryTip),
    total: toNumber(pricing.total ?? order.total) || itemsTotal,
  };
};

/**
 * @param {object} order
 * @param {{ details?: Array<{ label: string, value: unknown }> }} [options]
 *   extra header lines (admin adds status, payment status, delivery partner)
 */
export const buildInvoiceHtml = (order, { details = [] } = {}) => {
  const inv = normalizeOrderForInvoice(order);
  const detailRows = details
    .filter((d) => present(d?.value))
    .map((d) => `<div><b>${escapeHtml(d.label)}:</b> ${escapeHtml(present(d.value))}</div>`)
    .join("");
  const date = new Date(inv.createdAt || Date.now()).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemRows = inv.items
    .map(
      (item) => `
        <tr>
          <td>
            ${escapeHtml(item.name)}${item.variant ? ` (${escapeHtml(item.variant)})` : ""}
            ${item.addons.length ? `<div class="sub">+ ${escapeHtml(item.addons.join(", "))}</div>` : ""}
          </td>
          <td class="c">${item.quantity}</td>
          <td class="r">${money(item.price)}</td>
          <td class="r">${money(item.lineTotal)}</td>
        </tr>`,
    )
    .join("");

  const line = (label, value, negative = false) =>
    value > 0
      ? `<tr><td>${escapeHtml(label)}</td><td class="r">${negative ? "-" : ""}${money(value)}</td></tr>`
      : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Order ${escapeHtml(inv.orderId)}</title>
<style>
  @page { margin: 6mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; }
  .bill { max-width: 80mm; margin: 0 auto; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
  .muted { text-align: center; font-size: 11px; margin: 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
  .meta div { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; border-bottom: 1px solid #000; padding: 3px 0; font-size: 11px; }
  td { padding: 3px 0; vertical-align: top; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  .sub { font-size: 10px; color: #333; }
  .total td { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 5px; }
  .foot { text-align: center; font-size: 11px; margin-top: 10px; }
</style>
</head>
<body>
<div class="bill">
  <h1>${escapeHtml(inv.restaurantName)}</h1>
  <p class="muted">Order Bill</p>
  <hr />
  <div class="meta">
    <div><b>Order ID:</b> ${escapeHtml(inv.orderId)}</div>
    <div><b>Date:</b> ${escapeHtml(date)}</div>
    ${inv.customerName ? `<div><b>Customer:</b> ${escapeHtml(inv.customerName)}</div>` : ""}
    ${inv.customerPhone ? `<div><b>Phone:</b> ${escapeHtml(inv.customerPhone)}</div>` : ""}
    ${inv.address ? `<div><b>Address:</b> ${escapeHtml(inv.address)}</div>` : ""}
    ${inv.paymentLabel ? `<div><b>Payment:</b> ${escapeHtml(inv.paymentLabel)}</div>` : ""}
    ${detailRows}
  </div>
  <hr />
  <table>
    <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>${itemRows || `<tr><td colspan="4">No items</td></tr>`}</tbody>
  </table>
  <hr />
  <table>
    ${line("Item total", inv.subtotal)}
    ${line(inv.couponCode ? `Discount (${inv.couponCode})` : "Discount", inv.discount, true)}
    ${line("Packaging charges", inv.packagingFee)}
    ${line(inv.gstRate ? `GST (${inv.gstRate}%)` : "Taxes", inv.tax)}
    ${line("Delivery fee", inv.deliveryFee)}
    ${line("Platform fee", inv.platformFee)}
    ${line("Delivery tip", inv.deliveryTip)}
    <tr class="total"><td>Grand Total</td><td class="r">${money(inv.total)}</td></tr>
  </table>
  ${inv.note ? `<hr /><div><b>Note:</b> ${escapeHtml(inv.note)}</div>` : ""}
  <p class="foot">Thank you for ordering with Maava</p>
</div>
</body>
</html>`;
};

/** Opens the browser print dialog for the order's bill. */
export const printOrderInvoice = (order, options) =>
  new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";

    const cleanup = () => setTimeout(() => iframe.remove(), 1000);

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        win.addEventListener("afterprint", cleanup, { once: true });
        win.focus();
        win.print();
        // Some browsers never fire afterprint for iframes.
        setTimeout(cleanup, 60000);
        resolve();
      } catch (error) {
        iframe.remove();
        reject(error);
      }
    };

    iframe.srcdoc = buildInvoiceHtml(order, options);
    document.body.appendChild(iframe);
  });
