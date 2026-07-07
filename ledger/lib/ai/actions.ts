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
  "create_customer",
  "edit_customer",
  "view_customer",
  "customer_balance",
  "add_customer_note",
  "contact_customer",
  "customer_query",
  "unsupported_customer_action",
  // --- Supplier & Purchasing Intelligence Sprint -------------------------
  // create_supplier mirrors create_customer field-for-field — see the
  // launch-blocking bug postmortem above createSupplierSchema for why this
  // was missing until now.
  "create_supplier",
  "edit_supplier",
  "view_supplier",
  "supplier_balance",
  "add_supplier_note",
  "contact_supplier",
  "supplier_query",
  "unsupported_supplier_action",
  // --- Sales Intelligence Sprint ------------------------------------------
  "sales_invoice",
  "credit_note",
  "refund_receipt",
  "view_sales_invoice",
  "unsupported_sales_action",
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

// A short, free-text list of additional things the user asked for that this
// action's schema doesn't (yet) have a field for — e.g. "then invoice him,
// then email it" tacked onto a create_customer request. Capped small; each
// entry is rendered as an "unavailable" plan step (see resolve.ts's
// buildCustomerPlan) instead of being silently dropped or crashing. This is
// deliberately NOT a generic action queue — see the module doc comment in
// lib/bantoo/types.ts on BantooPlanStep for why.
const unsupportedRequests = z.preprocess((v) => {
  if (v === null || v === undefined) return null;
  const raw = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  const cleaned = raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 5);
  return cleaned.length ? cleaned : null;
}, z.array(z.string().max(200)).max(5).nullable());

// What to do right after a create_customer/edit_customer save succeeds, e.g.
// "then open his profile". Anything unrecognized (including absent/empty)
// becomes null rather than a guess — the plan simply omits that step.
const postCustomerAction = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase().replace(/\s+/g, "_");
  return t === "open_profile" ? "open_profile" : null;
}, z.enum(["open_profile"]).nullable());

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

// Multi-step Task Planning: a single "create a customer" message often carries
// more than just a name — city, phone, WhatsApp, an internal note, and/or a
// "then open their profile" follow-up all in one sentence (e.g. "Add Elhaji
// Adamou, his phone is 690123456, his WhatsApp is the same, leave a note that
// he pays every Friday, then open his profile"). Every one of those is
// captured here in the SAME action object instead of being dropped, and
// resolve.ts turns them into an ordered checklist (see BantooPlanStep).
export const createCustomerSchema = z.object({
  action: z.literal("create_customer"),
  customer_name: ntext,
  city: ntext,
  phone: ntext,
  whatsapp: ntext,
  country: ntext,
  // Internal note to save on the new customer's record (e.g. "pays every
  // Friday after Jummah") — never a payment/balance, purely a text note.
  note: ntext,
  // --- Launch Bug Fix Sprint: fields the Party profile already supports
  // (see prisma/schema.prisma's Party model) but which create_customer never
  // asked the extraction layer for, so they were silently dropped before
  // resolve.ts/execute() ever saw them — NOT a missing-column problem. ---
  email: ntext,
  // Only set when a DISTINCT business/company name is mentioned alongside
  // the contact's own name (e.g. "add John, he works at Acme Corp"). When
  // null, resolve.ts/execute() default the Party's companyName to the same
  // value as customer_name for a brand-new customer — see the "Company name
  // field appears blank" bug this closes.
  company_name: ntext,
  // Tax ID / business registration number (name varies by country).
  tax_id: ntext,
  // "Net 30" / "payment terms 47 days" → a plain day count.
  payment_terms_days: numberish,
  // Credit limit in MAJOR currency units (same convention as every other
  // money field on this schema) — converted to minor units before saving.
  credit_limit: numberish,
  // Default discount, as a percentage (e.g. 7 = 7%).
  default_discount: numberish,
  preferred_language: ntext,
  preferred_payment_method: ntext,
  // e.g. "open_profile" when the user asked to view/open the profile once
  // saved. Null when not requested.
  post_action: postCustomerAction,
  // Things the user asked for that aren't part of this action (e.g. "then
  // invoice him") — surfaced as "not available yet" plan steps, never built.
  unsupported_requests: unsupportedRequests,
  currency,
  ...base,
});

