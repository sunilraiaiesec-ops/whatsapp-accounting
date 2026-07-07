import { cookies } from "next/headers";
import { Prisma, type Commission, type CommissionStatus, type Partner } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { COMMISSION_RATE_PERCENT, COMMISSION_WINDOW_MONTHS } from "@/lib/billing/plans";
import { currentYearMonth } from "@/lib/billing/ai-credits";

// ---------------------------------------------------------------------------
// Referral partners: capture, attribution, and commission calculation.
//
// A "partner" is a platform-wide entity (not org data) who refers new
// businesses to BantooBooks via a `?ref=CODE` link. The code is captured in
// a 90-day cookie (see middleware.ts, which duplicates REFERRAL_COOKIE_NAME
// as a literal string rather than importing this module — this module pulls
// in the Prisma client via lib/prisma.ts, which is not edge-runtime
// compatible, and middleware.ts runs in the edge runtime), read back at
// signup time by readReferralCookieCode(), and attributed once — and only
// once — to the newly created org by attributeReferralWithin(), which
// app/actions/auth.ts's signupAction / lib/org.ts's createOrganizationWithOwner
// call for every new signup regardless of whether a code was captured.
//
// Referral codes are always normalized to uppercase before being stored or
// looked up, so a plain Prisma `where: { referralCode }` equality lookup is
// effectively case-insensitive without needing a citext column or a raw
// query.
// ---------------------------------------------------------------------------

export const REFERRAL_COOKIE_NAME = "bantoo_ref";

export class PartnerError extends Error {}

function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

// Short, URL-safe, human-shareable code: an uppercase-alnum slug of the
// partner's name (first 8 characters) plus a 4-character random suffix so
// two partners with similar names never collide (the Partner.referralCode
// unique constraint is still the final backstop if they somehow do).
export function generateReferralCode(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  const stem = slug || "PARTNER";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
  return `${stem}${suffix}`;
}

export type CreatePartnerInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  referralCode?: string | null;
  userId?: string | null;
};

