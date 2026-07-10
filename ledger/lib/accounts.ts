import type { AccountType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function listAccounts(orgId: string) {
  return prisma.account.findMany({
    where: { orgId },
    orderBy: { code: "asc" },
  });
}

// Bank and cash accounts — where money is received into / paid out of.
export function bankAndCashAccounts(orgId: string) {
  return prisma.account.findMany({
    where: { orgId, subtype: { in: ["bank", "cash"] } },
    orderBy: { code: "asc" },
  });
}

// Credit-card accounts — liabilities you can charge to and pay down.
export function creditCardAccounts(orgId: string) {
  return prisma.account.findMany({
    where: { orgId, subtype: "credit_card" },
    orderBy: { code: "asc" },
  });
}

// Every account money can be paid out of: bank, cash and credit cards.
export function moneyOutAccounts(orgId: string) {
  return prisma.account.findMany({
    where: { orgId, subtype: { in: ["bank", "cash", "credit_card"] } },
    orderBy: { code: "asc" },
  });
}

// Accounts that can appear on receipt lines (money in → credit side).
//
// BUG FIX (QA Reliability Swarm, Track 8): this used to filter with a bare
// `subtype: { notIn: ["bank", "cash"] } }` ANDed alongside the OR below.
// Under standard SQL three-valued logic, `<col> NOT IN (...)` evaluates to
// UNKNOWN (never TRUE) whenever `<col> IS NULL`, so Prisma's `notIn` silently
// EXCLUDED every row whose `subtype` column is NULL — which is most default
// INCOME/EXPENSE accounts (see lib/chart-of-accounts.ts; only a handful of
// accounts have a non-null subtype at all). The nested `OR: [{ subtype: null
// }, { subtype: { notIn: [...] } }]` below is the explicit, NULL-safe
// equivalent of "subtype is not bank/cash (including when it's simply unset)".
export function receiptCounterpartAccounts(orgId: string) {
  return prisma.account.findMany({
    where: {
      orgId,
      AND: [
        { OR: [{ type: "INCOME" }, { subtype: "receivable", isControl: true }] },
        { OR: [{ subtype: null }, { subtype: { notIn: ["bank", "cash"] } }] },
      ],
    },
    orderBy: { code: "asc" },
  });
}

// Accounts that can appear on payment lines (money out → debit side).
// See receiptCounterpartAccounts' doc comment above for the NULL-subtype
// `notIn` bug this same shape fixes — this was the query responsible for the
// "expense"/supplier-payment action failing with "Choose an expense account."
// on every fresh organization still using the seeded default chart of
// accounts (every default EXPENSE account except "5000 Cost of goods sold"
// has a null `subtype`).
export function paymentCounterpartAccounts(orgId: string) {
  return prisma.account.findMany({
    where: {
      orgId,
      AND: [
        { OR: [{ type: "EXPENSE" }, { subtype: "payable", isControl: true }] },
        { OR: [{ subtype: null }, { subtype: { notIn: ["bank", "cash"] } }] },
      ],
    },
    orderBy: { code: "asc" },
  });
}

// Asset-type accounts suitable for fixed-asset account pickers (the asset
// account, the accumulated-depreciation account) — every ASSET account except
// the ones that are subledger-backed control accounts for something else
// (bank/cash, receivable, inventory). Uses the same NULL-safe `notIn` shape as
// receiptCounterpartAccounts/paymentCounterpartAccounts above — a bare `notIn`
// would silently exclude every account whose subtype is unset.
export function fixedAssetCapableAccounts(orgId: string) {
  return prisma.account.findMany({
    where: {
      orgId,
      type: "ASSET",
      OR: [
        { subtype: null },
        { subtype: { notIn: ["bank", "cash", "receivable", "inventory", "tax_recoverable"] } },
      ],
    },
    orderBy: { code: "asc" },
  });
}

async function attachBalances<T extends { id: string }>(orgId: string, accounts: T[]) {
  if (accounts.length === 0) return [] as (T & { balance: bigint })[];

  const sums = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: { orgId, accountId: { in: accounts.map((a) => a.id) } },
    _sum: { debit: true, credit: true },
  });
  const byId = new Map(
    sums.map((s) => [s.accountId, (s._sum.debit ?? 0n) - (s._sum.credit ?? 0n)]),
  );

  return accounts.map((a) => ({ ...a, balance: byId.get(a.id) ?? 0n }));
}

export async function bankAndCashWithBalances(orgId: string) {
  return attachBalances(orgId, await bankAndCashAccounts(orgId));
}

// Bank, cash and credit-card accounts with balances — for the "paid from"
// selector so card charges can be recorded.
export async function moneyOutWithBalances(orgId: string) {
  return attachBalances(orgId, await moneyOutAccounts(orgId));
}

export function accountsByType(orgId: string, type: AccountType) {
  return prisma.account.findMany({
    where: { orgId, type },
    orderBy: { code: "asc" },
  });
}

