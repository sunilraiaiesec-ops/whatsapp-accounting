// ---------------------------------------------------------------------------
// Builds the neutral, supplier-facing WhatsApp quote-request message for the
// low-stock reorder flow — kept as a pure function (no Prisma/server
// imports) so it can be imported directly from client components and, later,
// reused unchanged by a real send-API transport (see buildWhatsAppLink below
// for the one function that's specific to the wa.me click-to-chat approach).
//
// Deliberately says nothing about low stock, reorder levels, or urgency —
// the internal UI can freely show "low stock" / "reorder suggested" / stock
// numbers, but none of that may leak into the message a supplier sees. See
// FORBIDDEN_PHRASES below and reorder-message.test.ts for the guard tests.
// ---------------------------------------------------------------------------

export type SupplierQuoteMessageInput = {
  supplierName: string;
  quantity: string;
  unit: string;
  productName: string;
};

const DEFAULT_UNIT = "units";

// Phrases that must never appear in a supplier-facing message — enforced by
// reorder-message.test.ts. Kept here (rather than only in the test) so any
// other future message-generating code path can reuse the same guard list.
export const FORBIDDEN_PHRASES: readonly string[] = [
  "running low",
  "low stock",
  "stock is low",
  "urgent",
  "need immediately",
  "we need immediately",
];

function cleanLine(value: string): string {
  return value.trim();
}

export function buildSupplierQuoteMessage(input: SupplierQuoteMessageInput): string {
  const supplierName = cleanLine(input.supplierName) || "there";
  const quantity = cleanLine(input.quantity) || "";
  const unit = cleanLine(input.unit) || DEFAULT_UNIT;
  const productName = cleanLine(input.productName) || "the item";
  const qtyPhrase = quantity ? `${quantity} ${unit}` : unit;

  return [
    `Hello ${supplierName},`,
    `Please quote us for ${qtyPhrase} of ${productName}.`,
    "",
    "Kindly confirm:",
    "- Current price",
    "- Available quantity",
    "- Earliest delivery date",
    "- Payment terms",
    "",
    "Thank you.",
  ].join("\n");
}

// Isolated from message-building on purpose: this is the only piece tied to
// the v1 "click-to-chat" transport. A future real send-API integration would
// call buildSupplierQuoteMessage() (and the supplier/phone resolver in
// lib/reorder.ts) but plug in a different function here instead of this one.
export function buildWhatsAppLink(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