// Platform-admin partner creation (see app/actions/partners.ts, gated by
// isPlatformAdmin). Auto-generates a referral code from `name` when none is
// given. Prisma's own unique constraints on email/referralCode/userId are
// the source of truth for uniqueness; a violation is caught and re-thrown as
// a friendly PartnerError instead of a raw Prisma error leaking to the UI.
export async function createPartner(input: CreatePartnerInput): Promise<Partner> {
  const name = input.name.trim();
  if (!name) throw new PartnerError("Partner name is required.");

  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const referralCode = normalizeReferralCode(input.referralCode?.trim() || generateReferralCode(name));
  const userId = input.userId?.trim() || null;

  try {
    return await prisma.partner.create({
      data: { name, email, phone, referralCode, userId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? (err.meta.target as string[]).join(", ") : "field";
      throw new PartnerError(`A partner with this ${target} already exists.`);
    }
    throw err;
  }
}

// Platform-wide (not org-scoped — partners aren't org data) list for the
// admin partner-management page.
export async function listPartners(): Promise<Partner[]> {
  return prisma.partner.findMany({ orderBy: { createdAt: "desc" } });
}

export type PartnerWithStats = Partner & {
  referredOrgCount: number;
  lifetimeCommissionMinorUnits: bigint;
};

// Same as listPartners(), plus the two aggregate numbers the admin list
// table shows per partner. Kept as a separate function (rather than baking
// the aggregates into listPartners()) so callers that only need the plain
// rows (e.g. a future CLI/cron) aren't forced to pay for the extra queries.
export async function listPartnersWithStats(): Promise<PartnerWithStats[]> {
  const partners = await listPartners();
  if (partners.length === 0) return [];

  const [referralCounts, commissionSums] = await Promise.all([
    prisma.referral.groupBy({ by: ["partnerId"], _count: { _all: true } }),
    prisma.commission.groupBy({
      by: ["partnerId"],
      where: { status: { not: "CANCELLED" } },
      _sum: { amountMinorUnits: true },
    }),
  ]);
  const countByPartner = new Map(referralCounts.map((r) => [r.partnerId, r._count._all]));
  const sumByPartner = new Map(commissionSums.map((c) => [c.partnerId, c._sum.amountMinorUnits ?? 0n]));

  return partners.map((p) => ({
    ...p,
    referredOrgCount: countByPartner.get(p.id) ?? 0,
    lifetimeCommissionMinorUnits: sumByPartner.get(p.id) ?? 0n,
  }));
}

// EXACT name/signature required by lib/org.ts#createOrganizationWithOwner,
// which calls this inside its own signup transaction. Never throws — a
// bad/stale/unknown referral code, or a duplicate-key race on the
// Referral.orgId unique constraint (defensive only: this only ever runs
// once, at org creation, so a real duplicate should be impossible), must
// never block signup.
export async function attributeReferralWithin(
  tx: Prisma.TransactionClient,
  orgId: string,
  referralCode: string,
): Promise<void> {
  const code = normalizeReferralCode(referralCode);
  if (!code) return;

  try {
    const partner = await tx.partner.findUnique({ where: { referralCode: code } });
    if (!partner) return; // Unknown/stale code — silent no-op.

    await tx.referral.create({ data: { orgId, partnerId: partner.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return; // Referral already exists for this org — first-attribution wins.
    }
    // Never let a referral-attribution problem take down signup.
    console.error(`[billing/partners] attributeReferralWithin failed (org=${orgId}):`, err);
  }
}

// Server-side read of the 90-day referral cookie captured by middleware.ts,
// for use in the signup action (Node runtime, not edge — cookies() from
// next/headers is unavailable in middleware).
export async function readReferralCookieCode(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(REFERRAL_COOKIE_NAME)?.value?.trim();
  return value ? value : null;
}

// ---------------------------------------------------------------------------
// Commission calculation.
// ---------------------------------------------------------------------------

function parseYearMonth(yearMonth: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new PartnerError(`Invalid yearMonth "${yearMonth}", expected "YYYY-MM".`);
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

// A referral is commission-eligible for `yearMonth` when that month falls
// within the referred org's first COMMISSION_WINDOW_MONTHS (12) months of
// being a referred+paying org — i.e. the partner earns on this org's first
// year of revenue, not the partner's/org's lifetime. `attributedAt` must
// also not be after the month in question (a referral can't earn commission
// for a period before it existed).
function isReferralEligibleForMonth(attributedAt: Date, monthStart: Date, monthEnd: Date): boolean {
  if (attributedAt >= monthEnd) return false;
  const windowEnd = addMonthsUtc(attributedAt, COMMISSION_WINDOW_MONTHS);
  return windowEnd >= monthStart;
}

// BigInt-safe integer percentage — no floating point anywhere near money.
function commissionAmount(sumMinorUnits: bigint): bigint {
  return (sumMinorUnits * BigInt(COMMISSION_RATE_PERCENT)) / 100n;
}

export type ComputeCommissionsResult = { created: number; updated: number };

// Admin/cron-triggerable recompute for one calendar month across every
// referral. Idempotent and safe to re-run (e.g. after new PaymentRecords
// land, or to backfill/correct a past month).
//
// Revenue attribution choice: sums PaymentRecord.amountMinorUnits where
// status = 'SUCCEEDED' and `periodStart` falls within `yearMonth`, rather
// than `createdAt` — `periodStart` is the subscription billing period the
// payment actually covers, which is what "this org's revenue for month X"
// should mean; `createdAt` would instead reflect whenever the payment
// happened to be recorded (e.g. a late manual entry), which can drift from
// the period it's paying for.
//
// Status-preservation trade-off: an UPDATE never touches `status` — only a
// brand-new row is created as PENDING. This means recomputing after a
// commission has been moved to APPROVED/PAID/CANCELLED always refreshes its
// `amountMinorUnits` (so it stays in sync with the underlying payments) but
// never silently reopens or reverts a decision an admin already made.
//
// Zero-revenue rows: when the computed amount is exactly 0 AND no Commission
// row exists yet for (partner, org, month), nothing is created — there is
// nothing to pay out and no need to clutter the ledger with $0 PENDING rows
// every month for a quiet org. If a row already exists (of any status) it is
// still updated to reflect the new (possibly zero) amount, so it never goes
// stale relative to reality.
export async function computeAndUpsertCommissionsForMonth(
  yearMonth: string,
): Promise<ComputeCommissionsResult> {
  const { start, end } = parseYearMonth(yearMonth);

  const referrals = await prisma.referral.findMany({
    select: { orgId: true, partnerId: true, attributedAt: true },
  });

  let created = 0;
  let updated = 0;

  for (const referral of referrals) {
    if (!isReferralEligibleForMonth(referral.attributedAt, start, end)) continue;

    const payments = await prisma.paymentRecord.aggregate({
      where: {
        orgId: referral.orgId,
        status: "SUCCEEDED",
        periodStart: { gte: start, lt: end },
      },
      _sum: { amountMinorUnits: true },
    });
    const revenue = payments._sum.amountMinorUnits ?? 0n;
    const amount = commissionAmount(revenue);

    const existing = await prisma.commission.findUnique({
      where: {
        partnerId_orgId_periodMonth: {
          partnerId: referral.partnerId,
          orgId: referral.orgId,
          periodMonth: yearMonth,
        },
      },
    });

    if (existing) {
      await prisma.commission.update({
        where: { id: existing.id },
        data: { amountMinorUnits: amount },
      });
      updated++;
    } else if (amount > 0n) {
      await prisma.commission.create({
        data: {
          partnerId: referral.partnerId,
          orgId: referral.orgId,
          periodMonth: yearMonth,
          amountMinorUnits: amount,
          status: "PENDING",
        },
      });
      created++;
    }
  }

  return { created, updated };
}

// Simple admin transition helper — PENDING -> APPROVED -> PAID, or ->
// CANCELLED at any point. No org-scoping (commissions aren't org data), but
// a caller passing an unknown id gets a friendly 404-style error rather than
// a silent no-op.
export async function setCommissionStatus(
  commissionId: string,
  status: CommissionStatus,
): Promise<Commission> {
  const existing = await prisma.commission.findUnique({ where: { id: commissionId } });
  if (!existing) throw new PartnerError(`Commission not found: ${commissionId}`);

  return prisma.commission.update({ where: { id: commissionId }, data: { status } });
}

// ---------------------------------------------------------------------------
// Partner-facing dashboard data.
// ---------------------------------------------------------------------------

export type ReferredBusiness = {
  orgId: string;
  orgName: string;
  signupDate: Date;
  plan: string | null;
  subscriptionStatus: string | null;
};

export type PayoutHistoryRow = {
  id: string;
  orgId: string;
  orgName: string;
  periodMonth: string;
  amountMinorUnits: bigint;
  status: CommissionStatus;
};

export type PartnerDashboardData = {
  partner: { id: string; name: string; email: string | null; referralCode: string };
  referredBusinesses: ReferredBusiness[];
  activeSubscriptionCount: number;
  // "This month" = the current calendar month (UTC), matching
  // lib/billing/ai-credits.ts#currentYearMonth's convention.
  thisMonthCommissionMinorUnits: bigint;
  // Sum of every non-CANCELLED commission (PENDING + APPROVED + PAID) —
  // "what this partner has earned in total", including amounts not yet paid
  // out. `paidToDateMinorUnits` below is the PAID-only subset.
  lifetimeCommissionMinorUnits: bigint;
  paidToDateMinorUnits: bigint;
  payoutHistory: PayoutHistoryRow[];
};

// CRITICAL SECURITY INVARIANT: this function must NEVER expose another
// partner's data, another org's data, or a referred org's own underlying
// ledger (JournalEntry, invoices, etc.) — only the subscription/commission
// aggregates described above. This is structurally enforced, not just
// convention: every query below is scoped by the given `partnerId`, and the
// only fields ever selected off `Organization` are `id`/`name`/`createdAt`
// plus the related `Subscription`'s `plan`/`status` — no query in this
// function ever touches JournalEntry, JournalLine, Party, SalesInvoice, or
// any other business-data table. See lib/billing/partners.test.ts's
// isolation test for the automated check.
export async function getPartnerDashboardData(partnerId: string): Promise<PartnerDashboardData> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true, email: true, referralCode: true },
  });
  if (!partner) throw new PartnerError(`Partner not found: ${partnerId}`);

  const [referrals, commissions] = await Promise.all([
    prisma.referral.findMany({
      where: { partnerId },
      orderBy: { attributedAt: "desc" },
      select: {
        attributedAt: true,
        org: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            subscription: { select: { plan: true, status: true } },
          },
        },
      },
    }),
    prisma.commission.findMany({
      where: { partnerId },
      orderBy: { periodMonth: "desc" },
      select: {
        id: true,
        orgId: true,
        periodMonth: true,
        amountMinorUnits: true,
        status: true,
        org: { select: { name: true } },
      },
    }),
  ]);

  const referredBusinesses: ReferredBusiness[] = referrals.map((r) => ({
    orgId: r.org.id,
    orgName: r.org.name,
    signupDate: r.org.createdAt,
    plan: r.org.subscription?.plan ?? null,
    subscriptionStatus: r.org.subscription?.status ?? null,
  }));
  const activeSubscriptionCount = referrals.filter((r) => r.org.subscription?.status === "ACTIVE").length;

  const thisYearMonth = currentYearMonth();
  const thisMonthCommissionMinorUnits = commissions
    .filter((c) => c.periodMonth === thisYearMonth)
    .reduce((sum, c) => sum + c.amountMinorUnits, 0n);
  const lifetimeCommissionMinorUnits = commissions
    .filter((c) => c.status !== "CANCELLED")
    .reduce((sum, c) => sum + c.amountMinorUnits, 0n);
  const paidToDateMinorUnits = commissions
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + c.amountMinorUnits, 0n);

  const payoutHistory: PayoutHistoryRow[] = commissions.map((c) => ({
    id: c.id,
    orgId: c.orgId,
    orgName: c.org.name,
    periodMonth: c.periodMonth,
    amountMinorUnits: c.amountMinorUnits,
    status: c.status,
  }));

  return {
    partner,
    referredBusinesses,
    activeSubscriptionCount,
    thisMonthCommissionMinorUnits,
    lifetimeCommissionMinorUnits,
    paidToDateMinorUnits,
    payoutHistory,
  };
}