async function controlAccount(orgId: string, subtype: "receivable" | "payable") {
  const account = await prisma.account.findFirst({
    where: { orgId, subtype, isControl: true },
  });
  if (!account) {
    throw new Error(`Missing ${subtype} control account for org ${orgId}`);
  }
  return account;
}

export function receivableAccount(orgId: string) {
  return controlAccount(orgId, "receivable");
}

export function payableAccount(orgId: string) {
  return controlAccount(orgId, "payable");
}

export async function inventoryAccount(orgId: string) {
  const account = await prisma.account.findFirst({
    where: { orgId, subtype: "inventory" },
  });
  if (!account) {
    throw new Error(`Missing inventory control account for org ${orgId}`);
  }
  return account;
}

export async function cogsAccount(orgId: string) {
  const account = await prisma.account.findFirst({
    where: { orgId, subtype: "cogs" },
  });
  if (!account) {
    throw new Error(`Missing cost-of-goods-sold account for org ${orgId}`);
  }
  return account;
}

// Input VAT paid on purchases — a recoverable asset. Created on demand so
// organizations that pre-date the tax feature get the account automatically.
export async function ensureTaxRecoverableAccount(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  const existing = await tx.account.findFirst({
    where: { orgId, subtype: "tax_recoverable" },
  });
  if (existing) return existing;
  return tx.account.create({
    data: {
      orgId,
      code: "1300",
      name: "VAT recoverable",
      type: "ASSET",
      subtype: "tax_recoverable",
    },
  });
}

// Output VAT collected on sales — a payable liability (seeded as 2100).
export async function ensureTaxPayableAccount(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  const existing = await tx.account.findFirst({
    where: { orgId, subtype: "tax" },
  });
  if (existing) return existing;
  return tx.account.create({
    data: {
      orgId,
      code: "2100",
      name: "Tax payable",
      type: "LIABILITY",
      subtype: "tax",
    },
  });
}

// Fixed assets at cost — created on demand for organizations that pre-date
// the fixed-assets feature (new orgs get it seeded, see chart-of-accounts.ts).
export async function ensureFixedAssetAccount(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  const existing = await tx.account.findFirst({
    where: { orgId, subtype: "fixed_asset" },
  });
  if (existing) return existing;
  return tx.account.create({
    data: {
      orgId,
      code: "1500",
      name: "Fixed assets",
      type: "ASSET",
      subtype: "fixed_asset",
    },
  });
}

// Contra-asset — typed ASSET (this schema has no separate "contra" type) but
// naturally carries a credit balance; signedBalance() already nets debit-credit
// for ASSET accounts, so it correctly reduces total assets on reports.
export async function ensureAccumulatedDepreciationAccount(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  const existing = await tx.account.findFirst({
    where: { orgId, subtype: "accumulated_depreciation" },
  });
  if (existing) return existing;
  return tx.account.create({
    data: {
      orgId,
      code: "1510",
      name: "Accumulated depreciation",
      type: "ASSET",
      subtype: "accumulated_depreciation",
    },
  });
}

export async function ensureDepreciationExpenseAccount(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  const existing = await tx.account.findFirst({
    where: { orgId, subtype: "depreciation_expense" },
  });
  if (existing) return existing;
  return tx.account.create({
    data: {
      orgId,
      code: "6400",
      name: "Depreciation expense",
      type: "EXPENSE",
      subtype: "depreciation_expense",
    },
  });
}

// Resolved automatically at disposal-posting time — not a user-chosen field
// on the asset (see lib/fixed-assets/disposal.ts).
export async function ensureGainOnDisposalAccount(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  const existing = await tx.account.findFirst({
    where: { orgId, subtype: "gain_on_disposal" },
  });
  if (existing) return existing;
  return tx.account.create({
    data: {
      orgId,
      code: "4910",
      name: "Gain on disposal of assets",
      type: "INCOME",
      subtype: "gain_on_disposal",
    },
  });
}

export async function ensureLossOnDisposalAccount(
  tx: Prisma.TransactionClient,
  orgId: string,
) {
  const existing = await tx.account.findFirst({
    where: { orgId, subtype: "loss_on_disposal" },
  });
  if (existing) return existing;
  return tx.account.create({
    data: {
      orgId,
      code: "6410",
      name: "Loss on disposal of assets",
      type: "EXPENSE",
      subtype: "loss_on_disposal",
    },
  });
}

export function isDebitNormal(type: AccountType): boolean {
  return type === "ASSET" || type === "EXPENSE";
}

// Net balance of an account expressed on its "normal" side as a positive
// number for a healthy balance (assets/expenses are debit-normal; liabilities,
// equity and income are credit-normal).
export function signedBalance(
  type: AccountType,
  debit: bigint,
  credit: bigint,
): bigint {
  return isDebitNormal(type) ? debit - credit : credit - debit;
}
