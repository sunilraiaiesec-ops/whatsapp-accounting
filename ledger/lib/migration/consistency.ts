import { Prisma } from "@prisma/client";

import { MATCH_HIGH, similarity } from "@/lib/bantoo/match";
import type { WizardState } from "@/lib/migration/types";
import { categoryTotal } from "@/lib/migration/validation";
import { EQUITY_CATEGORIES } from "@/lib/migration/categories";

export type ConsistencyWarning = {
  code: string; // stable, deterministic — used for acknowledgement tracking
  severity: "warning" | "info";
  title: string;
  detail: string;
  acknowledged: boolean;
};

// Step 5B — every check here is deterministic/rule-based; no AI is involved
// (unlike Step 5A's imbalance explanations). Reusing the shared Ask Bantoo
// fuzzy matcher (lib/bantoo/match.ts) for name-duplicate detection means
// "likely the same customer/supplier" means exactly the same thing here as
// everywhere else in the app (see lib/parties.ts#findPossiblePartyDuplicates).

// Opening equity is flagged as "unusually large" once it exceeds this share
// of total staged assets. 20% is a deliberately simple, documented
// heuristic: opening equity is meant to be a small balancing plug, not the
// dominant source of funding, so a large value is a strong signal that a
// real account (owner capital, a loan, retained earnings) was missed.
const LARGE_OPENING_EQUITY_RATIO = 0.2;

function findDuplicatePairs(
  people: { id: string; name: string }[],
): { a: string; b: string; aName: string; bName: string; score: number }[] {
  const pairs: { a: string; b: string; aName: string; bName: string; score: number }[] = [];
  // O(n^2) — fine for typical wizard-sized master-data lists (tens to a few
  // hundred parties). Bounded so a very large CSV import can't make Step 5B
  // pathologically slow.
  const capped = people.slice(0, 400);
  for (let i = 0; i < capped.length; i++) {
    for (let j = i + 1; j < capped.length; j++) {
      const score = Math.round(similarity(capped[i].name, capped[j].name) * 100);
      if (score >= MATCH_HIGH) {
        pairs.push({ a: capped[i].id, b: capped[j].id, aName: capped[i].name, bName: capped[j].name, score });
      }
    }
  }
  return pairs;
}

function pairCode(prefix: string, a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `${prefix}:${x}:${y}`;
}

