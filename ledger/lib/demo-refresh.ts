import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getDueSoonAndOverdueInvoices, getPaymentReminderCount } from "@/lib/billing/reminders";
import { countLowStockItems } from "@/lib/reorder";
import { isDemoOrgId } from "@/lib/demo-accounts";

// ---------------------------------------------------------------------------
// Rolling maintenance for the three Bantoo Books demo organizations.
//
// Keeps dashboard widgets clean every day:
//   • Zero payment reminders — every invoice is paid, nothing overdue
//   • Fresh month-to-date sales & expenses (dates shifted to today)
//   • Zero low-stock alerts — every item assumed reordered, stocked well
//     above its reorder level
//
// Only runs for demo orgs — real customer data is never touched.
// ---------------------------------------------------------------------------

export type DemoRefreshResult = {
  orgId: string;
  shiftedDays: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  dueSoonInvoices: number;
  lowStockItems: number;
};

export type DemoOrgHealth = {
  orgId: string;
  unpaidInvoices: number;
  overdueInvoices: number;
  paymentReminders: number;
  lowStockItems: number;
  newestDueDate: string | null;
  oldestOpenDueDate: string | null;
};

const REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const lastRefreshAtByOrg = new Map<string, number>();

// Truncates to a UTC calendar date (midnight), matching @db.Date columns.
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  const d = startOfUtcDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Deterministic numeric seed from an org id so each demo company gets a
// stable but distinct reminder/inventory profile.
export function demoOrgSeed(orgId: string): number {
  let h = 0;
  for (let i = 0; i < orgId.length; i++) {
    h = (h * 31 + orgId.charCodeAt(i)) >>> 0;
  }
  return h;
}

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysBetween(later: Date, earlier: Date): number {
  const a = startOfUtcDay(later).getTime();
  const b = startOfUtcDay(earlier).getTime();
  return Math.round((a - b) / 86_400_000);
}

// Latest operational document date — used to roll the whole timeline forward.
async function getMaxActivityDate(orgId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<{ max_date: Date | null }[]>`
    SELECT MAX(d) AS max_date FROM (
      SELECT MAX(date) AS d FROM sales_invoices WHERE "orgId" = ${orgId}
      UNION ALL SELECT MAX(date) FROM sales_receipts WHERE "orgId" = ${orgId}
      UNION ALL SELECT MAX(date) FROM purchase_invoices WHERE "orgId" = ${orgId}
      UNION ALL SELECT MAX(date) FROM receipts WHERE "orgId" = ${orgId}
      UNION ALL SELECT MAX(date) FROM payments WHERE "orgId" = ${orgId}
      UNION ALL SELECT MAX(date) FROM goods_receipts WHERE "orgId" = ${orgId}
      UNION ALL SELECT MAX("entryDate") FROM journal_entries WHERE "orgId" = ${orgId}
    ) t
  `;
  const max = rows[0]?.max_date;
  return max ? startOfUtcDay(max) : null;
}

// Shift every dated document and journal entry forward so the books stay
// internally consistent but the newest activity lands on today.
async function shiftOrgDates(orgId: string, days: number): Promise<void> {
  if (days <= 0) return;

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE journal_entries
      SET "entryDate" = "entryDate" + ${days}::integer
      WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE sales_invoices
      SET date = date + ${days}::integer,
          "dueDate" = CASE
            WHEN "dueDate" IS NOT NULL THEN "dueDate" + ${days}::integer
            ELSE NULL
          END
      WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE sales_receipts SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE purchase_invoices
      SET date = date + ${days}::integer,
          "dueDate" = CASE
            WHEN "dueDate" IS NOT NULL THEN "dueDate" + ${days}::integer
            ELSE NULL
          END
      WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE receipts SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE payments SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE goods_receipts SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE credit_notes SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE debit_notes SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE refund_receipts SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE inter_account_transfers SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE inventory_write_offs SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
    prisma.$executeRaw`
      UPDATE inventory_adjustments SET date = date + ${days}::integer WHERE "orgId" = ${orgId}
    `,
  ]);
}

// Every demo invoice is settled — no overdue, no due-soon, no reminders.
async function normalizePaymentReminders(orgId: string): Promise<{
  unpaid: number;
  overdue: number;
  dueSoon: number;
}> {
  await prisma.salesInvoice.updateMany({
    where: { orgId, status: { not: "paid" } },
    data: { status: "paid" },
  });

  return { unpaid: 0, overdue: 0, dueSoon: 0 };
}

