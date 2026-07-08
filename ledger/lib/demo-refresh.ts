import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getDueSoonAndOverdueInvoices, getPaymentReminderCount } from "@/lib/billing/reminders";
import { countLowStockItems } from "@/lib/reorder";
import { isDemoOrgId } from "@/lib/demo-accounts";

// ---------------------------------------------------------------------------
// Rolling maintenance for the three Bantoo Books demo organizations.
//
// Keeps dashboard widgets realistic every day:
//   • 6–8 payment reminders (1–3 overdue, rest due soon)
//   • Fresh month-to-date sales & expenses (dates shifted to today)
//   • 1–3 low-stock reorder alerts, a few near-reorder, rest healthy
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

// Build a realistic reminder profile: 6–8 total, 2–3 overdue, 1 due today,
// the rest due within the next 7 days.
export function buildReminderDueOffsets(orgId: string): number[] {
  const rng = seededRng(demoOrgSeed(orgId));
  const total = 6 + Math.floor(rng() * 3); // 6–8
  const overdueCount = 2 + Math.floor(rng() * 2); // 2–3
  const dueTodayCount = 1;
  const dueSoonCount = Math.max(0, total - overdueCount - dueTodayCount);

  const overdueOffsets = [-14, -10, -7, -5, -3, -2].slice(0, overdueCount);
  const dueSoonOffsets: number[] = [];
  for (let i = 0; i < dueSoonCount; i++) {
    dueSoonOffsets.push(1 + Math.floor(rng() * 7));
  }

  return [...overdueOffsets, ...Array(dueTodayCount).fill(0), ...dueSoonOffsets];
}

async function normalizePaymentReminders(orgId: string, today: Date): Promise<{
  unpaid: number;
  overdue: number;
  dueSoon: number;
}> {
  // Close out the backlog — hundreds of stale unpaid invoices are what break
  // the dashboard. Real businesses mostly have settled AR; we keep a handful
  // open for the reminder widget.
  await prisma.salesInvoice.updateMany({
    where: { orgId, status: { not: "paid" } },
    data: { status: "paid" },
  });

  const dueOffsets = buildReminderDueOffsets(orgId);
  const candidates = await prisma.salesInvoice.findMany({
    where: { orgId, dueDate: { not: null } },
    orderBy: [{ total: "desc" }, { date: "desc" }],
    take: 80,
    select: { id: true },
  });

  const rng = seededRng(demoOrgSeed(orgId) ^ 0x9e3779b9);
  const picked = new Set<string>();
  while (picked.size < dueOffsets.length && picked.size < candidates.length) {
    const idx = Math.floor(rng() * candidates.length);
    picked.add(candidates[idx].id);
  }
  const selected = [...picked];

  const todayUtc = startOfUtcDay(today);
  let overdue = 0;
  let dueSoon = 0;

  for (let i = 0; i < selected.length; i++) {
    const dueOffset = dueOffsets[i] ?? 7;
    const dueDate = addDays(todayUtc, dueOffset);
    const issueDate = addDays(dueDate, -(7 + Math.floor(rng() * 21)));

    await prisma.salesInvoice.update({
      where: { id: selected[i] },
      data: {
        status: "unpaid",
        date: issueDate,
        dueDate,
      },
    });

    if (dueOffset < 0) overdue++;
    else dueSoon++;
  }

  return { unpaid: selected.length, overdue, dueSoon };
}

async function normalizeInventoryLevels(orgId: string): Promise<number> {
  const items = await prisma.inventoryItem.findMany({
    where: { orgId, reorderLevel: { not: null } },
    select: { id: true, qtyOnHand: true, valueOnHand: true, reorderLevel: true },
    orderBy: { code: "asc" },
  });
  if (items.length === 0) return 0;

  const rng = seededRng(demoOrgSeed(orgId) ^ 0x85ebca6b);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const lowCount = 1 + Math.floor(rng() * 3); // 1–3 below reorder
  const nearCount = 3 + Math.floor(rng() * 3); // 3–5 at reorder level

  const lowIds = new Set(shuffled.slice(0, lowCount).map((it) => it.id));
  const nearIds = new Set(shuffled.slice(lowCount, lowCount + nearCount).map((it) => it.id));

  for (const item of items) {
    const reorder = new Prisma.Decimal(item.reorderLevel!);
    if (reorder.lte(0)) continue;

    let targetQty: Prisma.Decimal;
    if (lowIds.has(item.id)) {
      targetQty = reorder.times(0.35 + rng() * 0.15).floor(); // well below reorder
      if (targetQty.gte(reorder)) targetQty = reorder.minus(1).floor();
    } else if (nearIds.has(item.id)) {
      targetQty = reorder; // exactly at reorder → shows as low stock
    } else {
      targetQty = reorder.times(2.2 + rng() * 1.8).floor(); // healthy stock
    }

    if (targetQty.lt(0)) targetQty = new Prisma.Decimal(0);

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

  if (reminderCount > 10) return true;
  if (lowStock === 0 || lowStock > 10) return true;
  if (!maxDate) return true;

  const daysBehind = daysBetween(today, maxDate);
  return daysBehind > 2;
}

export type RefreshDemoOptions = {
  /** When true, skip the demo-org guard (CLI only — email is pre-validated). */
  force?: boolean;
};

/**
 * Re-aligns a single demo organization's dates, payment reminders, and
 * inventory levels so the dashboard always looks like an active business.
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

  const reminders = await normalizePaymentReminders(orgId, today);
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
