import type { AccountType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isDebitNormal, signedBalance } from "@/lib/accounts";

export type AccountAmount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  isControl: boolean;
  debit: bigint;
  credit: bigint;
};

type RawRow = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  isControl: boolean;
  debit: string;
  credit: string;
};

// Aggregate debit/credit totals per account, optionally bounded by date.
// `from`/`to` are inclusive; omit `from` for cumulative (balance-sheet) views.
async function aggregate(
  orgId: string,
  opts: { from?: Date; to?: Date } = {},
): Promise<AccountAmount[]> {
  const to = opts.to ?? new Date();
  const conditions = [`a."orgId" = $1`, `(e.id IS NULL OR e."entryDate" <= $2)`];
  const params: unknown[] = [orgId, to];

  if (opts.from) {
    params.push(opts.from);
    conditions.push(`(e.id IS NULL OR e."entryDate" >= $${params.length})`);
  }

  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `
    SELECT a.id, a.code, a.name, a.type, a.subtype, a."isControl",
           COALESCE(SUM(l.debit), 0)::text  AS debit,
           COALESCE(SUM(l.credit), 0)::text AS credit
    FROM accounts a
    LEFT JOIN journal_lines l   ON l."accountId" = a.id
    LEFT JOIN journal_entries e ON e.id = l."entryId"
    WHERE ${conditions.join(" AND ")}
    GROUP BY a.id
    ORDER BY a.code ASC;
    `,
    ...params,
  );

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    subtype: r.subtype,
    isControl: r.isControl,
    debit: BigInt(r.debit),
    credit: BigInt(r.credit),
  }));
}

// ---------------------------------------------------------------------------
// Trial balance — every account with its debit/credit totals. The grand totals
// of the debit and credit columns must be equal in a consistent ledger.
// ---------------------------------------------------------------------------
export async function trialBalance(orgId: string, asOf?: Date) {
  const accounts = (await aggregate(orgId, { to: asOf })).filter(
    (a) => a.debit !== 0n || a.credit !== 0n,
  );
  const totalDebit = accounts.reduce((s, a) => s + a.debit, 0n);
  const totalCredit = accounts.reduce((s, a) => s + a.credit, 0n);
  return { accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

// ---------------------------------------------------------------------------
// Profit & Loss for a period.
// ---------------------------------------------------------------------------
export async function profitAndLoss(orgId: string, from: Date, to: Date) {
  const rows = await aggregate(orgId, { from, to });

  const income = rows
    .filter((a) => a.type === "INCOME")
    .map((a) => ({ ...a, amount: signedBalance(a.type, a.debit, a.credit) }))
    .filter((a) => a.amount !== 0n);
  const expenses = rows
    .filter((a) => a.type === "EXPENSE")
    .map((a) => ({ ...a, amount: signedBalance(a.type, a.debit, a.credit) }))
    .filter((a) => a.amount !== 0n);

  const totalIncome = income.reduce((s, a) => s + a.amount, 0n);
  const totalExpenses = expenses.reduce((s, a) => s + a.amount, 0n);
  return { income, expenses, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
}

// Net income from the beginning of time up to `asOf` — rolled into equity on
// the balance sheet so that Assets = Liabilities + Equity holds.
async function netIncomeToDate(orgId: string, asOf: Date): Promise<bigint> {
  const rows = await aggregate(orgId, { to: asOf });
  let income = 0n;
  let expense = 0n;
  for (const a of rows) {
    if (a.type === "INCOME") income += signedBalance(a.type, a.debit, a.credit);
    else if (a.type === "EXPENSE")
      expense += signedBalance(a.type, a.debit, a.credit);
  }
  return income - expense;
}

// ---------------------------------------------------------------------------
// Balance sheet as of a date.
// ---------------------------------------------------------------------------
export async function balanceSheet(orgId: string, asOf?: Date) {
  const at = asOf ?? new Date();
  const rows = await aggregate(orgId, { to: at });

  const section = (type: AccountType) =>
    rows
      .filter((a) => a.type === type)
      .map((a) => ({ ...a, amount: signedBalance(a.type, a.debit, a.credit) }))
      .filter((a) => a.amount !== 0n);

  const assets = section("ASSET");
  const liabilities = section("LIABILITY");
  const equity = section("EQUITY");

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0n);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0n);
  const equityFromAccounts = equity.reduce((s, a) => s + a.amount, 0n);
  const currentEarnings = await netIncomeToDate(orgId, at);
  const totalEquity = equityFromAccounts + currentEarnings;

  return {
    asOf: at,
    assets,
    liabilities,
    equity,
    currentEarnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
  };
}

export { isDebitNormal };
