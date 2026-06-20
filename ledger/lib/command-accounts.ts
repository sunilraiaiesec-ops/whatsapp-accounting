import type { Account } from "@prisma/client";

import { humanizeDescription } from "@/lib/command-parse";

const EXPENSE_HINTS: { pattern: RegExp; accountPattern: RegExp }[] = [
  { pattern: /\b(tire|tyre|pneu|fuel|transport|car|vehicle|voiture|essence|truck)\b/i, accountPattern: /transport|fuel/i },
  { pattern: /\b(rent|lease|loyer|bail)\b/i, accountPattern: /rent|loyer/i },
  { pattern: /\b(salary|salaries|wage|payroll|salaire)\b/i, accountPattern: /salary|wage|salaire/i },
  { pattern: /\b(bank|fee|charge|frais bancaire)\b/i, accountPattern: /bank charge|bank/i },
  { pattern: /\b(facilitation|phytosanitary|certificate|certificat|customs|douane|fee|fees)\b/i, accountPattern: /general expense/i },
  { pattern: /\b(cogs|stock|inventory|marchandise)\b/i, accountPattern: /cost of goods|cogs/i },
];

export function pickExpenseAccount(
  accounts: Account[],
  description: string,
): Account | undefined {
  const expenses = accounts.filter((a) => a.type === "EXPENSE" && a.subtype !== "cogs");
  if (expenses.length === 0) return undefined;

  const normalized = humanizeDescription(description);

  for (const hint of EXPENSE_HINTS) {
    if (hint.pattern.test(normalized)) {
      const match = expenses.find((a) => hint.accountPattern.test(a.name));
      if (match) return match;
    }
  }

  const named = expenses.find(
    (a) =>
      normalized.length >= 3 &&
      (a.name.toLowerCase().includes(normalized.toLowerCase()) ||
        normalized.toLowerCase().includes(a.name.toLowerCase())),
  );
  if (named) return named;

  return (
    expenses.find((a) => a.code === "6000" || /general expense/i.test(a.name)) ??
    expenses.find((a) => a.code !== "5000")
  );
}

export function pickSalesAccount(accounts: Account[]): Account | undefined {
  return (
    accounts.find((a) => a.subtype === "sales") ??
    accounts.find((a) => /sales|revenue|vente/i.test(a.name))
  );
}
