import { computeTrialBalance } from "@/lib/migration/validation";
import { unacknowledgedWarnings } from "@/lib/migration/consistency";
import type { WizardState } from "@/lib/migration/types";

export type ChecklistItem = {
  label: string;
  pass: boolean;
  weight: number;
};

export type HealthScoreResult = {
  score: number; // 0-100, deterministic — never AI-derived
  checklist: ChecklistItem[];
  warningItems: string[]; // "⚠ …" phrased checklist entries from Step 5B
  canProceed: boolean; // gate for entering Step 6
};

// Deterministic, fully explainable scoring formula. Weights sum to 100 so
// the score is always a plain percentage of "how much of readiness is
// satisfied" — no AI or black-box model is involved, per the spec.
//
//   Trial balance balances ............ 40 points (all-or-nothing — this
//                                        also independently gates Finish,
//                                        so it dominates the score)
//   Inventory balances complete ........ 15 points
//   Customer balances assigned ......... 15 points
//   Supplier balances assigned ......... 15 points
//   No unacknowledged warnings ......... 15 points, scaled down linearly by
//                                        min(unacknowledged, 5)/5 — each of
//                                        the first 5 outstanding warnings
//                                        costs 3 points; a 6th+ warning
//                                        costs no further points (the score
//                                        is meant to communicate "mostly
//                                        clean" vs "needs attention", not to
//                                        keep falling once the message is
//                                        already clear).
const WEIGHTS = {
  trialBalance: 40,
  inventory: 15,
  customers: 15,
  suppliers: 15,
  warnings: 15,
};

function inventoryComplete(state: WizardState): boolean {
  if (state.items.length === 0) return true;
  return state.inventoryBalances.every((r) => {
    const qty = Number(r.quantity || "0");
    if (qty > 0 && r.totalValue === 0n) return false;
    if (qty === 0 && r.totalValue !== 0n) return false;
    return true;
  }) && !state.inventoryBalances.some((r) => Number(r.quantity || "0") < 0);
}

function customersAssigned(state: WizardState): boolean {
  if (state.customers.length === 0) return true;
  return state.customerBalances.some((r) => r.amount !== 0n) || state.customers.length === 0;
}

function suppliersAssigned(state: WizardState): boolean {
  if (state.suppliers.length === 0) return true;
  return state.supplierBalances.some((r) => r.amount !== 0n) || state.suppliers.length === 0;
}

export function computeHealthScore(state: WizardState): HealthScoreResult {
  const tb = computeTrialBalance(state);
  const warnings = unacknowledgedWarnings(state);

  const checklist: ChecklistItem[] = [
    { label: "Trial balance balances", pass: tb.balanced, weight: WEIGHTS.trialBalance },
    { label: "Inventory balances complete", pass: inventoryComplete(state), weight: WEIGHTS.inventory },
    { label: "Customer balances assigned", pass: customersAssigned(state), weight: WEIGHTS.customers },
    { label: "Supplier balances assigned", pass: suppliersAssigned(state), weight: WEIGHTS.suppliers },
  ];

  const warningPenaltyFraction = Math.min(warnings.length, 5) / 5;
  const warningsScore = Math.round(WEIGHTS.warnings * (1 - warningPenaltyFraction));
  checklist.push({
    label: warnings.length === 0 ? "No outstanding warnings" : `${warnings.length} outstanding warning(s)`,
    pass: warnings.length === 0,
    weight: WEIGHTS.warnings,
  });

  const score =
    checklist.slice(0, 4).reduce((s, c) => s + (c.pass ? c.weight : 0), 0) + warningsScore;

  return {
    score: Math.max(0, Math.min(100, score)),
    checklist,
    warningItems: warnings.map((w) => `⚠ ${w.title} — ${w.detail}`),
    canProceed: tb.balanced,
  };
}