export function computeConsistencyWarnings(state: WizardState): ConsistencyWarning[] {
  const acked = new Set(state.acknowledgedWarnings);
  const warnings: ConsistencyWarning[] = [];
  const push = (code: string, severity: "warning" | "info", title: string, detail: string) => {
    warnings.push({ code, severity, title, detail, acknowledged: acked.has(code) });
  };

  const itemById = new Map(state.items.map((i) => [i.id, i]));

  // Negative inventory.
  for (const row of state.inventoryBalances) {
    if (new Prisma.Decimal(row.quantity || "0").lt(0)) {
      const item = itemById.get(row.itemId);
      push(
        `negative_inventory:${row.itemId}`,
        "warning",
        "Negative inventory quantity",
        `${item?.name ?? row.itemId} has a negative opening quantity (${row.quantity}). Opening stock should be zero or positive.`,
      );
    }
  }

  // Inventory quantity without value, or value without quantity.
  for (const row of state.inventoryBalances) {
    const qty = new Prisma.Decimal(row.quantity || "0");
    const item = itemById.get(row.itemId);
    if (qty.gt(0) && row.totalValue === 0n) {
      push(
        `inventory_qty_no_value:${row.itemId}`,
        "warning",
        "Inventory quantity without a cost",
        `${item?.name ?? row.itemId} has quantity ${row.quantity} but no unit cost, so it contributes nothing to the opening Inventory value.`,
      );
    } else if (qty.eq(0) && row.totalValue !== 0n) {
      push(
        `inventory_value_no_qty:${row.itemId}`,
        "warning",
        "Inventory value without a quantity",
        `${item?.name ?? row.itemId} has an opening value but zero quantity.`,
      );
    }
  }

  // Negative customer balances (a customer with a credit balance) — unusual
  // for an opening balance import.
  const partyById = new Map([...state.customers, ...state.suppliers].map((p) => [p.id, p]));
  for (const row of state.customerBalances) {
    if (row.amount < 0n) {
      push(
        `negative_customer_balance:${row.partyId}`,
        "warning",
        "Negative customer balance",
        `${partyById.get(row.partyId)?.name ?? row.partyId} has a negative opening receivable, meaning they'd start with a credit balance. Confirm this is intentional.`,
      );
    }
  }

  // Supplier debit balances (negative on the credit-normal AP side).
  for (const row of state.supplierBalances) {
    if (row.amount < 0n) {
      push(
        `supplier_debit_balance:${row.partyId}`,
        "warning",
        "Supplier debit balance",
        `${partyById.get(row.partyId)?.name ?? row.partyId} has a negative opening payable, meaning you'd start owed money by this supplier. Confirm this is intentional.`,
      );
    }
  }

  // Duplicate customer / supplier names.
  for (const { a, b, aName, bName, score } of findDuplicatePairs(state.customers)) {
    push(
      pairCode("dup_customer", a, b),
      "warning",
      "Possible duplicate customer",
      `"${aName}" and "${bName}" look like the same customer (${score}% match). Consider merging before assigning opening balances.`,
    );
  }
  for (const { a, b, aName, bName, score } of findDuplicatePairs(state.suppliers)) {
    push(
      pairCode("dup_supplier", a, b),
      "warning",
      "Possible duplicate supplier",
      `"${aName}" and "${bName}" look like the same supplier (${score}% match). Consider merging before assigning opening balances.`,
    );
  }

  // Duplicate chart-of-account codes (case-insensitive — the DB's unique
  // index is case-sensitive, so imported data can still collide this way).
  const byCode = new Map<string, { id: string; code: string }[]>();
  for (const acc of state.accounts) {
    const key = acc.code.trim().toLowerCase();
    const list = byCode.get(key) ?? [];
    list.push(acc);
    byCode.set(key, list);
  }
  for (const [, list] of byCode) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        push(
          pairCode("dup_account_code", list[i].id, list[j].id),
          "warning",
          "Duplicate chart-of-account code",
          `Accounts "${list[i].code}" and "${list[j].code}" share the same code (case-insensitive).`,
        );
      }
    }
  }

  // Bank account without a currency.
  const bankAccountIds = new Set(state.bankBalances.map((b) => b.accountId));
  for (const acc of state.accounts) {
    if (!bankAccountIds.has(acc.id)) continue;
    if (!acc.currency) {
      push(
        `bank_no_currency:${acc.id}`,
        "warning",
        "Bank account missing a currency",
        `${acc.name} has no currency set.`,
      );
    }
  }

  // Receivable/payable control account staged with zero customer/supplier
  // assignments, even though the org has parties to assign it to.
  const arTotal = state.customerBalances.reduce((s, r) => s + r.amount, 0n);
  if (state.customers.length > 0 && arTotal === 0n) {
    push(
      "receivable_zero_assignments",
      "info",
      "No customer opening balances entered",
      "Accounts Receivable has no customer assigned an opening balance yet. If any customers owe you money as of the opening date, assign it in Step 4.",
    );
  }
  const apTotal = state.supplierBalances.reduce((s, r) => s + r.amount, 0n);
  if (state.suppliers.length > 0 && apTotal === 0n) {
    push(
      "payable_zero_assignments",
      "info",
      "No supplier opening balances entered",
      "Accounts Payable has no supplier assigned an opening balance yet. If you owe any suppliers as of the opening date, assign it in Step 4.",
    );
  }

  // Unusually large, unexplained opening equity.
  const openingEquityCat = EQUITY_CATEGORIES.find((c) => c.key === "opening_equity")!;
  const openingEquity = categoryTotal(openingEquityCat, state);
  const totalAssetsApprox =
    state.bankBalances.reduce((s, r) => s + r.amount, 0n) +
    state.customerBalances.reduce((s, r) => s + r.amount, 0n) +
    state.inventoryBalances.reduce((s, r) => s + r.totalValue, 0n);
  if (openingEquity > 0n && totalAssetsApprox > 0n) {
    const ratio = Number(openingEquity) / Number(totalAssetsApprox);
    if (ratio > LARGE_OPENING_EQUITY_RATIO) {
      push(
        "large_opening_equity",
        "warning",
        "Opening Equity is unusually large",
        `Opening Equity is ${Math.round(ratio * 100)}% of total staged assets. This often means a real account (Owner Capital, a loan, or Retained Earnings) was missed — double-check before finishing.`,
      );
    }
  }

  return warnings;
}

export function unacknowledgedWarnings(state: WizardState): ConsistencyWarning[] {
  return computeConsistencyWarnings(state).filter((w) => !w.acknowledged);
}
