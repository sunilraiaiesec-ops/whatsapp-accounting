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
  | "enterCustomerName"
  | "lowConfidence"
  // --- Customer Intelligence Sprint --------------------------------------
  | "customerNotFound"
  | "customerAmbiguous"
  | "noChangesToSave"
  | "enterNoteText"
  | "missingPhone"
  | "missingWhatsapp"
  | "missingEmail"
  | "notYetAvailable"
  // Raised for create_customer when the resolved name matches an EXISTING
  // customer AND the new request conflicts with (or is otherwise ambiguous
  // against) that customer's stored details — see BantooDuplicateCandidate.
  // The UI must force an explicit "use existing" vs "create new" choice
  // before Confirm & Save is enabled; never silently proceed either way.
  | "possibleDuplicateCustomer"
  // --- Supplier & Purchasing Intelligence Sprint -------------------------
  | "supplierNotFound"
  | "supplierAmbiguous"
  | "enterSupplierName"
  | "supplierMissingPhone"
  | "supplierMissingWhatsapp"
  | "supplierMissingEmail"
  // --- Sales Intelligence Sprint ------------------------------------------
  | "chooseCustomerForInvoice"
  | "chooseCustomerForCreditNote"
  | "enterCreditAmount"
  | "enterRefundAmount";

// The existing customer record a create_customer request's name matched,
// shown side-by-side with the newly-typed details so the user can tell at a
// glance whether it's really the same person. Never used to silently merge
// data — see `possibleDuplicateCustomer` above.
export type BantooDuplicateCandidate = {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
};

// Multi-step Task Planning (see the module doc comment above BantooProposal's
// `plan` field for the "why"). "ready" steps will actually execute on
// Confirm & Save; "unavailable" steps are shown as a plan item but never
// executed — they exist purely so a compound request like "...then invoice
// him" doesn't silently drop that clause, it's surfaced and clearly marked
// as not-yet-buildable instead.
export type BantooPlanStepStatus = "ready" | "unavailable";

// Deliberately a small, closed set scoped to what create_customer/
// edit_customer/create_supplier can actually carry today, NOT a generic
// action registry — see lib/ai/actions.ts's `unsupportedRequests` doc comment
// for why a full multi-action queue is out of scope for this sprint.
// "createSupplier"/"openSupplierProfile" are the create_supplier mirror of
// "createCustomer"/"openProfile" — kept as distinct codes (rather than reusing
// the customer ones) so each renders its own correctly-worded label ("Create
// supplier" / "open supplier profile") instead of a shared label that could
// say "customer" for a supplier plan step.
export type BantooPlanStepCode =
  | "createCustomer"
  | "editCustomer"
  | "createSupplier"
  | "setCity"
  | "setPhone"
  | "setWhatsapp"
  | "setNote"
  | "openProfile"
  | "openSupplierProfile"
  | "unsupportedStep";

export type BantooPlanStep = {
  code: BantooPlanStepCode;
  status: BantooPlanStepStatus;
  // Interpolation params for the localized label, e.g. { name: "Elhaji
  // Adamou" } for "createCustomer", { value: "690123456" } for "setPhone", or
  // { request: "then invoice him" } for "unsupportedStep".
  params?: Record<string, string | number>;
};

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
  city: string;
  paymentMethod: string;
  description: string;
  date: string;
  // Payment terms, as an actual due date (YYYY-MM-DD). Only meaningful for
  // supplier_purchase (posts to PurchaseInvoice.dueDate); empty otherwise.
  dueDate: string;
  currency: string;
  // --- Customer Intelligence Sprint --------------------------------------
  // edit_customer: contact fields, pre-filled from the resolved party and
  // editable before saving. New name is separate from partyName (which is
  // used to search/resolve WHO to edit).
  newName: string;
  phone: string;
  whatsapp: string;
  email: string;
  // add_customer_note: text appended to the party's existing notes.
  note: string;
  // view_customer: which page to open once the party (or none, for "list")
  // is resolved. One of "" | "profile" | "ledger" | "statement" |
  // "documents" | "list" — plain string (like every other draft field) so
  // it maps directly onto a form control without a cast.
  view: string;
  // Raw period phrase ("June", "last month") for display, resolved to an
  // actual [dateFrom, dateTo] range server-side for the statement/query views.
  periodText: string;
  dateFrom: string;
  dateTo: string;
  // contact_customer: which channel to use. One of "" | "call" | "whatsapp" | "email".
  contactMethod: string;
  // unsupported_customer_action: which recognized-but-unbuilt action was
  // requested, purely for potential debugging/analytics — never executed.
  requestedAction: string;
  // Multi-step Task Planning: what to do right after create_customer/
  // edit_customer saves successfully. "" | "open_profile" — plain string
  // like every other draft field, resolved into a real navigation by the
  // caller once the save succeeds (see BantooCommand.tsx).
  postAction: string;
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
  // Multi-step Task Planning: ordered checklist built from every field this
  // action carries (see buildPartyPlan in resolve.ts). Empty for actions
  // that don't have a plan representation yet (everything except
  // create_customer/edit_customer/create_supplier, for now).
  plan: BantooPlanStep[];
  // Set only for create_customer when the resolved party name matched an
  // EXISTING customer AND the incoming request conflicts with (or is
  // otherwise ambiguous against) that customer's stored details. When set,
  // `partyId` is deliberately left null and `createParty` false — the client
  // MUST require the user to explicitly choose "use existing" vs "create
  // new" (see the `possibleDuplicateCustomer` warning) before Confirm & Save.
  duplicateCandidate: BantooDuplicateCandidate | null;
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
  // Set only when the client showed the possible-duplicate-customer choice
  // (see BantooDuplicateCandidate/duplicateChoiceBlock) and the user picked
  // one of the two radio options. This is the AUTHORITATIVE record of that
  // choice: execute() must branch on it directly rather than re-deriving
  // party identity via fuzzy matching a second time, so "create new despite
  // the name match" can never be silently downgraded back into reusing the
  // existing record. `null`/omitted means no duplicate choice was involved
  // (the normal, non-conflicting create/other-action path).
  duplicateResolution?: "use_existing" | "create_new" | null;
};

export type BantooExecuteResult =
  | { ok: true; href: string; number: string; kind: BantooActionType; message?: string }
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
    city: "",
    paymentMethod: "",
    description: "",
    date: "",
    dueDate: "",
    currency: "XAF",
    newName: "",
    phone: "",
    whatsapp: "",
    email: "",
    note: "",
    view: "",
    periodText: "",
    dateFrom: "",
    dateTo: "",
    contactMethod: "",
    requestedAction: "",
    postAction: "",
  };
}
