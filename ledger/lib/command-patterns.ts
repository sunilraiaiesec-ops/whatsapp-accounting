import { prisma } from "@/lib/prisma";
import { formatAmount } from "@/lib/money";
import { bucketFor, rankMatches, similarity } from "@/lib/bantoo/match";
import type { MatchBucket, BantooPatternReason } from "@/lib/bantoo/types";
import type { BantooActionType } from "@/lib/ai/actions";

// ---------------------------------------------------------------------------
// Ask Bantoo transaction-pattern learning.
//
// Learns each ORGANIZATION's own repeated habits by querying its existing
// transactional tables directly (GoodsReceipt[Line], PurchaseInvoice,
// Payment) — no new "memory" table, no cross-tenant data, no ML model. Every
// query is filtered by orgId. Scores are additive and explainable (see the
// per-signal comments below) and reuse the same 0–100 / high-medium-low
// bucket convention as lib/bantoo/match.ts (>=90 high, >=60 medium, else low).
//
// This module answers "which record/value is likely, based on history" —
// distinct from lib/bantoo/resolve.ts + lib/bantoo/entities.ts, which answer
// "which existing record does this text refer to." resolve.ts combines both
// (see the comments there for exactly how they blend).
// ---------------------------------------------------------------------------

// Lookback window: default 6 months. If that yields too few data points to be
// meaningful, we widen to 12 months (configurable via env for tuning without a
// redeploy of code, e.g. for orgs with sparse history).
const DEFAULT_LOOKBACK_DAYS = Number(process.env.BANTOO_PATTERN_LOOKBACK_DAYS ?? 180);
const WIDE_LOOKBACK_DAYS = Number(process.env.BANTOO_PATTERN_WIDE_LOOKBACK_DAYS ?? 365);
const MIN_ROWS_BEFORE_WIDENING = 5;

// Recency scoring thresholds (days).
const RECENT_DAYS_HIGH = 30;
const RECENT_DAYS_MED = 90;

// Caps on rows fetched per query — we aggregate/rank in JS over a bounded,
// already-sorted slice rather than loading full history into memory.
const HISTORY_ROW_CAP = 200;

export type PatternBucket = MatchBucket;

export type EntityPatternCandidate = {
  id: string;
  label: string;
  score: number; // 0-100
  bucket: PatternBucket;
  count: number;
  reason: BantooPatternReason;
};

export type ValuePatternSuggestion<T> = {
  value: T;
  score: number; // 0-100
  bucket: PatternBucket;
  count: number;
  reason: BantooPatternReason;
};

export type PatternSuggestions = {
  supplier?: EntityPatternCandidate;
  item?: EntityPatternCandidate;
  quantity?: ValuePatternSuggestion<string>;
  costPrice?: ValuePatternSuggestion<string>;
  dueDateDays?: ValuePatternSuggestion<number>;
};

export type PatternQuery = {
  action: BantooActionType;
  productQuery?: string | null;
  partyType?: "customer" | "supplier" | null;
  // When entity-matching (resolve.ts) already picked an item/party, pass its id
  // so pattern learning scopes quantity/cost/terms to exactly that record
  // instead of re-fuzzy-matching. Optional — the module still works from text
  // alone (that's what lets it suggest a supplier the text never named).
  resolvedItemId?: string | null;
  resolvedPartyId?: string | null;
  currency?: string | null;
};

