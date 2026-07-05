import { prisma } from "@/lib/prisma";
import { formatAmount } from "@/lib/money";
import { getPartyBalance } from "@/lib/party-ledger";
import { paymentTermsPatternForSupplier } from "@/lib/command-patterns";

// ---------------------------------------------------------------------------
// Org-scoped relationship-intelligence service for a single contact
// (customer or supplier). Every query below is filtered by BOTH orgId and
// partyId — never trust a caller to have already checked the party belongs
// to the org; do it again here so this module is safe to call directly.
//
// Two related but distinct outputs live here:
//   - PartyOverviewStats: the human-facing "relationship at a glance" shown
//     on the contact's Overview tab (since/orders/average/behaviour/etc).
//   - PartyAiMemory: the same underlying signals, reshaped for the "AI
//     Memory" tab — org- AND contact-specific learned habits (usual
//     products/quantities/prices/terms/weekday/payment method). This is the
//     per-CONTACT counterpart to lib/command-patterns.ts's org-wide pattern
//     learning used to prefill Ask Bantoo proposals; where the same signal
//     is needed (supplier payment-terms), this module calls directly into
//     command-patterns.ts (paymentTermsPatternForSupplier) instead of
//     re-deriving it, so the two features never disagree.
//
// PROXIES / LIMITATIONS (documented once here, referenced from the report):
//   - "Average days to pay" has no direct schema support: invoices never
//     transition their `status` away from "unpaid" (see lib/documents.ts)
//     and Payment/Receipt aren't linked to a specific invoice. We use the
//     same heuristic as command-patterns.ts: elapsed days between each
//     invoice's date and the next payment/receipt made to/by that party,
//     bounded to 0-180 days. It's an approximation, not an exact allocation
//     — flagged via `avgDaysToPayApproximate` and the reason string.
//   - "Most purchased/sold products" for suppliers comes from
//     GoodsReceiptLine (the only supplier-side line item with an itemId —
//     PurchaseInvoiceLine has none). For customers it's SalesInvoiceLine +
//     SalesReceiptLine combined.
// ---------------------------------------------------------------------------

type PartyKind = "customer" | "supplier";

// Bounds on rows fetched for line-item aggregation — we rank/aggregate a
// bounded, already-sorted slice in JS rather than scanning full history.
const PRODUCT_HISTORY_CAP = 400;
const DATE_HISTORY_CAP = 300;
const TOP_PRODUCTS_LIMIT = 5;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function modeWeekday(dates: Date[]): string | null {
  if (dates.length === 0) return null;
  const counts = new Map<number, number>();
  for (const d of dates) counts.set(d.getUTCDay(), (counts.get(d.getUTCDay()) ?? 0) + 1);
  let bestDay = -1;
  let bestCount = 0;
  for (const [day, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestDay = day;
    }
  }
  return bestDay >= 0 ? WEEKDAY_NAMES[bestDay] : null;
}

