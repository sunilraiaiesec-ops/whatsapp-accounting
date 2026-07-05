import { z } from "zod";

// Discriminated union describing every structured action Ask Bantoo can extract
// from text, a photo, or a transcribed voice note. The `action` field is the
// discriminant. All money/number fields are in MAJOR units (e.g. 45000 XAF, not
// minor units) exactly as a person would say or write them — the backend
// converts to minor units with parseAmount before posting.

export const BANTOO_ACTION_TYPES = [
  "add_inventory_item",
  "receive_stock",
  "supplier_purchase",
  "customer_payment",
  "expense",
  "sales_receipt",
  "unknown",
] as const;

export type BantooActionType = (typeof BANTOO_ACTION_TYPES)[number];

// Lenient coercion helpers — the model sometimes returns "45,000", "45000 XAF"
// or a real number. Never throw on shape; normalize to number | null instead.
const numberish = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}, z.number().nullable());

const ntext = z.preprocess((v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return String(v);
}, z.string().max(500).nullable());

const currency = z
  .preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : "XAF"),
    z.string().min(1).max(8),
  )
  .default("XAF");

const confidence = z.preprocess((v) => {
  if (typeof v === "number") return Math.max(0, Math.min(1, v));
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }
  return 0;
}, z.number().min(0).max(1));

// ISO date string (YYYY-MM-DD) or null. Anything unparseable becomes null so the
// backend falls back to "today".
const isoDate = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const match = t.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}, z.string().nullable());

const base = {
  confidence,
  summary: ntext,
};

export const addInventoryItemSchema = z.object({
  action: z.literal("add_inventory_item"),
  product_name: ntext,
  barcode: ntext,
  sku: ntext,
  category: ntext,
  unit: ntext,
  quantity: numberish,
  cost_price: numberish,
  sale_price: numberish,
  tax_rate: numberish,
  reorder_level: numberish,
  supplier_name: ntext,
  currency,
  ...base,
});

export const receiveStockSchema = z.object({
  action: z.literal("receive_stock"),
  product_name: ntext,
  barcode: ntext,
  sku: ntext,
  unit: ntext,
  quantity: numberish,
  cost_price: numberish,
  supplier_name: ntext,
  date: isoDate,
  currency,
  ...base,
});

export const supplierPurchaseSchema = z.object({
  action: z.literal("supplier_purchase"),
  supplier_name: ntext,
  amount: numberish,
  description: ntext,
  payment_method: ntext,
  date: isoDate,
  currency,
  ...base,
});

export const customerPaymentSchema = z.object({
  action: z.literal("customer_payment"),
  customer_name: ntext,
  amount: numberish,
  payment_method: ntext,
  description: ntext,
  date: isoDate,
  currency,
  ...base,
});

export const expenseSchema = z.object({
  action: z.literal("expense"),
  amount: numberish,
  description: ntext,
  category: ntext,
  supplier_name: ntext,
  payment_method: ntext,
  date: isoDate,
  currency,
  ...base,
});

export const salesReceiptSchema = z.object({
  action: z.literal("sales_receipt"),
  amount: numberish,
  customer_name: ntext,
  description: ntext,
  payment_method: ntext,
  date: isoDate,
  currency,
  ...base,
});

export const unknownSchema = z.object({
  action: z.literal("unknown"),
  currency,
  ...base,
});

export const extractedActionSchema = z.discriminatedUnion("action", [
  addInventoryItemSchema,
  receiveStockSchema,
  supplierPurchaseSchema,
  customerPaymentSchema,
  expenseSchema,
  salesReceiptSchema,
  unknownSchema,
]);

export type ExtractedAction = z.infer<typeof extractedActionSchema>;
export type AddInventoryItemAction = z.infer<typeof addInventoryItemSchema>;
export type ReceiveStockAction = z.infer<typeof receiveStockSchema>;
export type SupplierPurchaseAction = z.infer<typeof supplierPurchaseSchema>;
export type CustomerPaymentAction = z.infer<typeof customerPaymentSchema>;
export type ExpenseAction = z.infer<typeof expenseSchema>;
export type SalesReceiptAction = z.infer<typeof salesReceiptSchema>;
export type UnknownAction = z.infer<typeof unknownSchema>;

// Confidence below this is treated as "not sure" — the UI must warn the user and
// force an explicit confirmation/edit before anything is written.
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

// Parse arbitrary AI JSON into a validated ExtractedAction. Returns a typed
// result instead of throwing so callers can degrade to "unknown" gracefully.
export function parseExtractedAction(
  data: unknown,
): { ok: true; action: ExtractedAction } | { ok: false; error: string } {
  const result = extractedActionSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: "The AI response did not match the expected shape." };
  }
  return { ok: true, action: result.data };
}
