import type { BantooActionType } from "@/lib/ai/actions";

// Types shared between the server (extraction/resolution/execution) and the
// Ask Bantoo client modal. This module MUST stay free of server-only imports
// (prisma, next/headers, etc.) so the client bundle can import the types.

// Confidence bucket for a resolved match. Drives UI behavior:
//   high   → auto-selected (pre-filled)
//   medium → best match highlighted, alternatives + "create new" offered
//   low    → left empty, user can create a new record
export type MatchBucket = "high" | "medium" | "low";

// A ranked candidate returned by the matcher / search endpoint. `score` is
// 0–100. `sub` is optional secondary text (e.g. a product code) for the UI.
export type MatchCandidate = {
  id: string;
  label: string;
  sub?: string;
  score: number;
  bucket: MatchBucket;
};

// Master-data entity types the searchable dropdowns can query as the user types.
export type EntitySearchType =
  | "supplier"
  | "customer"
  | "product"
  | "unit"
  | "expense_category"
  | "income_account"
  | "bank_account";

// Defaults pulled from an existing product when it is selected, so dependent
// fields auto-populate. All values are strings in MAJOR currency units / the
// raw form representation, ready to drop into the draft inputs.
export type ProductDefaults = {
  unit: string;
  taxRate: string;
  costPrice: string;
  salePrice: string;
  reorderLevel: string;
};

// A resolved option in a proposal. Extends the old {id,label} shape with an
// optional confidence score/bucket so the client can highlight the best match.
export type BantooOption = {
  id: string;
  label: string;
  sub?: string;
  score?: number;
  bucket?: MatchBucket;
};

// Stable codes for resolve-time validation hints. Mapped to next-intl keys on
// the client (command.warnings.*) so French/English UI stay in sync.
export type BantooWarningCode =
  | "barcodeDuplicateReceiveStock"
  | "similarItemReceiveStock"
  | "enterProductName"
  | "openingStockNeedsCost"
  | "itemNotInInventory"
  | "chooseInventoryItem"
  | "chooseSupplier"
  | "enterQuantity"
  | "enterUnitCost"
  | "chooseSupplierForBill"
  | "enterInvoiceTotal"
  | "noExpensePurchasesAccount"
  | "chooseCustomer"
  | "enterAmountReceived"
  | "noBankAccount"
  | "enterAmountPaid"
  | "noExpenseAccount"
  | "enterSaleAmount"
  | "noIncomeAccount"
  | "lowConfidence";

export type BantooWarning = {
  code: BantooWarningCode;
  params?: Record<string, string | number>;
};

// Stable codes for org transaction-pattern learning hints. Mapped to
// next-intl keys on the client (command.fieldReasons.*).
export type BantooFieldReasonCode =
  | "supplierProductHistory"
  | "itemDeliveryHistory"
  | "itemBestMatch"
  | "quantityUsual"
  | "quantityLastDelivery"
  | "costLastPurchase"
  | "dueDatePaymentTerms";

export type BantooPatternReason = {
  code: BantooFieldReasonCode;
  params?: Record<string, string | number>;
};

// A localized explanation for a suggested/pre-filled field, surfaced by
// org-scoped transaction-pattern learning (see lib/command-patterns.ts). Client-
// safe: code + optional params, never raw historical rows.
export type BantooFieldReason = {
  code: BantooFieldReasonCode;
  bucket: MatchBucket;
  params?: Record<string, string | number>;
};

// Keyed by BantooDraft field name (plus "supplier"/"customer"/"item" for the
// resolved-entity fields, which aren't literal draft keys). Populated only when
// a pattern-learning signal actually influenced that field's value/selection.
export type BantooFieldReasons = Partial<
  Record<
    | "supplier"
    | "customer"
    | "item"
    | "unit"
    | "quantity"
    | "costPrice"
    | "salePrice"
    | "taxRate"
    | "dueDate",
    BantooFieldReason
  >
>;

// The flat, editable representation of an extracted action. Every value is a
// string so it maps directly to text inputs in the confirmation form. Empty
// string means "not set". Money/number fields are in MAJOR units as typed.
export type BantooDraft = {
  productName: string;
  barcode: string;
  sku: string;
  category: string;
  unit: string;
  quantity: string;
  costPrice: string;
  salePrice: string;
  taxRate: string;
  reorderLevel: string;
  amount: string;
  partyName: string;
  paymentMethod: string;
  description: string;
  date: string;
  // Payment terms, as an actual due date (YYYY-MM-DD). Only meaningful for
  // supplier_purchase (posts to PurchaseInvoice.dueDate); empty otherwise.
  dueDate: string;
  currency: string;
};

// The proposal returned to the client after AI extraction + org-scoped
// resolution. Mirrors the style of CommandProposalDto but covers the new
// action types and carries the resolution options the confirm form needs.
export type BantooProposal = {
  action: BantooActionType;
  confidence: number;
  lowConfidence: boolean;
  summary: string;
  warnings: BantooWarning[];
  draft: BantooDraft;
  partyType: "customer" | "supplier" | null;
  partyId: string | null;
  createParty: boolean;
  partyOptions: BantooOption[];
  itemId: string | null;
  itemOptions: BantooOption[];
  unitOptions: BantooOption[];
  bankAccountId: string | null;
  bankOptions: BantooOption[];
  lineAccountId: string | null;
  lineAccountOptions: BantooOption[];
  needsItem: boolean;
  needsParty: boolean;
  needsBank: boolean;
  needsLineAccount: boolean;
  // Why certain fields were pre-filled/selected by org transaction-pattern
  // learning (lib/command-patterns.ts), for the small muted hint under a field.
  // Absent/empty when no pattern signal applied.
  fieldReasons: BantooFieldReasons;
};

// What the client sends back on Confirm. The server re-validates everything and
// never trusts these values blindly.
export type ExecuteBantooInput = {
  action: BantooActionType;
  draft: BantooDraft;
  partyId: string | null;
  createParty: boolean;
  partyType: "customer" | "supplier" | null;
  itemId: string | null;
  bankAccountId: string | null;
  lineAccountId: string | null;
};

export type BantooExecuteResult =
  | { ok: true; href: string; number: string; kind: BantooActionType }
  | { ok: false; error: string };

export function emptyDraft(): BantooDraft {
  return {
    productName: "",
    barcode: "",
    sku: "",
    category: "",
    unit: "",
    quantity: "",
    costPrice: "",
    salePrice: "",
    taxRate: "",
    reorderLevel: "",
    amount: "",
    partyName: "",
    paymentMethod: "",
    description: "",
    date: "",
    dueDate: "",
    currency: "XAF",
  };
}