function modeString(values: string[]): { value: string; count: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: [string, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best ? { value: best[0], count: best[1] } : null;
}

async function preferredPaymentMethod(
  orgId: string,
  partyId: string,
  kind: PartyKind,
): Promise<string | null> {
  const rows =
    kind === "customer"
      ? await prisma.receipt.groupBy({
          by: ["paymentMethod"],
          where: { orgId, partyId, paymentMethod: { not: null } },
          _count: { paymentMethod: true },
        })
      : await prisma.payment.groupBy({
          by: ["paymentMethod"],
          where: { orgId, partyId, paymentMethod: { not: null } },
          _count: { paymentMethod: true },
        });
  if (rows.length === 0) return null;
  const top = rows.reduce((a, b) => (b._count.paymentMethod > a._count.paymentMethod ? b : a));
  return top.paymentMethod ?? null;
}

// --- Document-level summary: count / total / since / last / dates ---------

type DocSummary = {
  count: number;
  total: bigint;
  since: Date | null;
  last: Date | null;
  dates: Date[];
};

function mergeSummaries(...parts: DocSummary[]): DocSummary {
  let count = 0;
  let total = 0n;
  let since: Date | null = null;
  let last: Date | null = null;
  const dates: Date[] = [];
  for (const p of parts) {
    count += p.count;
    total += p.total;
    if (p.since && (!since || p.since < since)) since = p.since;
    if (p.last && (!last || p.last > last)) last = p.last;
    dates.push(...p.dates);
  }
  return { count, total, since, last, dates };
}

async function summarizeCustomer(orgId: string, partyId: string): Promise<DocSummary> {
  const [invoiceAgg, receiptAgg, invoiceDates, receiptDates] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: { orgId, partyId },
      _count: { _all: true },
      _sum: { total: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.salesReceipt.aggregate({
      where: { orgId, partyId },
      _count: { _all: true },
      _sum: { total: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.salesInvoice.findMany({
      where: { orgId, partyId },
      select: { date: true },
      orderBy: { date: "desc" },
      take: DATE_HISTORY_CAP,
    }),
    prisma.salesReceipt.findMany({
      where: { orgId, partyId },
      select: { date: true },
      orderBy: { date: "desc" },
      take: DATE_HISTORY_CAP,
    }),
  ]);

  return mergeSummaries(
    {
      count: invoiceAgg._count._all,
      total: invoiceAgg._sum.total ?? 0n,
      since: invoiceAgg._min.date,
      last: invoiceAgg._max.date,
      dates: invoiceDates.map((d) => d.date),
    },
    {
      count: receiptAgg._count._all,
      total: receiptAgg._sum.total ?? 0n,
      since: receiptAgg._min.date,
      last: receiptAgg._max.date,
      dates: receiptDates.map((d) => d.date),
    },
  );
}

async function summarizeSupplier(orgId: string, partyId: string): Promise<DocSummary> {
  const [invoiceAgg, receiptAgg, invoiceDates, receiptDates] = await Promise.all([
    prisma.purchaseInvoice.aggregate({
      where: { orgId, partyId },
      _count: { _all: true },
      _sum: { total: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.goodsReceipt.aggregate({
      where: { orgId, partyId },
      _count: { _all: true },
      _sum: { total: true },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.purchaseInvoice.findMany({
      where: { orgId, partyId },
      select: { date: true },
      orderBy: { date: "desc" },
      take: DATE_HISTORY_CAP,
    }),
    prisma.goodsReceipt.findMany({
      where: { orgId, partyId },
      select: { date: true },
      orderBy: { date: "desc" },
      take: DATE_HISTORY_CAP,
    }),
  ]);

  return mergeSummaries(
    {
      count: invoiceAgg._count._all,
      total: invoiceAgg._sum.total ?? 0n,
      since: invoiceAgg._min.date,
      last: invoiceAgg._max.date,
      dates: invoiceDates.map((d) => d.date),
    },
    {
      count: receiptAgg._count._all,
      total: receiptAgg._sum.total ?? 0n,
      since: receiptAgg._min.date,
      last: receiptAgg._max.date,
      dates: receiptDates.map((d) => d.date),
    },
  );
}

// --- Product-line aggregation (top products / usual quantity / prices) ----

export type ProductMemoryRow = {
  itemId: string;
  name: string;
  unit: string | null;
  totalQuantity: string;
  usualQuantity: string | null;
  lastPrice: bigint;
  averagePrice: bigint;
  count: number;
};

type RawLine = { itemId: string | null; quantity: { toString(): string }; unitPrice: bigint; date: Date };

async function productLinesForCustomer(orgId: string, partyId: string): Promise<RawLine[]> {
  const [invoiceLines, receiptLines] = await Promise.all([
    prisma.salesInvoiceLine.findMany({
      where: { itemId: { not: null }, invoice: { orgId, partyId } },
      select: { itemId: true, quantity: true, unitPrice: true, invoice: { select: { date: true } } },
      orderBy: { invoice: { date: "desc" } },
      take: PRODUCT_HISTORY_CAP,
    }),
    prisma.salesReceiptLine.findMany({
      where: { itemId: { not: null }, receipt: { orgId, partyId } },
      select: { itemId: true, quantity: true, unitPrice: true, receipt: { select: { date: true } } },
      orderBy: { receipt: { date: "desc" } },
      take: PRODUCT_HISTORY_CAP,
    }),
  ]);
  return [
    ...invoiceLines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice, date: l.invoice.date })),
    ...receiptLines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice, date: l.receipt.date })),
  ];
}

async function productLinesForSupplier(orgId: string, partyId: string): Promise<RawLine[]> {
  const lines = await prisma.goodsReceiptLine.findMany({
    where: { receipt: { orgId, partyId } },
    select: { itemId: true, quantity: true, unitCost: true, receipt: { select: { date: true } } },
    orderBy: { receipt: { date: "desc" } },
    take: PRODUCT_HISTORY_CAP,
  });
  return lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitCost, date: l.receipt.date }));
}

