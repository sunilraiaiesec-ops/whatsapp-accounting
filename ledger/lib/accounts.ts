import type { AccountType } from "@prisma/client";

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

export async function bankAndCashWithBalances(orgId: string) {
  const accounts = await bankAndCashAccounts(orgId);
  if (accounts.length === 0) return [];

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