function bucketFromScore(score: number): PatternBucket {
  return bucketFor(Math.max(0, Math.min(100, score)));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function daysAgo(date: Date, now: Date = new Date()): number {
  return daysBetween(date, now);
}

// +20 if the most recent use was in the last 30 days, +10 if in the last 90,
// else 0. Rewards habits that are still active, not ones the org has since
// dropped.
function recencyComponent(mostRecent: Date | null | undefined): number {
  if (!mostRecent) return 0;
  const d = daysAgo(mostRecent);
  if (d <= RECENT_DAYS_HIGH) return 20;
  if (d <= RECENT_DAYS_MED) return 10;
  return 0;
}

// +10 if today's weekday matches the historical mode weekday for this
// pairing, and that mode is backed by at least 2 occurrences (so a single
// coincidental date doesn't count as a "pattern").
function weekdayComponent(dates: Date[], today: Date = new Date()): number {
  if (dates.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const d of dates) counts.set(d.getUTCDay(), (counts.get(d.getUTCDay()) ?? 0) + 1);
  let modeDay = -1;
  let modeCount = 0;
  for (const [day, count] of counts) {
    if (count > modeCount) {
      modeCount = count;
      modeDay = day;
    }
  }
  return modeDay === today.getUTCDay() && modeCount >= 2 ? 10 : 0;
}

// Runs `fetch` over the default lookback window; if it comes back sparse,
// widens the window once. Two bounded queries in the worst case, never a full
// table scan.
async function withLookback<T>(
  fetch: (since: Date) => Promise<T[]>,
): Promise<{ rows: T[]; windowDays: number }> {
  const now = new Date();
  const narrowSince = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 86_400_000);
  const narrowRows = await fetch(narrowSince);
  if (narrowRows.length >= MIN_ROWS_BEFORE_WIDENING) {
    return { rows: narrowRows, windowDays: DEFAULT_LOOKBACK_DAYS };
  }
  const wideSince = new Date(now.getTime() - WIDE_LOOKBACK_DAYS * 86_400_000);
  const wideRows = await fetch(wideSince);
  return { rows: wideRows, windowDays: WIDE_LOOKBACK_DAYS };
}

function lookbackMonths(windowDays: number): 6 | 12 {
  return windowDays > DEFAULT_LOOKBACK_DAYS ? 12 : 6;
}

function minorToPlain(minor: bigint, currency: string): string {
  return formatAmount(minor, currency).replace(/,/g, "");
}

// Fuzzy-match a free-text product query against the org's inventory items
// (reusing the shared matcher — no separate fuzzy implementation here), so
// pattern learning can operate on the same item(s) entity-matching would find.
async function matchItemIds(
  orgId: string,
  productQuery: string | null | undefined,
  limit = 3,
): Promise<string[]> {
  if (!productQuery || !productQuery.trim()) return [];
  const items = await prisma.inventoryItem.findMany({
    where: { orgId },
    select: { id: true, name: true, code: true, barcode: true },
  });
  const ranked = rankMatches(
    productQuery,
    items.map((it) => ({
      id: it.id,
      label: it.name,
      text: [it.name, it.code, it.barcode ?? ""].filter(Boolean).join(" "),
    })),
    { floor: 30, limit },
  );
  return ranked.map((r) => r.id);
}

// --- Signal: which supplier usually delivers this product? -----------------
// "Store usually receives bread from Supplier A on Mondays" → typing "Received
// bread" ranks Supplier A highly, even though no supplier was named.
// Source: GoodsReceiptLine.itemId + parent GoodsReceipt.{partyId, date}.
async function supplierPatternForItem(
  orgId: string,
  itemIds: string[],
): Promise<EntityPatternCandidate | undefined> {
  if (itemIds.length === 0) return undefined;

  const { rows, windowDays } = await withLookback((since) =>
    prisma.goodsReceiptLine.findMany({
      where: { itemId: { in: itemIds }, receipt: { orgId, date: { gte: since } } },
      select: { receipt: { select: { partyId: true, date: true, party: { select: { name: true } } } } },
      orderBy: { receipt: { date: "desc" } },
      take: HISTORY_ROW_CAP,
    }),
  );
  if (rows.length === 0) return undefined;

  const byParty = new Map<string, { name: string; count: number; dates: Date[] }>();
  for (const r of rows) {
    const partyId = r.receipt.partyId;
    const entry = byParty.get(partyId) ?? { name: r.receipt.party.name, count: 0, dates: [] };
    entry.count += 1;
    entry.dates.push(r.receipt.date);
    byParty.set(partyId, entry);
  }
  const ranked = [...byParty.entries()].sort((a, b) => b[1].count - a[1].count);
  const [topId, top] = ranked[0];

  // Frequency: the most-used supplier for this product gets the full +40
  // (rows are already scoped to this product, so this doubles as the
  // supplier–product PAIRING frequency, not just overall supplier usage).
  const score = Math.min(
    100,
    40 + recencyComponent(top.dates[0]) + weekdayComponent(top.dates),
  );

  return {
    id: topId,
    label: top.name,
    score,
    bucket: bucketFromScore(score),
    count: top.count,
    reason: {
      code: "supplierProductHistory",
      params: { name: top.name, count: top.count, lookbackMonths: lookbackMonths(windowDays) },
    },
  };
}