async function aggregateProducts(orgId: string, lines: RawLine[]): Promise<ProductMemoryRow[]> {
  const byItem = new Map<
    string,
    { quantities: string[]; prices: bigint[]; dates: Date[]; totalQty: number }
  >();
  for (const line of lines) {
    if (!line.itemId) continue;
    const entry = byItem.get(line.itemId) ?? { quantities: [], prices: [], dates: [], totalQty: 0 };
    entry.quantities.push(line.quantity.toString());
    entry.prices.push(line.unitPrice);
    entry.dates.push(line.date);
    entry.totalQty += Number(line.quantity.toString()) || 0;
    byItem.set(line.itemId, entry);
  }
  if (byItem.size === 0) return [];

  const itemIds = [...byItem.keys()];
  const items = await prisma.inventoryItem.findMany({
    where: { orgId, id: { in: itemIds } },
    select: { id: true, name: true, unit: true },
  });
  const itemById = new Map(items.map((it) => [it.id, it]));

  const rows: ProductMemoryRow[] = itemIds.map((itemId) => {
    const entry = byItem.get(itemId)!;
    const item = itemById.get(itemId);
    // Sort this item's own (quantity, price, date) triples by date desc so
    // "last price" is genuinely the most recent one, not just array order.
    const order = entry.dates
      .map((d, i) => i)
      .sort((a, b) => entry.dates[b].getTime() - entry.dates[a].getTime());
    const sortedPrices = order.map((i) => entry.prices[i]);
    const usual = modeString(entry.quantities);
    const avg =
      entry.prices.reduce((s, p) => s + p, 0n) / BigInt(Math.max(1, entry.prices.length));

    return {
      itemId,
      name: item?.name ?? "Unknown item",
      unit: item?.unit ?? null,
      totalQuantity: String(entry.totalQty),
      usualQuantity: usual?.value ?? null,
      lastPrice: sortedPrices[0] ?? 0n,
      averagePrice: avg,
      count: entry.quantities.length,
    };
  });

  return rows.sort((a, b) => Number(b.totalQuantity) - Number(a.totalQuantity));
}

// --- Days-to-pay proxy for customers (mirrors command-patterns.ts's
// paymentTermsPatternForSupplier, generalized to the sales side: elapsed
// days between each SalesInvoice's date and the next Receipt made by that
// customer, bounded to 0-180 days). ---------------------------------------

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

