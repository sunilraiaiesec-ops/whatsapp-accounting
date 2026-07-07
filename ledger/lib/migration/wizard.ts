import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { parseAmount, formatAmount } from "@/lib/money";
import {
  BALANCE_SHEET_TYPES,
  plainCategoriesNeedingDefaultAccount,
} from "@/lib/migration/categories";
import type {
  AccountSummary,
  ClientWizardState,
  InventoryBalanceRow,
  PartySummary,
  WizardState,
} from "@/lib/migration/types";

export class MigrationError extends Error {}

// "Administrator" for the purposes of this wizard = OWNER or ADMIN — the two
// roles that already have elevated privileges elsewhere (org reset is
// OWNER-only; this is intentionally slightly broader, matching the task's
// "administrator" language, which in this app's Role enum means OWNER or
// ADMIN, not STAFF).
export function isAdminRole(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function toDateOnly(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Wizard row + default chart-of-accounts setup
// ---------------------------------------------------------------------------

// Idempotent: returns the existing wizard row for the org, or creates a new
// NOT_STARTED one. Called from every entry point (onboarding "Existing
// business", and the permanent Settings → Migration link) so a wizard row
// always exists once anyone has opened the wizard.
export async function getOrCreateWizard(orgId: string) {
  const existing = await prisma.migrationWizard.findUnique({ where: { orgId } });
  if (existing) return existing;
  return prisma.migrationWizard.create({
    data: { orgId, status: "NOT_STARTED", currentStep: 1 },
  });
}

// Creates any "plain" balance-sheet account subtype (Fixed assets,
// Investments, Deposits, Loans, Credit cards, Payroll liabilities, Tax
// payable, Owner capital, Retained earnings, Opening equity) that this org
// doesn't have yet, following the same findFirst-by-subtype-else-create
// convention as lib/accounts.ts#ensureTaxPayableAccount. Safe to call
// repeatedly — never creates a duplicate.
export async function ensureDefaultAccounts(orgId: string): Promise<void> {
  for (const cat of plainCategoriesNeedingDefaultAccount()) {
    const existing = await prisma.account.findFirst({
      where: { orgId, subtype: cat.subtype },
      select: { id: true },
    });
    if (existing) continue;
    const def = cat.defaultAccount!;
    const type = categoryAccountType(cat.key);
    const code = await freeAccountCode(orgId, def.code);
    await prisma.account.create({
      data: { orgId, code, name: def.name, type, subtype: cat.subtype },
    });
  }
}

function categoryAccountType(
  key: string,
): "ASSET" | "LIABILITY" | "EQUITY" {
  if (["fixed_asset", "investment", "deposit"].includes(key)) return "ASSET";
  if (["loan", "credit_card", "payroll_liability", "tax"].includes(key)) return "LIABILITY";
  return "EQUITY";
}

// If `code` is already taken by another account in this org (e.g. imported
// via Step 2's chart-of-accounts CSV import), append digits until free
// rather than failing the whole wizard load.
async function freeAccountCode(orgId: string, code: string): Promise<string> {
  let candidate = code;
  let suffix = 0;
  // Bounded loop: astronomically unlikely to need more than a handful of
  // attempts, but avoid any chance of an infinite loop.
  for (let i = 0; i < 50; i++) {
    const taken = await prisma.account.findUnique({
      where: { orgId_code: { orgId, code: candidate } },
      select: { id: true },
    });
    if (!taken) return candidate;
    suffix += 1;
    candidate = `${code}-${suffix}`;
  }
  throw new MigrationError(`Could not allocate a free account code near ${code}`);
}

// ---------------------------------------------------------------------------
// Load full wizard state
// ---------------------------------------------------------------------------

export async function loadWizardState(orgId: string): Promise<WizardState> {
  await ensureDefaultAccounts(orgId);
  const wizard = await getOrCreateWizard(orgId);

  const [accounts, customers, suppliers, items, openingBalances, bankBalances, customerBalances, supplierBalances, inventoryBalances, acks] =
    await Promise.all([
      prisma.account.findMany({
        where: { orgId, type: { in: BALANCE_SHEET_TYPES } },
        orderBy: { code: "asc" },
      }),
      prisma.party.findMany({
        where: { orgId, type: { in: ["customer", "both"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, phone: true },
      }),
      prisma.party.findMany({
        where: { orgId, type: { in: ["supplier", "both"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, phone: true },
      }),
      prisma.inventoryItem.findMany({
        where: { orgId },
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, unit: true },
      }),
      prisma.migrationOpeningBalance.findMany({ where: { wizardId: wizard.id } }),
      prisma.migrationBankBalance.findMany({ where: { wizardId: wizard.id } }),
      prisma.migrationCustomerBalance.findMany({ where: { wizardId: wizard.id } }),
      prisma.migrationSupplierBalance.findMany({ where: { wizardId: wizard.id } }),
      prisma.migrationInventoryBalance.findMany({ where: { wizardId: wizard.id } }),
      prisma.migrationAcknowledgedWarning.findMany({ where: { wizardId: wizard.id } }),
    ]);

  const accountSummaries: AccountSummary[] = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    isControl: a.isControl,
    currency: a.currency,
  }));
  const toParty = (p: { id: string; name: string; type: string; phone: string | null }): PartySummary => p;

  return {
    wizard: {
      id: wizard.id,
      orgId: wizard.orgId,
      status: wizard.status.toLowerCase() as WizardState["wizard"]["status"],
      currentStep: wizard.currentStep,
      openingDate: toDateOnly(wizard.openingDate),
      completedAt: wizard.completedAt ? wizard.completedAt.toISOString() : null,
      completedById: wizard.completedById,
    },
    accounts: accountSummaries,
    customers: customers.map(toParty),
    suppliers: suppliers.map(toParty),
    items,
    openingBalances: openingBalances.map((r) => ({ accountId: r.accountId, amount: r.amount })),
    bankBalances: bankBalances.map((r) => ({ accountId: r.accountId, amount: r.amount })),
    customerBalances: customerBalances.map((r) => ({ partyId: r.partyId, amount: r.amount })),
    supplierBalances: supplierBalances.map((r) => ({ partyId: r.partyId, amount: r.amount })),
    inventoryBalances: inventoryBalances.map((r) => ({
      itemId: r.itemId,
      quantity: r.quantity.toString(),
      unit: r.unit,
      unitCost: r.unitCost,
      totalValue: r.totalValue,
      warehouse: r.warehouse,
    })),
    acknowledgedWarnings: acks.map((a) => a.code),
  };
}

export function toClientState(
  state: WizardState,
  currency: string,
  isAdmin: boolean,
): ClientWizardState {
  return {
    wizard: state.wizard,
    accounts: state.accounts,
    customers: state.customers,
    suppliers: state.suppliers,
    items: state.items,
    openingBalances: state.openingBalances.map((r) => ({
      accountId: r.accountId,
      amount: formatAmount(r.amount, currency),
    })),
    bankBalances: state.bankBalances.map((r) => ({
      accountId: r.accountId,
      amount: formatAmount(r.amount, currency),
    })),
    customerBalances: state.customerBalances.map((r) => ({
      partyId: r.partyId,
      amount: formatAmount(r.amount, currency),
    })),
    supplierBalances: state.supplierBalances.map((r) => ({
      partyId: r.partyId,
      amount: formatAmount(r.amount, currency),
    })),
    inventoryBalances: state.inventoryBalances.map((r) => ({
      itemId: r.itemId,
      quantity: r.quantity,
      unit: r.unit,
      unitCost: formatAmount(r.unitCost, currency),
      totalValue: formatAmount(r.totalValue, currency),
      warehouse: r.warehouse,
    })),
    acknowledgedWarnings: state.acknowledgedWarnings,
    currency,
    isAdmin,
  };
}

// ---------------------------------------------------------------------------
// Mutations — every one re-derives the wizard row from orgId, so callers can
// never write into another org's staged data.
// ---------------------------------------------------------------------------

export async function setCurrentStep(orgId: string, step: number): Promise<void> {
  const wizard = await getOrCreateWizard(orgId);
  if (wizard.status === "COMPLETED") return;
  await prisma.migrationWizard.update({
    where: { id: wizard.id },
    data: { currentStep: step, status: "IN_PROGRESS" },
  });
}

export async function setOpeningDate(orgId: string, isoDate: string): Promise<void> {
  const wizard = await getOrCreateWizard(orgId);
  if (wizard.status === "COMPLETED") throw new MigrationError("This migration is already completed.");
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new MigrationError("Invalid opening date");
  await prisma.migrationWizard.update({
    where: { id: wizard.id },
    data: { openingDate: date, status: "IN_PROGRESS" },
  });
}

async function activeWizardId(orgId: string): Promise<string> {
  const wizard = await getOrCreateWizard(orgId);
  if (wizard.status === "COMPLETED") {
    throw new MigrationError(
      "This migration has already been completed and cannot be edited. An administrator can rerun it from Settings.",
    );
  }
  return wizard.id;
}

// Raw bigint setter — used both by the text-input upsert below and by Step
// 5A's opt-in balancing suggestions (lib/migration/suggestions.ts), which
// compute an exact bigint delta rather than parsing user-typed text.
export async function setOpeningBalanceRaw(
  orgId: string,
  accountId: string,
  amount: bigint,
): Promise<void> {
  const wizardId = await activeWizardId(orgId);
  const account = await prisma.account.findFirst({ where: { orgId, id: accountId }, select: { id: true } });
  if (!account) throw new MigrationError("Unknown account");
  await prisma.migrationOpeningBalance.upsert({
    where: { wizardId_accountId: { wizardId, accountId } },
    create: { wizardId, accountId, amount },
    update: { amount },
  });
}

export async function upsertOpeningBalance(
  orgId: string,
  accountId: string,
  amountText: string,
  currency: string,
): Promise<void> {
  await setOpeningBalanceRaw(orgId, accountId, parseAmount(amountText, currency));
}

export async function addBankAccount(
  orgId: string,
  input: { name: string; subtype: "bank" | "cash"; currency?: string | null },
): Promise<AccountSummary> {
  await activeWizardId(orgId);
  const name = input.name.trim();
  if (!name) throw new MigrationError("Account name is required");
  const code = await freeAccountCode(orgId, input.subtype === "bank" ? "1010" : "1000");
  const account = await prisma.account.create({
    data: {
      orgId,
      code,
      name,
      type: "ASSET",
      subtype: input.subtype,
      currency: input.currency?.trim() || null,
    },
  });
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    isControl: account.isControl,
    currency: account.currency,
  };
}

export async function upsertBankBalance(
  orgId: string,
  accountId: string,
  amountText: string,
  currency: string,
): Promise<void> {
  const wizardId = await activeWizardId(orgId);
  const account = await prisma.account.findFirst({
    where: { orgId, id: accountId, subtype: { in: ["bank", "cash"] } },
    select: { id: true },
  });
  if (!account) throw new MigrationError("Unknown bank/cash account");
  const amount = parseAmount(amountText, currency);
  await prisma.migrationBankBalance.upsert({
    where: { wizardId_accountId: { wizardId, accountId } },
    create: { wizardId, accountId, amount },
    update: { amount },
  });
}

export async function upsertCustomerBalance(
  orgId: string,
  partyId: string,
  amountText: string,
  currency: string,
): Promise<void> {
  const wizardId = await activeWizardId(orgId);
  const party = await prisma.party.findFirst({ where: { orgId, id: partyId }, select: { id: true } });
  if (!party) throw new MigrationError("Unknown customer");
  const amount = parseAmount(amountText, currency);
  await prisma.migrationCustomerBalance.upsert({
    where: { wizardId_partyId: { wizardId, partyId } },
    create: { wizardId, partyId, amount },
    update: { amount },
  });
}

export async function upsertSupplierBalance(
  orgId: string,
  partyId: string,
  amountText: string,
  currency: string,
): Promise<void> {
  const wizardId = await activeWizardId(orgId);
  const party = await prisma.party.findFirst({ where: { orgId, id: partyId }, select: { id: true } });
  if (!party) throw new MigrationError("Unknown supplier");
  const amount = parseAmount(amountText, currency);
  await prisma.migrationSupplierBalance.upsert({
    where: { wizardId_partyId: { wizardId, partyId } },
    create: { wizardId, partyId, amount },
    update: { amount },
  });
}

export function computeInventoryLine(
  quantityText: string,
  unitCostText: string,
  currency: string,
): { quantity: Prisma.Decimal; unitCost: bigint; totalValue: bigint } {
  const quantity = new Prisma.Decimal(quantityText || "0");
  const unitCost = parseAmount(unitCostText || "0", currency);
  const totalValue = BigInt(quantity.times(unitCost.toString()).toFixed(0));
  return { quantity, unitCost, totalValue };
}

export async function upsertInventoryBalance(
  orgId: string,
  itemId: string,
  input: { quantity: string; unit?: string | null; unitCost: string; warehouse?: string | null },
  currency: string,
): Promise<InventoryBalanceRow> {
  const wizardId = await activeWizardId(orgId);
  const item = await prisma.inventoryItem.findFirst({ where: { orgId, id: itemId }, select: { id: true } });
  if (!item) throw new MigrationError("Unknown inventory item");
  const { quantity, unitCost, totalValue } = computeInventoryLine(input.quantity, input.unitCost, currency);
  const row = await prisma.migrationInventoryBalance.upsert({
    where: { wizardId_itemId: { wizardId, itemId } },
    create: {
      wizardId,
      itemId,
      quantity,
      unit: input.unit?.trim() || null,
      unitCost,
      totalValue,
      warehouse: input.warehouse?.trim() || null,
    },
    update: {
      quantity,
      unit: input.unit?.trim() || null,
      unitCost,
      totalValue,
      warehouse: input.warehouse?.trim() || null,
    },
  });
  return {
    itemId: row.itemId,
    quantity: row.quantity.toString(),
    unit: row.unit,
    unitCost: row.unitCost,
    totalValue: row.totalValue,
    warehouse: row.warehouse,
  };
}

export async function removeInventoryBalance(orgId: string, itemId: string): Promise<void> {
  const wizardId = await activeWizardId(orgId);
  await prisma.migrationInventoryBalance.deleteMany({ where: { wizardId, itemId } });
}

export async function acknowledgeWarning(orgId: string, code: string): Promise<void> {
  const wizardId = await activeWizardId(orgId);
  await prisma.migrationAcknowledgedWarning.upsert({
    where: { wizardId_code: { wizardId, code } },
    create: { wizardId, code },
    update: {},
  });
}

export async function unacknowledgeWarning(orgId: string, code: string): Promise<void> {
  const wizardId = await activeWizardId(orgId);
  await prisma.migrationAcknowledgedWarning.deleteMany({ where: { wizardId, code } });
}