// --- Signal: which item does generic product text usually mean? ------------
// "Rice from Supplier B usually bought in 50kg bags" — when several items
// fuzzy-match "rice", history disambiguates which one is meant; its `unit`
// (already resolved on the InventoryItem) then rides along via the existing
// product-defaults auto-population in resolve.ts. Source: same as above, but
// grouped by itemId instead of partyId.
async function itemPatternForQuery(
  orgId: string,
  productQuery: string | null | undefined,
): Promise<EntityPatternCandidate | undefined> {
  if (!productQuery || !productQuery.trim()) return undefined;

  const items = await prisma.inventoryItem.findMany({
    where: { orgId },
    select: { id: true, name: true, code: true, barcode: true },
  });
  const textRanked = rankMatches(
    productQuery,
    items.map((it) => ({
      id: it.id,
      label: it.name,
      text: [it.name, it.code, it.barcode ?? ""].filter(Boolean).join(" "),
    })),
    { floor: 30, limit: 5 },
  );
  if (textRanked.length === 0) return undefined;
  const candidateIds = textRanked.map((c) => c.id);

  const { rows } = await withLookback((since) =>
    prisma.goodsReceiptLine.findMany({
      where: { itemId: { in: candidateIds }, receipt: { orgId, date: { gte: since } } },
      select: { itemId: true, receipt: { select: { date: true } } },
      orderBy: { receipt: { date: "desc" } },
      take: HISTORY_ROW_CAP,
    }),
  );
  const freq = new Map<string, { count: number; dates: Date[] }>();
  for (const r of rows) {
    const e = freq.get(r.itemId) ?? { count: 0, dates: [] };
    e.count += 1;
    e.dates.push(r.receipt.date);
    freq.set(r.itemId, e);
  }
  const maxFreq = Math.max(1, ...[...freq.values()].map((v) => v.count));

  const combined = textRanked
    .map((c) => {
      const f = freq.get(c.id);
      // Text similarity still matters (0-30) but frequency (0-40) + recency
      // (0-20) can outrank a slightly-better text match that's never actually
      // been bought — this is what lets "rice" resolve to the specific bag
      // size the org actually buys, not just the alphabetically-closest name.
      const textComponent = Math.round(c.score * 0.3);
      const freqComponent = f ? Math.round(40 * (f.count / maxFreq)) : 0;
      const recency = f ? recencyComponent(f.dates[0]) : 0;
      return {
        id: c.id,
        label: items.find((it) => it.id === c.id)?.name ?? c.label,
        score: Math.min(100, textComponent + freqComponent + recency),
        count: f?.count ?? 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top = combined[0];
  if (!top) return undefined;
  return {
    id: top.id,
    label: top.label,
    score: top.score,
    bucket: bucketFromScore(top.score),
    count: top.count,
    reason:
      top.count > 0
        ? {
            code: "itemDeliveryHistory",
            params: { query: productQuery, label: top.label, count: top.count },
          }
        : { code: "itemBestMatch", params: { query: productQuery } },
  };
}

// --- Signal: what quantity is usually received? -----------------------------
// "A customer usually buys 20 cartons" (same idea, purchase-side here since
// that's the only Bantoo action with a quantity field today — see the report's
// limitations note on sales-side quantity). Suggested value = the historical
// MODE (most common quantity), since a single supplier/product habit is
// usually a fixed batch size, not an average. Source: GoodsReceiptLine.quantity.
// Exported so lib/reorder.ts can reuse this exact "usual quantity" signal
// for the low-stock reorder flow's suggested reorder quantity, instead of
// re-deriving a mode-quantity from GoodsReceiptLine history a second time.
export async function quantityPatternForItem(
  orgId: string,
  itemIds: string[],
  partyId?: string | null,
): Promise<ValuePatternSuggestion<string> | undefined> {
  if (itemIds.length === 0) return undefined;

  const { rows } = await withLookback((since) =>
    prisma.goodsReceiptLine.findMany({
      where: {
        itemId: { in: itemIds },
        receipt: { orgId, date: { gte: since }, ...(partyId ? { partyId } : {}) },
      },
      select: { quantity: true },
      orderBy: { receipt: { date: "desc" } },
      take: 100,
    }),
  );
  if (rows.length === 0) return undefined;

  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.quantity.toString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [modeQty, modeCount] = ranked[0];
  const lastQty = rows[0].quantity.toString();

  // How dominant is the mode (0-50), plus a small volume bonus for a longer
  // track record (0-10), plus a bonus if the LAST transaction also used the
  // mode — i.e. the habit is not just common but current (0-20).
  const dominance = Math.round(50 * (modeCount / rows.length));
  const volumeBonus = rows.length >= 5 ? 10 : rows.length >= 2 ? 5 : 0;
  const currentBonus = lastQty === modeQty ? 20 : 0;
  const score = Math.min(100, dominance + volumeBonus + currentBonus);

  return {
    value: modeQty,
    score,
    bucket: bucketFromScore(score),
    count: rows.length,
    reason:
      modeCount > 1
        ? {
            code: "quantityUsual",
            params: { quantity: modeQty, dominant: modeCount, total: rows.length },
          }
        : { code: "quantityLastDelivery", params: { quantity: modeQty } },
  };
}

// --- Signal: what did we last pay per unit? ---------------------------------
// "Last purchase cost of rice was 21,500 XAF" — uses the LAST cost, not an
// average, because purchase prices drift over time and the most recent value
// is the most relevant one to default to. Source: GoodsReceiptLine.unitCost.
// Exported so lib/approvals/risk-review.ts can reuse this exact "last
// purchase cost" signal for the §12 "price is notably higher than last
// purchase" advisory check instead of re-deriving it.
export async function costPatternForItem(
  orgId: string,
  itemIds: string[],
  partyId: string | null | undefined,
  currency: string,
): Promise<ValuePatternSuggestion<string> | undefined> {
  if (itemIds.length === 0) return undefined;

  const { rows } = await withLookback((since) =>
    prisma.goodsReceiptLine.findMany({
      where: {
        itemId: { in: itemIds },
        receipt: { orgId, date: { gte: since }, ...(partyId ? { partyId } : {}) },
      },
      select: { unitCost: true },
      orderBy: { receipt: { date: "desc" } },
      take: 20,
    }),
  );
  if (rows.length === 0) return undefined;

  const lastCost = rows[0].unitCost;
  const avg = rows.reduce((s, r) => s + r.unitCost, 0n) / BigInt(rows.length);
  const avgNum = Number(avg);
  const lastNum = Number(lastCost);
  const stable = avgNum > 0 && Math.abs(lastNum - avgNum) / avgNum <= 0.1;

  // Base +60 because "last cost" is always the most relevant real data point
  // once one exists; +20 if prices have been stable (last close to average);
  // +20 if backed by 3+ purchases (an established pattern, not a one-off).
  const score = Math.min(100, 60 + (stable ? 20 : 0) + (rows.length >= 3 ? 20 : 0));

  return {
    value: minorToPlain(lastCost, currency),
    score,
    bucket: bucketFromScore(score),
    count: rows.length,
    reason: {
      code: "costLastPurchase",
      params: { amount: minorToPlain(lastCost, currency), currency },
    },
  };
}

// --- Signal: how many days after the invoice is this supplier usually paid?
// "A supplier is usually paid ~30 days after delivery." PurchaseInvoice.dueDate
// is a real, user-settable field (see purchase-invoices forms) — when the org
// has actually filled it in for this supplier before, we average
// (dueDate - date) directly, which is the org's own explicit statement of
// terms. Ask Bantoo itself doesn't set dueDate today, so for orgs whose
// invoices came only through Bantoo this will usually be empty; in that case
// we fall back to an APPROXIMATION: elapsed days between each purchase
// invoice date and the next Payment made to the same supplier. This is a
// heuristic, not an exact allocation — the schema has no invoice-to-payment
// link (Payment.partyId only ties a payment to a supplier, not to a specific
// bill) — so it's explicitly labeled as approximate in the reason string and
// bounded to 0-180 days to avoid pairing unrelated documents.
// Exported (not just used internally) so lib/party-insights.ts can reuse the
// exact same "usual payment terms" derivation for a supplier's AI Memory tab
// instead of re-implementing the invoice-due-date / next-payment approximation.
export async function paymentTermsPatternForSupplier(
  orgId: string,
  partyId: string,
): Promise<ValuePatternSuggestion<number> | undefined> {
  const { rows: withDue, windowDays: dueWindow } = await withLookback((since) =>
    prisma.purchaseInvoice.findMany({
      where: { orgId, partyId, date: { gte: since }, dueDate: { not: null } },
      select: { date: true, dueDate: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
  );
  if (withDue.length > 0) {
    const days = withDue.map((r) => daysBetween(r.date, r.dueDate as Date));
    return termsSuggestionFromDays(days, withDue.length);
  }

  const [{ rows: docs }, payments] = await Promise.all([
    withLookback((since) =>
      prisma.purchaseInvoice.findMany({
        where: { orgId, partyId, date: { gte: since } },
        select: { date: true },
        orderBy: { date: "asc" },
        take: 100,
      }),
    ),
    prisma.payment.findMany({
      where: { orgId, partyId },
      select: { date: true },
      orderBy: { date: "asc" },
      take: 100,
    }),
  ]);
  if (docs.length === 0 || payments.length === 0) return undefined;

  const days: number[] = [];
  for (const doc of docs) {
    const nextPayment = payments.find((p) => p.date.getTime() >= doc.date.getTime());
    if (nextPayment) {
      const d = daysBetween(doc.date, nextPayment.date);
      if (d >= 0 && d <= 180) days.push(d);
    }
  }
  if (days.length === 0) return undefined;
  return termsSuggestionFromDays(days, days.length, { approximate: true });
}

function termsSuggestionFromDays(
  days: number[],
  paymentCount: number,
  options?: { approximate?: boolean },
): ValuePatternSuggestion<number> {
  const avg = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
  const variance = days.reduce((s, d) => s + (d - avg) ** 2, 0) / days.length;
  const stdDev = Math.sqrt(variance);
  // Base +50 for having any data; up to +30 more for a longer track record;
  // up to +20 more for low variance (a TIGHT cluster of days is a real habit,
  // a scattered one is coincidence).
  const score = Math.min(
    100,
    50 +
      (days.length >= 3 ? 30 : days.length >= 2 ? 15 : 0) +
      (stdDev <= 7 ? 20 : stdDev <= 14 ? 10 : 0),
  );
  return {
    value: avg,
    score,
    bucket: bucketFromScore(score),
    count: days.length,
    reason: {
      code: "dueDatePaymentTerms",
      params: {
        days: avg,
        paymentCount,
        ...(options?.approximate ? { approximate: 1 as const } : {}),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Main entry point. Everything is scoped to `orgId` — no cross-tenant lookups,
// no data leaves this org's own tables. Never writes anything; purely derives
// suggestions for the confirmation screen. Confirmation is still required
// before any of this can post — this module never calls a create/execute
// function itself.
// ---------------------------------------------------------------------------
export async function getCommandPatternSuggestions(
  orgId: string,
  query: PatternQuery,
): Promise<PatternSuggestions> {
  const currency = query.currency || "XAF";
  const suggestions: PatternSuggestions = {};

  if (query.action === "receive_stock" || query.action === "add_inventory_item") {
    const item = query.resolvedItemId
      ? undefined // caller already knows the item; no need to re-suggest which one
      : await itemPatternForQuery(orgId, query.productQuery);
    if (item) suggestions.item = item;

    const itemIds = query.resolvedItemId
      ? [query.resolvedItemId]
      : await matchItemIds(orgId, query.productQuery);

    if (itemIds.length > 0) {
      const [supplier, quantity, cost] = await Promise.all([
        query.partyType !== "customer" ? supplierPatternForItem(orgId, itemIds) : Promise.resolve(undefined),
        quantityPatternForItem(orgId, itemIds, query.resolvedPartyId),
        costPatternForItem(orgId, itemIds, query.resolvedPartyId, currency),
      ]);
      if (supplier) suggestions.supplier = supplier;
      if (quantity) suggestions.quantity = quantity;
      if (cost) suggestions.costPrice = cost;
    }
  }

  if (query.action === "supplier_purchase" && query.resolvedPartyId) {
    const terms = await paymentTermsPatternForSupplier(orgId, query.resolvedPartyId);
    if (terms) suggestions.dueDateDays = terms;
  }

  return suggestions;
}

// Exposed for tests / potential reuse — converts a suggested day-offset into a
// concrete ISO due date from a given invoice date.
export function dueDateFromTerms(invoiceDate: Date, days: number): string {
  const d = new Date(invoiceDate.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// Re-exported so callers/tests don't need a second import for basic scoring.
export { bucketFor, similarity };