// ---------------------------------------------------------------------------
// CSV export ("prepare for monthly payout"). No payout automation — this
// only produces a data export string; an admin still pays partners out of
// band and records the result via setCommissionStatus.
// ---------------------------------------------------------------------------

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

// Amount is rendered in major units (e.g. "5000" not "5000 XAF") since a
// Commission row has no currency of its own — the platform commission
// ledger is denominated in the platform's own currency, not each referred
// org's baseCurrency. Formatted with the same digit-grouping as
// lib/money.ts#formatAmount would produce, but without a currency suffix
// (the CSV's use is internal bookkeeping, not a customer-facing statement).
function formatMajorUnits(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const grouped = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

const CSV_HEADER = ["Partner", "Referral code", "Business", "Period", "Amount", "Status"];

export type CommissionAdminRow = {
  id: string;
  partnerName: string;
  referralCode: string;
  orgName: string;
  periodMonth: string;
  amountMinorUnits: bigint;
  status: CommissionStatus;
};

// Flat, display-ready commission rows joined with partner/org names — backs
// both the admin commissions table and exportCommissionsCsv() below (kept as
// one query shape so the CSV and the on-screen table can never drift apart).
export async function listCommissionsForAdmin(partnerId?: string): Promise<CommissionAdminRow[]> {
  const commissions = await prisma.commission.findMany({
    where: partnerId ? { partnerId } : undefined,
    orderBy: [{ periodMonth: "desc" }, { partnerId: "asc" }],
    select: {
      id: true,
      periodMonth: true,
      amountMinorUnits: true,
      status: true,
      partner: { select: { name: true, referralCode: true } },
      org: { select: { name: true } },
    },
  });

  return commissions.map((c) => ({
    id: c.id,
    partnerName: c.partner.name,
    referralCode: c.partner.referralCode,
    orgName: c.org.name,
    periodMonth: c.periodMonth,
    amountMinorUnits: c.amountMinorUnits,
    status: c.status,
  }));
}

// If `partnerId` is given, only that partner's commissions; otherwise (the
// admin/platform-wide use) every commission. Returns a plain CSV string.
export async function exportCommissionsCsv(partnerId?: string): Promise<string> {
  const rows = await listCommissionsForAdmin(partnerId);

  const lines = [csvRow(CSV_HEADER)];
  for (const r of rows) {
    lines.push(
      csvRow([r.partnerName, r.referralCode, r.orgName, r.periodMonth, formatMajorUnits(r.amountMinorUnits), r.status]),
    );
  }
  return lines.join("\n");
}
