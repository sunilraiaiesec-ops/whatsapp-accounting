import { can } from "@/lib/permissions";
import type { ManagerGatedType, PendingTransactionType, RoleForApproval } from "@/lib/approvals/types";

// ---------------------------------------------------------------------------
// §11 approval-required-by-role decisions.
//
// Owner/Admin/Accountant always post directly (never gated), matching the
// spec exactly. Cashier/Warehouse Staff/Salesperson always require approval
// for every one of the 7 types when the org toggle is on (they're the
// "lower-privilege roles" the spec calls out by name). Viewer never creates
// anything (createTransactions=false in the permission matrix), so it never
// reaches this decision at all.
//
// Manager is the explicit judgment call from the spec: "posts directly for
// lower-risk types but consider requiring approval for higher-value ones."
// Implemented as a simple, documented threshold rather than anything fancier:
//   - inventory_adjustment, stock_receipt, payment_received: ALWAYS direct
//     (lower financial-commitment types — receiving money or stock, or
//     correcting a physical count, is lower risk than committing to pay/bill
//     someone).
//   - expense, purchase_invoice, sales_invoice, supplier_payment: gated only
//     when the transaction's amount is >= MANAGER_APPROVAL_THRESHOLD_MINOR.
// This is a deliberate simplification (see the report) — a real deployment
// might want per-category thresholds, but a single configurable amount is
// "cleanly expressible" without extra signals, and is easy for an org owner
// to reason about and tune via env.
// ---------------------------------------------------------------------------

export const MANAGER_GATED_TYPES: ManagerGatedType[] = [
  "expense",
  "purchase_invoice",
  "sales_invoice",
  "supplier_payment",
];

// Default: 500,000 XAF (zero-decimal minor units == major units for XAF).
// Configurable via env so an org's finance team can tune it without a code
// change/redeploy.
export const MANAGER_APPROVAL_THRESHOLD_MINOR = BigInt(
  process.env.MANAGER_APPROVAL_THRESHOLD_MINOR ?? "500000",
);

const DIRECT_POST_ROLES = new Set<RoleForApproval>(["OWNER", "ADMIN", "ACCOUNTANT"]);

function isManagerGatedType(type: PendingTransactionType): type is ManagerGatedType {
  return (MANAGER_GATED_TYPES as string[]).includes(type);
}

// The core decision function wired into every gated server action. Returns
// false whenever the toggle is off (§11: "toggle-off means nobody needs
// approval") or the role doesn't have create permission at all (a different
// failure mode entirely — the caller should have already rejected that).
export function requiresApproval(
  role: string,
  type: PendingTransactionType,
  amountMinor: bigint,
  approvalWorkflowEnabled: boolean,
): boolean {
  if (!approvalWorkflowEnabled) return false;
  if (!can(role, "createTransactions")) return false;
  if (DIRECT_POST_ROLES.has(role as RoleForApproval)) return false;

  if (role === "MANAGER") {
    if (!isManagerGatedType(type)) return false;
    return amountMinor >= MANAGER_APPROVAL_THRESHOLD_MINOR;
  }

  // CASHIER, WAREHOUSE_STAFF, SALESPERSON (and any future non-admin role
  // that isn't explicitly listed above) — always gated when the toggle is on.
  return true;
}

// AI risk-review thresholds (see lib/approvals/risk-review.ts), also
// env-configurable with the defaults named in the spec.
export const PRICE_INCREASE_THRESHOLD_PERCENT = Number(
  process.env.APPROVAL_PRICE_INCREASE_THRESHOLD_PERCENT ?? 12,
);

export const HIGH_AMOUNT_MULTIPLIER = Number(
  process.env.APPROVAL_HIGH_AMOUNT_MULTIPLIER ?? 2,
);

export const RISK_SCORE_MEDIUM_THRESHOLD = Number(
  process.env.APPROVAL_RISK_SCORE_MEDIUM_THRESHOLD ?? 30,
);

export const RISK_SCORE_HIGH_THRESHOLD = Number(
  process.env.APPROVAL_RISK_SCORE_HIGH_THRESHOLD ?? 60,
);