async function customerDaysToPay(
  orgId: string,
  partyId: string,
): Promise<{ avgDays: number; count: number; approximate: boolean } | null> {
  const [invoices, receipts] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { orgId, partyId },
      select: { date: true, dueDate: true },
      orderBy: { date: "asc" },
      take: 200,
    }),
    prisma.receipt.findMany({
      where: { orgId, partyId },
      select: { date: true },
      orderBy: { date: "asc" },
      take: 200,
    }),
  ]);
  if (invoices.length === 0) return null;

  const withDue = invoices.filter((i) => i.dueDate);
  if (withDue.length > 0) {
    const days = withDue.map((i) => daysBetween(i.date, i.dueDate as Date));
    const avg = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
    return { avgDays: avg, count: days.length, approximate: false };
  }

  if (receipts.length === 0) return null;
  const days: number[] = [];
  for (const inv of invoices) {
    const nextReceipt = receipts.find((r) => r.date.getTime() >= inv.date.getTime());
    if (nextReceipt) {
      const d = daysBetween(inv.date, nextReceipt.date);
      if (d >= 0 && d <= 180) days.push(d);
    }
  }
  if (days.length === 0) return null;
  const avg = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
  return { avgDays: avg, count: days.length, approximate: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PartyOverviewStats = {
  since: Date | null;
  orderCount: number;
  totalAmount: bigint;
  averageOrderValue: bigint;
  lastTransactionDate: Date | null;
  balance: bigint;
  avgDaysToPay: number | null;
  avgDaysToPayApproximate: boolean;
  avgDaysToPaySampleSize: number;
  paymentBehaviorText: string | null;
  topProducts: ProductMemoryRow[];
  mostCommonUnit: string | null;
  preferredPaymentMethod: string | null;
  summaryLine: string;
};

function monthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export async function getPartyOverviewStats(
  orgId: string,
  partyId: string,
  kind: PartyKind,
  currency = "XAF",
): Promise<PartyOverviewStats> {
  const [summary, lines, balance, paymentMethod, daysToPay] = await Promise.all([
    kind === "customer" ? summarizeCustomer(orgId, partyId) : summarizeSupplier(orgId, partyId),
    kind === "customer" ? productLinesForCustomer(orgId, partyId) : productLinesForSupplier(orgId, partyId),
    getPartyBalance(orgId, partyId, kind),
    preferredPaymentMethod(orgId, partyId, kind),
    kind === "customer"
      ? customerDaysToPay(orgId, partyId)
      : paymentTermsPatternForSupplier(orgId, partyId).then((p) =>
          p ? { avgDays: p.value, count: p.count, approximate: p.reason.includes("approximate") } : null,
        ),
  ]);

  const products = await aggregateProducts(orgId, lines);
  const topProducts = products.slice(0, TOP_PRODUCTS_LIMIT);
  const unitMode = modeString(products.map((p) => p.unit).filter((u): u is string => !!u));

  const averageOrderValue = summary.count > 0 ? summary.total / BigInt(summary.count) : 0n;

  const paymentBehaviorText = daysToPay
    ? `Pays in ~${daysToPay.avgDays} day${daysToPay.avgDays === 1 ? "" : "s"} on average${
        daysToPay.approximate ? " (approximate)" : ""
      }`
    : null;

  const sinceLabel = summary.since
    ? `${kind === "supplier" ? "Supplier" : "Customer"} since: ${monthYear(summary.since)}`
    : `No transactions yet`;
  const parts = [
    sinceLabel,
    `Orders: ${summary.count}`,
    `Average order: ${formatAmount(averageOrderValue, currency)} ${currency}`,
  ];
  if (paymentBehaviorText) parts.push(`Payment behaviour: ${paymentBehaviorText}`);
  if (topProducts.length > 0) {
    parts.push(`Most ${kind === "supplier" ? "purchased" : "sold"}: ${topProducts.map((p) => p.name).join(", ")}`);
  }
  if (paymentMethod) parts.push(`Preferred payment: ${paymentMethod}`);

  return {
    since: summary.since,
    orderCount: summary.count,
    totalAmount: summary.total,
    averageOrderValue,
    lastTransactionDate: summary.last,
    balance,
    avgDaysToPay: daysToPay?.avgDays ?? null,
    avgDaysToPayApproximate: daysToPay?.approximate ?? false,
    avgDaysToPaySampleSize: daysToPay?.count ?? 0,
    paymentBehaviorText,
    topProducts,
    mostCommonUnit: unitMode?.value ?? null,
    preferredPaymentMethod: paymentMethod,
    summaryLine: parts.join(" · "),
  };
}

// --- AI Memory: per-contact learned patterns --------------------------------

export type PartyAiMemory = {
  usualProducts: ProductMemoryRow[];
  usualPaymentTermsDays: number | null;
  usualPaymentTermsApproximate: boolean;
  usualPaymentTermsSampleSize: number;
  mostCommonWeekday: string | null;
  preferredPaymentMethod: string | null;
  sampleSize: number;
};

export async function getPartyAiMemory(
  orgId: string,
  partyId: string,
  kind: PartyKind,
): Promise<PartyAiMemory> {
  const [lines, dates, paymentMethod, terms] = await Promise.all([
    kind === "customer" ? productLinesForCustomer(orgId, partyId) : productLinesForSupplier(orgId, partyId),
    kind === "customer" ? summarizeCustomer(orgId, partyId) : summarizeSupplier(orgId, partyId),
    preferredPaymentMethod(orgId, partyId, kind),
    kind === "supplier"
      ? paymentTermsPatternForSupplier(orgId, partyId)
      : customerDaysToPay(orgId, partyId).then((r) =>
          r ? { value: r.avgDays, count: r.count, reason: r.approximate ? "approximate" : "" } : undefined,
        ),
  ]);

  const products = await aggregateProducts(orgId, lines);

  return {
    usualProducts: products.slice(0, TOP_PRODUCTS_LIMIT),
    usualPaymentTermsDays: terms?.value ?? null,
    usualPaymentTermsApproximate: terms ? String(terms.reason).includes("approximate") : false,
    usualPaymentTermsSampleSize: terms?.count ?? 0,
    mostCommonWeekday: modeWeekday(dates.dates),
    preferredPaymentMethod: paymentMethod,
    sampleSize: lines.length,
  };
}

// ---------------------------------------------------------------------------
// Ask Bantoo gentle-enrichment suggestions. Purely a reader — never writes
// anything itself; each suggestion carries an explicit `accept` action the
// UI wires to a real update (see acceptPartyEnrichmentSuggestion in
// app/actions/parties.ts) and dismissal is a client-side no-op.
// ---------------------------------------------------------------------------

export type PartyEnrichmentSuggestion = {
  id: string;
  text: string;
  kind: "missing_field" | "frequency";
  accept:
    | { type: "focus_field"; field: "phone" | "whatsapp" }
    | { type: "set_payment_terms"; days: number }
    | { type: "set_preferred_payment_method"; method: string }
    | { type: "append_note"; note: string };
};

// A contact needs a handful of real transactions before frequency-based
// suggestions ("you've bought from them N times") are worth surfacing —
// otherwise every brand-new contact would immediately get nagged.
const FREQUENCY_SUGGESTION_MIN_ORDERS = 3;

export async function getPartyEnrichmentSuggestions(
  orgId: string,
  partyId: string,
  kind: PartyKind,
): Promise<PartyEnrichmentSuggestion[]> {
  const party = await prisma.party.findFirst({
    where: { orgId, id: partyId },
    select: { name: true, phone: true, whatsapp: true, paymentTermsDays: true, preferredPaymentMethod: true },
  });
  if (!party) return [];

  const suggestions: PartyEnrichmentSuggestion[] = [];

  if (!party.phone && !party.whatsapp) {
    suggestions.push({
      id: "missing_phone",
      text: `${party.name} has no phone number. Add it?`,
      kind: "missing_field",
      accept: { type: "focus_field", field: "phone" },
    });
  }

  const [overview, memory] = await Promise.all([
    getPartyOverviewStats(orgId, partyId, kind),
    getPartyAiMemory(orgId, partyId, kind),
  ]);

  if (overview.orderCount >= FREQUENCY_SUGGESTION_MIN_ORDERS) {
    if (
      party.paymentTermsDays == null &&
      memory.usualPaymentTermsDays != null &&
      memory.usualPaymentTermsSampleSize >= 2
    ) {
      const days = memory.usualPaymentTermsDays;
      suggestions.push({
        id: `payment_terms_${days}`,
        text: `This ${kind} is usually paid after ${days} day${days === 1 ? "" : "s"}. Set payment terms to ${days} days?`,
        kind: "frequency",
        accept: { type: "set_payment_terms", days },
      });
    }

    if (!party.preferredPaymentMethod && overview.preferredPaymentMethod) {
      const method = overview.preferredPaymentMethod;
      suggestions.push({
        id: `preferred_payment_${method}`,
        text: `You usually pay ${party.name} by ${method}. Set it as their preferred payment method?`,
        kind: "frequency",
        accept: { type: "set_preferred_payment_method", method },
      });
    }

    // "You've bought from Elhaji Adoum 15 times, mostly Rice. Set him as
    // preferred rice supplier?" — there is no dedicated "preferred supplier
    // for product X" column, so the accept action appends a short note
    // (Party.notes) rather than leaving this suggestion without any real
    // field to update.
    const topProduct = overview.topProducts[0];
    if (topProduct && topProduct.count >= FREQUENCY_SUGGESTION_MIN_ORDERS) {
      const verb = kind === "supplier" ? "bought from" : "sold to";
      const roleLabel = kind === "supplier" ? "preferred supplier" : "preferred customer";
      suggestions.push({
        id: `preferred_product_${topProduct.itemId}`,
        text: `You've ${verb} ${party.name} ${overview.orderCount} time${overview.orderCount === 1 ? "" : "s"}, mostly ${topProduct.name}. Set them as your ${roleLabel} for ${topProduct.name}?`,
        kind: "frequency",
        accept: { type: "append_note", note: `Preferred ${roleLabel} for ${topProduct.name}.` },
      });
    }
  }

  return suggestions;
}
