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
export function receiptCounterpartAccounts(orgId: string) {
  return prisma.account.findMany({
    where: {
      orgId,
      subtype: { notIn: ["bank", "cash"] },
      OR: [{ type: "INCOME" }, { subtype: "receivable", isControl: true }],
    },
    orderBy: { code: "asc" },
  });
}

// Accounts that can appear on payment lines (money out → debit side).
export function paymentCounterpartAccounts(orgId: string) {
  return prisma.account.findMany({
    where: {
      orgId,
      subtype: { notIn: ["bank", "cash"] },
      OR: [{ type: "EXPENSE" }, { subtype: "payable", isControl: true }],
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
