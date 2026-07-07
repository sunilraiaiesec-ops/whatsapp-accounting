import { prisma } from "@/lib/prisma";
import { MigrationError, setOpeningBalanceRaw } from "@/lib/migration/wizard";
import { categoryTotal, computeTrialBalance } from "@/lib/migration/validation";
import { EQUITY_CATEGORIES, LIABILITY_CATEGORIES } from "@/lib/migration/categories";
import { askWizardAssistant } from "@/lib/ai/wizard-assistant";
import type { WizardState } from "@/lib/migration/types";

// Step 5A — AI accounting assistant that explains WHY the staged books are
// out of balance and offers concrete, opt-in fixes.
//
// Detection is 100% deterministic/rule-based (works with zero AI
// configured): it looks at which expected equity/liability categories are
// still zero. The AI provider (lib/ai/provider.ts, via the shared
// lib/ai/wizard-assistant.ts helper) is layered ONLY on top, to turn the
// rule-based findings into a friendlier natural-language paragraph — it can
// never change which findings are detected or which actions are offered.
//
// Every action ONLY calls setOpeningBalanceRaw, which writes to
// MigrationOpeningBalance — a staging table nothing else reads until Step 7
// posts it for real. Nothing here ever creates a JournalEntry.

export type SuggestionAction = {
  id: "allocate_opening_equity" | "allocate_retained_earnings";
  label: string;
  categoryKey: "opening_equity" | "retained";
};

export type ImbalanceFinding = {
  code: string;
  message: string; // always available, rule-based
};

export type ImbalanceExplanation = {
  findings: ImbalanceFinding[];
  ruleBasedSummary: string;
  aiMessage: string | null; // natural-language phrasing layered on top, when available
  actions: SuggestionAction[];
};

const ACTIONS: SuggestionAction[] = [
  {
    id: "allocate_opening_equity",
    label: "✓ Allocate balancing amount to Opening Equity",
    categoryKey: "opening_equity",
  },
  {
    id: "allocate_retained_earnings",
    label: "✓ Allocate balancing amount to Retained Earnings",
    categoryKey: "retained",
  },
];

function detectFindings(state: WizardState): ImbalanceFinding[] {
  const findings: ImbalanceFinding[] = [];
  const equity = categoryTotal(EQUITY_CATEGORIES.find((c) => c.key === "equity")!, state);
  const retained = categoryTotal(EQUITY_CATEGORIES.find((c) => c.key === "retained")!, state);
  const openingEquity = categoryTotal(EQUITY_CATEGORIES.find((c) => c.key === "opening_equity")!, state);
  const loan = categoryTotal(LIABILITY_CATEGORIES.find((c) => c.key === "loan")!, state);

  if (equity === 0n && retained === 0n && openingEquity === 0n) {
    findings.push({
      code: "owner_capital_missing",
      message: "You may have forgotten to enter Owner's Capital — most businesses start with at least some owner-contributed equity.",
    });
  }
  if (retained === 0n) {
    findings.push({
      code: "retained_earnings_missing",
      message: "Retained Earnings is zero. If this business has been operating for a while, some accumulated profit or loss might be missing.",
    });
  }
  if (loan === 0n) {
    findings.push({
      code: "loans_missing",
      message: "No loans or shareholder loans are staged. If the business has any outstanding loans, you may not have entered them yet.",
    });
  }
  const incompleteInventory = state.inventoryBalances.some((r) => {
    const qty = Number(r.quantity || "0");
    return qty > 0 && r.totalValue === 0n;
  });
  const noInventoryStaged = state.items.length > 0 && state.inventoryBalances.length === 0;
  if (incompleteInventory || noInventoryStaged) {
    findings.push({
      code: "inventory_incomplete",
      message: "Inventory valuation appears incomplete — some items may be missing a quantity, unit cost, or both.",
    });
  }
  return findings;
}

// Rule-based detection ALWAYS runs and is returned even when AI phrasing is
// requested and succeeds — `aiMessage` is purely additive.
export async function explainImbalance(
  state: WizardState,
  currency: string,
  opts: { withAi?: boolean } = {},
): Promise<ImbalanceExplanation> {
  const tb = computeTrialBalance(state);
  const findings = tb.balanced ? [] : detectFindings(state);
  const ruleBasedSummary = tb.balanced
    ? "Your staged books balance."
    : findings.length > 0
      ? findings.map((f) => f.message).join(" ")
      : "The staged trial balance doesn't add up to zero yet, but no specific missing category was detected — double-check each entered amount.";

  let aiMessage: string | null = null;
  if (!tb.balanced && opts.withAi !== false) {
    const result = await askWizardAssistant("Why is my balance sheet out of balance right now, and what's the most likely cause?", {
      currentStep: 5,
      currency,
      totalAssets: tb.totalAssets,
      totalLiabilities: tb.totalLiabilities,
      totalEquity: tb.totalEquity,
      difference: tb.difference,
      zeroOrMissingCategories: tb.categories.filter((c) => c.amount === 0n).map((c) => c.label),
      extraNotes: findings.map((f) => f.message),
    });
    if (result.source === "ai") aiMessage = result.answer;
  }

  return {
    findings,
    ruleBasedSummary,
    aiMessage,
    actions: tb.balanced ? [] : ACTIONS,
  };
}

// Stages (never posts) the exact amount needed to zero out the current
// difference into the chosen equity category's account. Because equity's
// `amount` is stored signed-on-normal-side, adding the raw signed
// `difference` (Assets − (Liabilities + Equity)) to that category's balance
// always makes the NEW difference exactly zero, regardless of which
// direction the imbalance ran.
export async function applyBalancingSuggestion(
  orgId: string,
  actionId: SuggestionAction["id"],
  state: WizardState,
): Promise<void> {
  const action = ACTIONS.find((a) => a.id === actionId);
  if (!action) throw new MigrationError("Unknown suggestion");
  const tb = computeTrialBalance(state);
  if (tb.balanced) throw new MigrationError("Already balanced — nothing to allocate.");

  const category = [...EQUITY_CATEGORIES].find((c) => c.key === action.categoryKey)!;
  const account = await prisma.account.findFirst({
    where: { orgId, subtype: category.subtype },
    select: { id: true },
  });
  if (!account) throw new MigrationError(`Missing ${category.label} account — reopen Step 3 first.`);

  const current = state.openingBalances.find((r) => r.accountId === account.id)?.amount ?? 0n;
  await setOpeningBalanceRaw(orgId, account.id, current + tb.difference);
}