// Update fields on an EXISTING customer. `customer_name` identifies who to
// resolve (fuzzy-matched, org-scoped, same as every other party lookup);
// every other field is an optional change to apply — null/absent means
// "leave unchanged". No amounts/money involved, so no currency needed beyond
// the shared base shape's requirement.
export const editCustomerSchema = z.object({
  action: z.literal("edit_customer"),
  customer_name: ntext,
  new_name: ntext,
  city: ntext,
  phone: ntext,
  whatsapp: ntext,
  email: ntext,
  // Same Multi-step Task Planning fields as create_customer above — a single
  // "update Musa's phone and leave a note" message captures both in one shot.
  note: ntext,
  post_action: postCustomerAction,
  unsupported_requests: unsupportedRequests,
  currency,
  ...base,
});

const customerViewTarget = z
  .enum(["profile", "ledger", "statement", "documents", "list"])
  .catch("profile");

// Navigation-only: resolve a customer (or none, for "list") and hand back
// enough to deep-link into the existing customer pages. Never writes
// anything. `period_text` carries a raw phrase like "June" or "last month"
// for the statement view; the caller resolves it to a concrete date range.
export const viewCustomerSchema = z.object({
  action: z.literal("view_customer"),
  customer_name: ntext,
  view: customerViewTarget,
  period_text: ntext,
  currency,
  ...base,
});

export const customerBalanceSchema = z.object({
  action: z.literal("customer_balance"),
  customer_name: ntext,
  currency,
  ...base,
});

export const addCustomerNoteSchema = z.object({
  action: z.literal("add_customer_note"),
  customer_name: ntext,
  note: ntext,
  currency,
  ...base,
});

const contactMethod = z.enum(["call", "whatsapp", "email"]).catch("call");

export const contactCustomerSchema = z.object({
  action: z.literal("contact_customer"),
  customer_name: ntext,
  method: contactMethod,
  currency,
  ...base,
});

// Read-only, free-text question about a specific customer's history (e.g.
// "what did Musa buy last month"). Answered from existing org-scoped party
// data (lib/party-insights.ts) — never writes anything.
export const customerQuerySchema = z.object({
  action: z.literal("customer_query"),
  customer_name: ntext,
  question: ntext,
  period_text: ntext,
  currency,
  ...base,
});

// Shared by both customer and supplier "unsupported" schemas — none of these
// values are party-type-specific.
const unsupportedPartyRequest = z
  .enum(["archive", "reactivate", "merge", "upload_document"])
  .catch("archive");

// Recognized-but-not-yet-buildable customer commands (archive/reactivate/
// merge/upload document) — classified confidently so the UI shows the
// standard "not available yet" message instead of a misleading "not sure".
export const unsupportedCustomerActionSchema = z.object({
  action: z.literal("unsupported_customer_action"),
  customer_name: ntext,
  requested: unsupportedPartyRequest,
  currency,
  ...base,
});

// ---------------------------------------------------------------------------
// Supplier & Purchasing Intelligence Sprint: existing-supplier workflows,
// mirroring the Customer Intelligence Sprint schemas above field-for-field
// (customer_name -> supplier_name). See lib/bantoo/resolve.ts and
// app/actions/bantoo.ts for the resolution/execution mirrors.
//
// Launch-blocking bug postmortem: this sprint originally shipped every
// EXISTING-supplier workflow (edit/view/balance/note/contact/query) below but
// never added a "create a brand-new supplier" action — unlike customers,
// which got create_customer (with the full Multi-step Task Planning fields)
// from day one. Because create_supplier didn't exist anywhere (not in this
// schema, not in the AI prompt, not in the rule-based fallback), a request
// like "save him as a supplier, note: ..., then open his profile" had no way
// to be represented: the AI's only "new contact" schema was create_customer,
// so it got forced in there — mislabeling the plan/suggested-action as
// "Create customer" even when the user explicitly said "supplier". This is
// the actual root cause of the launch-blocking bug, not a blend/precedence
// override. createSupplierSchema below closes that gap by mirroring
// createCustomerSchema exactly, field-for-field, so create_supplier is a
// real, independently-selectable action the AI/rule parser can return, and
// resolve.ts/execute() key off `action.action` alone — never two different
// derivations that can drift apart.
// ---------------------------------------------------------------------------

