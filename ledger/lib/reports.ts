import type { AccountType } from "@prisma/client";

import { bankAndCashWithBalances, isDebitNormal, signedBalance } from "@/lib/accounts";
import { listInventoryItems } from "@/lib/inventory";
import { listParties } from "@/lib/parties";
import { listPartyBalances } from "@/lib/party-ledger";
import { prisma } from "@/lib/prisma";

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

export type PartyBalanceRow = {
  id: string;
  name: string;
  balance: bigint;
};

export async function partyBalanceSummary(
  orgId: string,
  kind: "customer" | "supplier",
): Promise<{ rows: PartyBalanceRow[]; total: bigint }> {
  const [parties, balances] = await Promise.all([
    listParties(orgId, kind),
    listPartyBalances(orgId, kind),
  ]);

  const rows = parties
    .map((p) => ({
      id: p.id,
      name: p.name,
      balance: balances.get(p.id) ?? 0n,
    }))
    .filter((p) => p.balance !== 0n)
    .sort((a, b) => (a.balance > b.balance ? -1 : a.balance < b.balance ? 1 : 0));

  const total = rows.reduce((s, r) => s + r.balance, 0n);
  return { rows, total };
}

export type AgingBucketKey =
  | "current"
  | "days1_30"
  | "days31_60"
  | "days61_90"
  | "over90";

export type AgingRow = {
  partyId: string;
  partyName: string;
  current: bigint;
  days1_30: bigint;
  days31_60: bigint;
  days61_90: bigint;
  over90: bigint;
  total: bigint;
};

function agingBucket(asOf: Date, dueDate: Date): AgingBucketKey {
  const ms = asOf.getTime() - dueDate.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "days1_30";
  if (days <= 60) return "days31_60";
  if (days <= 90) return "days61_90";
  return "over90";
}

function emptyAgingRow(partyId: string, partyName: string): AgingRow {
  return {
    partyId,
    partyName,
    current: 0n,
    days1_30: 0n,
    days31_60: 0n,
    days61_90: 0n,
    over90: 0n,
    total: 0n,
  };
}

export async function receivablesAging(
  orgId: string,
  asOf = new Date(),
): Promise<{ asOf: Date; rows: AgingRow[]; totals: AgingRow }> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { orgId, status: "unpaid" },
    include: { party: { select: { id: true, name: true } } },
  });

  const byParty = new Map<string, AgingRow>();
  for (const inv of invoices) {
    const due = inv.dueDate ?? inv.date;
    const bucket = agingBucket(asOf, due);
    let row = byParty.get(inv.partyId);
    if (!row) {
      row = emptyAgingRow(inv.partyId, inv.party.name);
      byParty.set(inv.partyId, row);
    }
    row[bucket] += inv.total;
    row.total += inv.total;
  }

  const rows = [...byParty.values()].sort((a, b) =>
    a.partyName.localeCompare(b.partyName),
  );
  const totals = rows.reduce(
    (acc, row) => ({
      partyId: "",
      partyName: "Total",
      current: acc.current + row.current,
      days1_30: acc.days1_30 + row.days1_30,
      days31_60: acc.days31_60 + row.days31_60,
      days61_90: acc.days61_90 + row.days61_90,
      over90: acc.over90 + row.over90,
      total: acc.total + row.total,
    }),
    emptyAgingRow("", "Total"),
  );

  return { asOf, rows, totals };
}

export async function payablesAging(
  orgId: string,
  asOf = new Date(),
): Promise<{ asOf: Date; rows: AgingRow[]; totals: AgingRow }> {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { orgId, status: "unpaid" },
    include: { party: { select: { id: true, name: true } } },
  });

  const byParty = new Map<string, AgingRow>();
  for (const inv of invoices) {
    const due = inv.dueDate ?? inv.date;
    const bucket = agingBucket(asOf, due);
    let row = byParty.get(inv.partyId);
    if (!row) {
      row = emptyAgingRow(inv.partyId, inv.party.name);
      byParty.set(inv.partyId, row);
    }
    row[bucket] += inv.total;
    row.total += inv.total;
  }

  const rows = [...byParty.values()].sort((a, b) =>
    a.partyName.localeCompare(b.partyName),
  );
  const totals = rows.reduce(
    (acc, row) => ({
      partyId: "",
      partyName: "Total",
      current: acc.current + row.current,
      days1_30: acc.days1_30 + row.days1_30,
      days31_60: acc.days31_60 + row.days31_60,
      days61_90: acc.days61_90 + row.days61_90,
      over90: acc.over90 + row.over90,
      total: acc.total + row.total,
    }),
    emptyAgingRow("", "Total"),
  );

  return { asOf, rows, totals };
}

export type GeneralLedgerLine = {
  id: string;
  date: Date;
  description: string | null;
  reference: string | null;
  debit: bigint;
  credit: bigint;
  balance: bigint;
  partyName: string | null;
};

export type GeneralLedgerAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  lines: GeneralLedgerLine[];
  totalDebit: bigint;
  totalCredit: bigint;
  closingBalance: bigint;
};

export async function generalLedger(orgId: string): Promise<GeneralLedgerAccount[]> {
  const accounts = await prisma.account.findMany({
    where: { orgId },
    orderBy: { code: "asc" },
    include: {
      lines: {
        include: {
          entry: { select: { entryDate: true, description: true, reference: true } },
          party: { select: { name: true } },
        },
        orderBy: [{ entry: { entryDate: "asc" } }, { entry: { createdAt: "asc" } }],
      },
    },
  });

  return accounts
    .map((account) => {
      let balance = 0n;
      const lines: GeneralLedgerLine[] = account.lines.map((line) => {
        balance += line.debit - line.credit;
        return {
          id: line.id,
          date: line.entry.entryDate,
          description: line.entry.description,
          reference: line.entry.reference,
          debit: line.debit,
          credit: line.credit,
          balance,
          partyName: line.party?.name ?? null,
        };
      });

      const totalDebit = lines.reduce((s, l) => s + l.debit, 0n);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0n);

      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        lines,
        totalDebit,
        totalCredit,
        closingBalance: signedBalance(account.type, totalDebit, totalCredit),
      };
    })
    .filter((a) => a.lines.length > 0);
}

export async function cashSummary(orgId: string) {
  const accounts = await bankAndCashWithBalances(orgId);
  const total = accounts.reduce((s, a) => s + a.balance, 0n);
  return { accounts, total };
}

export async function inventoryValuation(orgId: string) {
  const items = await listInventoryItems(orgId);
  const rows = items
    .filter((it) => it.qtyOnHand.gt(0))
    .map((it) => ({
      id: it.id,
      code: it.code,
      name: it.name,
      qtyOnHand: it.qtyOnHand.toString(),
      valueOnHand: it.valueOnHand,
    }));
  const total = rows.reduce((s, r) => s + r.valueOnHand, 0n);
  return { rows, total };
}

export { isDebitNormal };
