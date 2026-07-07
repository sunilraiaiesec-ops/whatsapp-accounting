// ---------------------------------------------------------------------------
// Single source of truth for every subscription plan's limits and feature
// flags. NOTHING else in the app should hardcode a limit number — every
// enforcement check (lib/billing/enforce.ts), every "X of Y" usage display,
// and every feature gate reads from here.
//
// `null` in a numeric limit means "unlimited" (never blocked, never even
// shown as a warning). AI credits and storage are the only limits that are
// genuinely finite even on paid plans (metering costs real money), so they
// are never `null` — BUSINESS/ENTERPRISE just get generous configurable
// defaults instead.
// ---------------------------------------------------------------------------

export type PlanId = "FREE" | "BUSINESS" | "ENTERPRISE";

export type PlanFeatureFlags = {
  // Reserved for the parallel "Roles, Permissions & Approval Workflow" task —
  // this flag exists so plan-gating of that feature is already wired into
  // plan config on day one. This task does NOT build the approval engine
  // itself; see the coordination note in the final report.
  approvalWorkflow: boolean;
  // "AI Memory" = Ask Bantoo transaction-pattern learning (lib/command-patterns.ts)
  // and per-contact insight suggestions (lib/party-insights.ts). As of this
  // writing both are purely rule-based (no live AI calls, no AI credit cost)
  // — this flag still exists so the UI can gate the *feature* by plan even
  // though today it costs nothing to meter. See report for details.
  aiMemory: boolean;
  // Ask Bantoo photo/OCR extraction + voice transcription.
  ocrVoice: boolean;
  // Low-stock WhatsApp reorder drafts, payment reminder drafts, etc.
  whatsappAutomation: boolean;
};

export type PlanLimits = {
  id: PlanId;
  label: string;
  // Total active memberships allowed in the org (not "per month").
  maxUsers: number | null;
  // Sales invoices created in the current calendar month. Purchase invoices
  // are tracked against the SAME number independently (each document type
  // gets its own monthly allowance of this size) — see the comment on
  // BillingResource in lib/billing/enforce.ts for why they aren't summed.
  maxInvoicesPerMonth: number | null;
  // Total InventoryItem rows for the org (not per month).
  maxInventoryItems: number | null;
  // Total Party rows of type customer|both for the org.
  maxCustomers: number | null;
  // Total Party rows of type supplier|both for the org.
  maxSuppliers: number | null;
  // AI credits consumed in the current calendar month (see lib/billing/ai-credits.ts).
  aiCreditsPerMonth: number;
  // Cumulative Document.optimizedSizeBytes for the org (see lib/documents/storage.ts).
  storageBytes: number;
  features: PlanFeatureFlags;
};

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const PLANS: Record<PlanId, PlanLimits> = {
  FREE: {
    id: "FREE",
    label: "Free",
    maxUsers: 2,
    maxInvoicesPerMonth: 20,
    maxInventoryItems: 50,
    maxCustomers: 50,
    maxSuppliers: 20,
    aiCreditsPerMonth: 10,
    storageBytes: 500 * MB,
    features: {
      approvalWorkflow: false,
      aiMemory: false,
      ocrVoice: false,
      whatsappAutomation: false,
    },
  },
  BUSINESS: {
    id: "BUSINESS",
    label: "Business",
    maxUsers: 10,
    maxInvoicesPerMonth: null,
    maxInventoryItems: null,
    maxCustomers: null,
    maxSuppliers: null,
    // "A large configurable default" per spec — a real number, not a magic
    // "unlimited" sentinel, since every AI call still costs money.
    aiCreditsPerMonth: 1000,
    storageBytes: 10 * GB,
    features: {
      approvalWorkflow: true,
      aiMemory: true,
      ocrVoice: true,
      whatsappAutomation: true,
    },
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    label: "Enterprise",
    maxUsers: null,
    maxInvoicesPerMonth: null,
    maxInventoryItems: null,
    maxCustomers: null,
    maxSuppliers: null,
    aiCreditsPerMonth: 5000,
    storageBytes: 100 * GB,
    features: {
      approvalWorkflow: true,
      aiMemory: true,
      ocrVoice: true,
      whatsappAutomation: true,
    },
  },
};

export function getPlanLimits(plan: PlanId): PlanLimits {
  return PLANS[plan];
}

// Trial length for the automatic Business trial started on org creation.
export const TRIAL_LENGTH_DAYS = 14;
export const TRIAL_PLAN: PlanId = "BUSINESS";

// Referral cookie lifetime (days) — see lib/billing/partners.ts.
export const REFERRAL_COOKIE_DAYS = 90;

// Commission rate and eligibility window — see lib/billing/partners.ts.
export const COMMISSION_RATE_PERCENT = 10;
export const COMMISSION_WINDOW_MONTHS = 12;

// Percentage of a countable limit at which checkPlanLimit() starts returning
// a `warning` instead of silently allowing the action.
export const WARNING_THRESHOLD_RATIO = 0.8;

// Image upload processing limit (lib/documents/optimize.ts) — files above
// this are rejected before any processing is attempted, regardless of plan.
export const MAX_UPLOAD_BYTES = 25 * MB;

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  const decimals = exponent === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const trimmed = decimals === 0 ? value.toFixed(0) : value.toFixed(decimals).replace(/\.?0+$/, "");
  return `${trimmed} ${units[exponent]}`;
}
