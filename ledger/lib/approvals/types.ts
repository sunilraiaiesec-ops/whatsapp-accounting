import type { Role } from "@/lib/permissions";

// The 7 transaction types named in the spec. "expense" and "supplier_payment"
// both post through createPayment (lib/documents.ts) — the split is purely a
// label for the Pending Approvals UI (an expense has no party; a supplier
// payment does). See lib/approvals/payloads.ts for the full dispatch table.
export const PENDING_TRANSACTION_TYPES = [
  "expense",
  "purchase_invoice",
  "sales_invoice",
  "payment_received",
  "supplier_payment",
  "inventory_adjustment",
  "stock_receipt",
] as const;

export type PendingTransactionType = (typeof PENDING_TRANSACTION_TYPES)[number];

export function isPendingTransactionType(value: string): value is PendingTransactionType {
  return (PENDING_TRANSACTION_TYPES as readonly string[]).includes(value);
}

export const PENDING_TRANSACTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_correction",
] as const;

export type PendingTransactionStatus = (typeof PENDING_TRANSACTION_STATUSES)[number];

// Human-readable labels for the dashboard widget.
export const PENDING_TRANSACTION_TYPE_LABELS: Record<PendingTransactionType, string> = {
  expense: "Expense",
  purchase_invoice: "Purchase invoice",
  sales_invoice: "Sales invoice",
  payment_received: "Payment received",
  supplier_payment: "Supplier payment",
  inventory_adjustment: "Inventory adjustment",
  stock_receipt: "Stock receipt",
};

export class ApprovalError extends Error {}

// Thrown specifically for permission/org-scope failures, so security tests
// can assert on the exact failure mode rather than a generic error message.
export class ApprovalForbiddenError extends ApprovalError {}

// A single deterministic, rule-based signal that fed into the risk review
// (see lib/approvals/risk-review.ts). `weight` contributes to the overall
// score; signals are always shown to the approver regardless of weight.
export type RiskSignal = {
  code: string;
  label: string;
  detail: string;
  weight: number;
};

export type RiskLevel = "low" | "medium" | "high";

export type RiskReview = {
  level: RiskLevel;
  score: number;
  signals: RiskSignal[];
  // Optional one-sentence AI-phrased summary of the signals above, from
  // lib/ai/provider.ts when configured. Never required, never blocking —
  // purely a phrasing layer on top of the deterministic signals.
  aiNarrative: string | null;
};

// Per-role approval requirement decision for the 4 "gated" (higher-
// commitment) transaction types — see lib/approvals/config.ts.
export type ManagerGatedType = "expense" | "purchase_invoice" | "sales_invoice" | "supplier_payment";

export type RoleForApproval = Role;