// Add a NEW supplier contact (no purchase/bill involved) — the supplier
// mirror of createCustomerSchema above, field-for-field. Same Multi-step Task
// Planning support: a single compound message ("Alhaji Ibrahim, city Garoua,
// phone ..., WhatsApp same number, note: ..., save him as a supplier, then
// open his profile") fills every field on this ONE action object.
export const createSupplierSchema = z.object({
  action: z.literal("create_supplier"),
  supplier_name: ntext,
  city: ntext,
  phone: ntext,
  whatsapp: ntext,
  country: ntext,
  // Internal note to save on the new supplier's record — never a
  // payment/balance, purely a text note (mirrors create_customer's note).
  note: ntext,
  post_action: postCustomerAction,
  unsupported_requests: unsupportedRequests,
  currency,
  ...base,
});

// Update fields on an EXISTING supplier. `supplier_name` identifies who to
// resolve; every other field is an optional change to apply — null/absent
// means "leave unchanged".
export const editSupplierSchema = z.object({
  action: z.literal("edit_supplier"),
  supplier_name: ntext,
  new_name: ntext,
  city: ntext,
  phone: ntext,
  whatsapp: ntext,
  email: ntext,
  currency,
  ...base,
});

// Unlike customers, there is no single-supplier "statement" report page
// (only reports/customer-statement exists; reports/supplier-balances and
// reports/ap-aging are org-wide, not per-supplier) — so "statement" is
// deliberately absent from this enum. Any AI/pattern guess of "statement"
// falls back to "profile" via .catch(), the same convention used everywhere
// else in this file for an unrecognized/invalid enum value.
const supplierViewTarget = z.enum(["profile", "ledger", "documents", "list"]).catch("profile");

// Navigation-only: resolve a supplier (or none, for "list") and hand back
// enough to deep-link into the existing supplier pages. Never writes
// anything.
export const viewSupplierSchema = z.object({
  action: z.literal("view_supplier"),
  supplier_name: ntext,
  view: supplierViewTarget,
  currency,
  ...base,
});

// Outstanding PAYABLE balance — how much the org owes this supplier (opposite
// direction from customer_balance's receivable). Fields: supplier_name.
export const supplierBalanceSchema = z.object({
  action: z.literal("supplier_balance"),
  supplier_name: ntext,
  currency,
  ...base,
});

export const addSupplierNoteSchema = z.object({
  action: z.literal("add_supplier_note"),
  supplier_name: ntext,
  note: ntext,
  currency,
  ...base,
});

export const contactSupplierSchema = z.object({
  action: z.literal("contact_supplier"),
  supplier_name: ntext,
  method: contactMethod,
  currency,
  ...base,
});

// Read-only, free-text question about what was bought FROM a specific
// supplier (e.g. "what did we buy from Elhaji last month"). Answered from
// existing org-scoped party data (lib/party-insights.ts) — never writes
// anything.
export const supplierQuerySchema = z.object({
  action: z.literal("supplier_query"),
  supplier_name: ntext,
  question: ntext,
  period_text: ntext,
  currency,
  ...base,
});

// Recognized-but-not-yet-buildable supplier commands (archive/reactivate/
// merge/upload document) — mirrors unsupported_customer_action exactly.
export const unsupportedSupplierActionSchema = z.object({
  action: z.literal("unsupported_supplier_action"),
  supplier_name: ntext,
  requested: unsupportedPartyRequest,
  currency,
  ...base,
});

// ---------------------------------------------------------------------------
// Sales Intelligence Sprint: single-line/lump-sum sales documents, mirroring
// the single-line shape of supplier_purchase/sales_receipt above — NOT
// multi-line itemized invoicing via chat (out of scope; see resolve.ts).
// ---------------------------------------------------------------------------

// A credit sale invoice (due later, not paid now). due_date accepts an
// absolute date OR is resolved server-side from a relative phrase like "net
// 30" / "due in 30 days" / "échéance dans 30 jours" — see
// lib/bantoo/fallback.ts's ruleBasedExtract and lib/ai/extract.ts's prompt.
export const salesInvoiceSchema = z.object({
  action: z.literal("sales_invoice"),
  customer_name: ntext,
  amount: numberish,
  description: ntext,
  date: isoDate,
  due_date: isoDate,
  currency,
  ...base,
});

// Issued to a customer to reduce their receivable balance / record a sales
// return credit — NOT a cash refund (see refund_receipt below).
export const creditNoteSchema = z.object({
  action: z.literal("credit_note"),
  customer_name: ntext,
  amount: numberish,
  description: ntext,
  date: isoDate,
  currency,
  ...base,
});