// Every low/near-reorder item is assumed reordered — restocked comfortably
// above its reorder level, same as a healthy item would be.
async function normalizeInventoryLevels(orgId: string): Promise<number> {
  const items = await prisma.inventoryItem.findMany({
    where: { orgId, reorderLevel: { not: null } },
    select: { id: true, qtyOnHand: true, valueOnHand: true, reorderLevel: true },
    orderBy: { code: "asc" },
  });
  if (items.length === 0) return 0;

  const rng = seededRng(demoOrgSeed(orgId) ^ 0x85ebca6b);

  for (const item of items) {
    const reorder = new Prisma.Decimal(item.reorderLevel!);
    if (reorder.lte(0)) continue;

    const targetQty = reorder.times(2.2 + rng() * 1.8).floor(); // healthy stock

    const currentQty = new Prisma.Decimal(item.qtyOnHand);
    if (targetQty.eq(currentQty)) continue;

    const currentValue = new Prisma.Decimal(item.valueOnHand.toString());
    const avgCost = currentQty.gt(0) ? currentValue.div(currentQty) : new Prisma.Decimal(0);
    const newValue = avgCost.times(targetQty);

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        qtyOnHand: targetQty,
        valueOnHand: BigInt(Math.max(0, Math.round(Number(newValue.toFixed(0))))),
      },
    });
  }

  return countLowStockItems(orgId);
}

/** Snapshot of the dashboard-facing counts for a demo org. */
export async function auditDemoOrgHealth(
  orgId: string,
  now: Date = new Date(),
): Promise<DemoOrgHealth> {
  const today = startOfUtcDay(now);
  const [unpaidInvoices, reminders, lowStockItems, openInvoices] = await Promise.all([
    prisma.salesInvoice.count({
      where: { orgId, status: { not: "paid" }, dueDate: { not: null } },
    }),
    getDueSoonAndOverdueInvoices(orgId, 7, now),
    countLowStockItems(orgId),
    prisma.salesInvoice.findMany({
      where: { orgId, status: { not: "paid" }, dueDate: { not: null } },
      select: { dueDate: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const dueDates = openInvoices
    .map((inv) => (inv.dueDate ? startOfUtcDay(inv.dueDate) : null))
    .filter((d): d is Date => d !== null);

  return {
    orgId,
    unpaidInvoices,
    overdueInvoices: reminders.overdue.length,
    paymentReminders: reminders.dueSoon.length + reminders.overdue.length,
    lowStockItems,
    oldestOpenDueDate: dueDates[0]?.toISOString().slice(0, 10) ?? null,
    newestDueDate: dueDates.at(-1)?.toISOString().slice(0, 10) ?? null,
  };
}

// Returns true when the dashboard would look stale or overwhelming.
export async function needsDemoRefresh(orgId: string, now: Date = new Date()): Promise<boolean> {
  const today = startOfUtcDay(now);
  const [reminderCount, lowStock, maxDate] = await Promise.all([
    getPaymentReminderCount(orgId, 7, now),
    countLowStockItems(orgId),
    getMaxActivityDate(orgId),
  ]);

  if (reminderCount > 0) return true;
  if (lowStock > 0) return true;
  if (!maxDate) return true;

  const daysBehind = daysBetween(today, maxDate);
  return daysBehind > 2;
}

export type RefreshDemoOptions = {
  /** When true, skip the demo-org guard (CLI only — email is pre-validated). */
  force?: boolean;
};

/**
 * Re-aligns a single demo organization's dates, settles every invoice, and
 * restocks every item above its reorder level — the dashboard always shows
 * a healthy, caught-up business with nothing due and nothing to reorder.
 * Always runs immediately — no cooldown. No-op for non-demo orgs unless force.
 */
export async function refreshDemoAccountData(
  orgId: string,
  now: Date = new Date(),
  options: RefreshDemoOptions = {},
): Promise<DemoRefreshResult | null> {
  if (!options.force && !(await isDemoOrgId(orgId))) return null;

  const today = startOfUtcDay(now);
  const maxDate = await getMaxActivityDate(orgId);
  const shiftDays = maxDate ? Math.max(0, daysBetween(today, maxDate)) : 0;

  if (shiftDays > 0) {
    await shiftOrgDates(orgId, shiftDays);
  }

  const reminders = await normalizePaymentReminders(orgId);
  const lowStock = await normalizeInventoryLevels(orgId);

  const result = {
    orgId,
    shiftedDays: shiftDays,
    unpaidInvoices: reminders.unpaid,
    overdueInvoices: reminders.overdue,
    dueSoonInvoices: reminders.dueSoon,
    lowStockItems: lowStock,
  };

  lastRefreshAtByOrg.set(orgId, Date.now());
  return result;
}

/**
 * Runs refresh at most once per 24 h per org (per server instance), unless the
 * dashboard already looks stale. Safe to call on demo login or page load.
 */
export async function maybeRefreshDemoAccount(
  orgId: string,
  now: Date = new Date(),
): Promise<DemoRefreshResult | null> {
  if (!(await isDemoOrgId(orgId))) return null;

  const last = lastRefreshAtByOrg.get(orgId) ?? 0;
  const cooldownExpired = Date.now() - last >= REFRESH_COOLDOWN_MS;
  const stale = await needsDemoRefresh(orgId, now);

  if (!cooldownExpired && !stale) return null;

  const result = await refreshDemoAccountData(orgId, now);
  if (result) lastRefreshAtByOrg.set(orgId, Date.now());
  return result;
}

/** Test helper — clears the in-memory per-org cooldown. */
export function resetDemoRefreshCooldown(): void {
  lastRefreshAtByOrg.clear();
}