// A cash refund paid back to a customer (money out of a bank/cash account).
export const refundReceiptSchema = z.object({
  action: z.literal("refund_receipt"),
  customer_name: ntext,
  amount: numberish,
  description: ntext,
  date: isoDate,
  currency,
  ...base,
});

// Navigation-only: there is no per-customer sales-invoice filter on
// /sales-invoices yet, so "list" is the only supported view target — any
// other guess falls back to it via .catch(), the same convention used
// elsewhere in this file for an unrecognized/invalid enum value.
const salesInvoiceViewTarget = z.enum(["list"]).catch("list");

export const viewSalesInvoiceSchema = z.object({
  action: z.literal("view_sales_invoice"),
  customer_name: ntext,
  view: salesInvoiceViewTarget,
  currency,
  ...base,
});

// Recognized-but-not-yet-buildable sales commands — editing/voiding an
// existing invoice, emailing an invoice to a customer, or applying a
// payment to one specific invoice number. Mirrors unsupported_customer_action
// / unsupported_supplier_action exactly.
const unsupportedSalesRequest = z
  .enum(["edit", "void", "email", "apply_payment"])
  .catch("edit");

export const unsupportedSalesActionSchema = z.object({
  action: z.literal("unsupported_sales_action"),
  customer_name: ntext,
  requested: unsupportedSalesRequest,
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
  createCustomerSchema,
  editCustomerSchema,
  viewCustomerSchema,
  customerBalanceSchema,
  addCustomerNoteSchema,
  contactCustomerSchema,
  customerQuerySchema,
  unsupportedCustomerActionSchema,
  createSupplierSchema,
  editSupplierSchema,
  viewSupplierSchema,
  supplierBalanceSchema,
  addSupplierNoteSchema,
  contactSupplierSchema,
  supplierQuerySchema,
  unsupportedSupplierActionSchema,
  salesInvoiceSchema,
  creditNoteSchema,
  refundReceiptSchema,
  viewSalesInvoiceSchema,
  unsupportedSalesActionSchema,
  unknownSchema,
]);

export type ExtractedAction = z.infer<typeof extractedActionSchema>;
export type AddInventoryItemAction = z.infer<typeof addInventoryItemSchema>;
export type ReceiveStockAction = z.infer<typeof receiveStockSchema>;
export type SupplierPurchaseAction = z.infer<typeof supplierPurchaseSchema>;
export type CustomerPaymentAction = z.infer<typeof customerPaymentSchema>;
export type ExpenseAction = z.infer<typeof expenseSchema>;
export type SalesReceiptAction = z.infer<typeof salesReceiptSchema>;
export type CreateCustomerAction = z.infer<typeof createCustomerSchema>;
export type EditCustomerAction = z.infer<typeof editCustomerSchema>;
export type ViewCustomerAction = z.infer<typeof viewCustomerSchema>;
export type CustomerBalanceAction = z.infer<typeof customerBalanceSchema>;
export type AddCustomerNoteAction = z.infer<typeof addCustomerNoteSchema>;
export type ContactCustomerAction = z.infer<typeof contactCustomerSchema>;
export type CustomerQueryAction = z.infer<typeof customerQuerySchema>;
export type UnsupportedCustomerActionAction = z.infer<typeof unsupportedCustomerActionSchema>;
export type CreateSupplierAction = z.infer<typeof createSupplierSchema>;
export type EditSupplierAction = z.infer<typeof editSupplierSchema>;
export type ViewSupplierAction = z.infer<typeof viewSupplierSchema>;
export type SupplierBalanceAction = z.infer<typeof supplierBalanceSchema>;
export type AddSupplierNoteAction = z.infer<typeof addSupplierNoteSchema>;
export type ContactSupplierAction = z.infer<typeof contactSupplierSchema>;
export type SupplierQueryAction = z.infer<typeof supplierQuerySchema>;
export type UnsupportedSupplierActionAction = z.infer<typeof unsupportedSupplierActionSchema>;
export type SalesInvoiceAction = z.infer<typeof salesInvoiceSchema>;
export type CreditNoteAction = z.infer<typeof creditNoteSchema>;
export type RefundReceiptAction = z.infer<typeof refundReceiptSchema>;
export type ViewSalesInvoiceAction = z.infer<typeof viewSalesInvoiceSchema>;
export type UnsupportedSalesActionAction = z.infer<typeof unsupportedSalesActionSchema>;
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
