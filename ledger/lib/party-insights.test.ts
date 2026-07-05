import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFakeModel } from "@/lib/test-utils/fakePrisma";

// --- Fixtures ---------------------------------------------------------------
// A supplier (sup_1, org_A) with 4 goods receipts of "Rice 25kg" over four
// weeks, always on a Monday, always the same quantity/cost, paid ~30 days
// after each purchase invoice. A second org (org_B) has its own supplier
// with the same name to prove org isolation.

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

let purchaseInvoiceRows: Record<string, unknown>[] = [];
let goodsReceiptRows: Record<string, unknown>[] = [];
let goodsReceiptLineRows: Record<string, unknown>[] = [];
let paymentRows: Record<string, unknown>[] = [];
let salesInvoiceRows: Record<string, unknown>[] = [];
let salesReceiptRows: Record<string, unknown>[] = [];
let salesInvoiceLineRows: Record<string, unknown>[] = [];
let salesReceiptLineRows: Record<string, unknown>[] = [];
let receiptRows: Record<string, unknown>[] = [];
let inventoryItemRows: Record<string, unknown>[] = [];
let partyRows: Record<string, unknown>[] = [];
let journalLineRows: Record<string, unknown>[] = [];
let accountRows: Record<string, unknown>[] = [];

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return {
      purchaseInvoice: makeFakeModel(purchaseInvoiceRows),
      goodsReceipt: makeFakeModel(goodsReceiptRows),
      goodsReceiptLine: makeFakeModel(goodsReceiptLineRows),
      payment: makeFakeModel(paymentRows),
      salesInvoice: makeFakeModel(salesInvoiceRows),
      salesReceipt: makeFakeModel(salesReceiptRows),
      salesInvoiceLine: makeFakeModel(salesInvoiceLineRows),
      salesReceiptLine: makeFakeModel(salesReceiptLineRows),
      receipt: makeFakeModel(receiptRows),
      inventoryItem: makeFakeModel(inventoryItemRows),
      party: makeFakeModel(partyRows),
      journalLine: makeFakeModel(journalLineRows),
      account: makeFakeModel(accountRows),
    };
  },
}));

const {
  getPartyOverviewStats,
  getPartyAiMemory,
  getPartyEnrichmentSuggestions,
} = await import("@/lib/party-insights");

function resetFixtures() {
  purchaseInvoiceRows = [];
  goodsReceiptRows = [];
  goodsReceiptLineRows = [];
  paymentRows = [];
  salesInvoiceRows = [];
  salesReceiptRows = [];
  salesInvoiceLineRows = [];
  salesReceiptLineRows = [];
  receiptRows = [];
  inventoryItemRows = [];
  partyRows = [];
  journalLineRows = [];
  accountRows = [
    { id: "acct_ap", orgId: "org_A", subtype: "payable", isControl: true },
    { id: "acct_ar", orgId: "org_A", subtype: "receivable", isControl: true },
    { id: "acct_ap_b", orgId: "org_B", subtype: "payable", isControl: true },
  ];
}

function seedSupplierHistory(orgId: string, partyId: string, itemId: string) {
  // Four Mondays spaced 35 days (5 weeks) apart — far enough apart that each
  // invoice's "next payment >= invoice date" (the same lookup
  // paymentTermsPatternForSupplier uses) unambiguously matches its own
  // 30-day-later payment rather than an earlier invoice's.
  const dates = ["2026-05-04", "2026-06-08", "2026-07-13", "2026-08-17"];
  dates.forEach((iso, i) => {
    const receiptId = `${partyId}_gr_${i}`;
    goodsReceiptRows.push({
      id: receiptId,
      orgId,
      partyId,
      date: day(iso),
      total: 210_000n,
    });
    goodsReceiptLineRows.push({
      id: `${receiptId}_line`,
      itemId,
      quantity: { toString: () => "10" },
      unitCost: 21_000n,
      receipt: { orgId, partyId, date: day(iso) },
    });
    const invoiceDate = day(iso);
    purchaseInvoiceRows.push({
      id: `${partyId}_inv_${i}`,
      orgId,
      partyId,
      date: invoiceDate,
      dueDate: null,
      total: 210_000n,
      status: "unpaid",
    });
    // Paid ~30 days after each invoice.
    paymentRows.push({
      id: `${partyId}_pay_${i}`,
      orgId,
      partyId,
      date: new Date(invoiceDate.getTime() + 30 * 86_400_000),
      paymentMethod: "Bank transfer",
    });
  });
}

beforeEach(() => {
  resetFixtures();
  inventoryItemRows.push({ id: "item_rice", orgId: "org_A", name: "Rice 25kg", unit: "bag" });
});

describe("getPartyOverviewStats — supplier relationship intelligence", () => {
  it("computes since/orders/average/balance/payment-behaviour/top-products from a transaction fixture", async () => {
    seedSupplierHistory("org_A", "sup_1", "item_rice");
    journalLineRows.push(
      { orgId: "org_A", accountId: "acct_ap", partyId: "sup_1", debit: 0n, credit: 840_000n },
      { orgId: "org_A", accountId: "acct_ap", partyId: "sup_1", debit: 600_000n, credit: 0n },
    );

    const stats = await getPartyOverviewStats("org_A", "sup_1", "supplier");

    expect(stats.orderCount).toBe(8); // 4 purchase invoices + 4 goods receipts
    expect(stats.totalAmount).toBe(210_000n * 8n);
    expect(stats.averageOrderValue).toBe(210_000n);
    expect(stats.since?.toISOString().slice(0, 10)).toBe("2026-05-04");
    expect(stats.lastTransactionDate?.toISOString().slice(0, 10)).toBe("2026-08-17");
    expect(stats.balance).toBe(240_000n); // 840,000 credit - 600,000 debit
    expect(stats.avgDaysToPay).toBe(30);
    expect(stats.avgDaysToPayApproximate).toBe(true); // no dueDate set → next-payment proxy
    expect(stats.preferredPaymentMethod).toBe("Bank transfer");
    expect(stats.topProducts[0]?.name).toBe("Rice 25kg");
    expect(stats.mostCommonUnit).toBe("bag");
    expect(stats.paymentBehaviorText).toContain("30 day");
    expect(stats.summaryLine).toContain("Orders: 8");
    expect(stats.summaryLine).toContain("Rice 25kg");
  });

  it("uses real invoice due dates instead of the approximation when they exist", async () => {
    purchaseInvoiceRows.push(
      { id: "inv_1", orgId: "org_A", partyId: "sup_1", date: day("2026-01-01"), dueDate: day("2026-01-15"), total: 100_000n, status: "unpaid" },
      { id: "inv_2", orgId: "org_A", partyId: "sup_1", date: day("2026-02-01"), dueDate: day("2026-02-15"), total: 100_000n, status: "unpaid" },
    );
    const stats = await getPartyOverviewStats("org_A", "sup_1", "supplier");
    expect(stats.avgDaysToPay).toBe(14);
    expect(stats.avgDaysToPayApproximate).toBe(false);
  });

  it("never leaks another org's transactions into this party's stats (org isolation)", async () => {
    seedSupplierHistory("org_A", "sup_1", "item_rice");
    seedSupplierHistory("org_B", "sup_1", "item_rice"); // same partyId, different org — must not merge
    const stats = await getPartyOverviewStats("org_A", "sup_1", "supplier");
    expect(stats.orderCount).toBe(8); // still only org_A's 8, not 16
  });
});

describe("getPartyAiMemory — per-contact learned patterns", () => {
  it("derives usual quantity/price/weekday/payment-terms for a supplier", async () => {
    seedSupplierHistory("org_A", "sup_1", "item_rice");
    const memory = await getPartyAiMemory("org_A", "sup_1", "supplier");

    expect(memory.usualProducts[0]?.name).toBe("Rice 25kg");
    expect(memory.usualProducts[0]?.usualQuantity).toBe("10");
    expect(memory.usualProducts[0]?.lastPrice).toBe(21_000n);
    expect(memory.mostCommonWeekday).toBe("Monday");
    expect(memory.usualPaymentTermsDays).toBe(30);
    expect(memory.preferredPaymentMethod).toBe("Bank transfer");
  });

  it("stays org-specific even when another org has a party with the same id/name", async () => {
    seedSupplierHistory("org_A", "sup_1", "item_rice");
    // org_B: different habits entirely for the "same" partyId.
    goodsReceiptRows.push({ id: "gr_b1", orgId: "org_B", partyId: "sup_1", date: day("2026-06-01"), total: 999_000n });
    goodsReceiptLineRows.push({
      id: "gr_b1_line",
      itemId: "item_sugar",
      quantity: { toString: () => "999" },
      unitCost: 1_000n,
      receipt: { orgId: "org_B", partyId: "sup_1", date: day("2026-06-01") },
    });
    inventoryItemRows.push({ id: "item_sugar", orgId: "org_B", name: "Sugar", unit: "sack" });

    const memoryA = await getPartyAiMemory("org_A", "sup_1", "supplier");
    expect(memoryA.usualProducts.every((p) => p.name !== "Sugar")).toBe(true);
    expect(memoryA.mostCommonWeekday).toBe("Monday");
  });
});

describe("getPartyEnrichmentSuggestions — Ask Bantoo gentle enrichment", () => {
  it("suggests adding a phone number when missing", async () => {
    partyRows.push({ id: "sup_1", orgId: "org_A", name: "Elhaji Adoum", phone: null, whatsapp: null, paymentTermsDays: null, preferredPaymentMethod: null });
    const suggestions = await getPartyEnrichmentSuggestions("org_A", "sup_1", "supplier");
    expect(suggestions.some((s) => s.id === "missing_phone" && s.text.includes("no phone number"))).toBe(true);
  });

  it("does not suggest a phone prompt when a phone or WhatsApp already exists", async () => {
    partyRows.push({ id: "sup_1", orgId: "org_A", name: "Elhaji Adoum", phone: "699000111", whatsapp: null, paymentTermsDays: null, preferredPaymentMethod: null });
    const suggestions = await getPartyEnrichmentSuggestions("org_A", "sup_1", "supplier");
    expect(suggestions.some((s) => s.id === "missing_phone")).toBe(false);
  });

  it("suggests setting payment terms once there is enough frequency-based evidence", async () => {
    partyRows.push({ id: "sup_1", orgId: "org_A", name: "Elhaji Adoum", phone: "699000111", whatsapp: null, paymentTermsDays: null, preferredPaymentMethod: null });
    seedSupplierHistory("org_A", "sup_1", "item_rice");
    const suggestions = await getPartyEnrichmentSuggestions("org_A", "sup_1", "supplier");
    const terms = suggestions.find((s) => s.accept.type === "set_payment_terms");
    expect(terms).toBeDefined();
    expect(terms?.text).toContain("30 day");
    if (terms?.accept.type === "set_payment_terms") expect(terms.accept.days).toBe(30);
  });

  it("does not suggest payment terms once the party already has them set", async () => {
    partyRows.push({ id: "sup_1", orgId: "org_A", name: "Elhaji Adoum", phone: "699000111", whatsapp: null, paymentTermsDays: 30, preferredPaymentMethod: null });
    seedSupplierHistory("org_A", "sup_1", "item_rice");
    const suggestions = await getPartyEnrichmentSuggestions("org_A", "sup_1", "supplier");
    expect(suggestions.some((s) => s.accept.type === "set_payment_terms")).toBe(false);
  });

  it("suggests a preferred-product note once the frequency threshold is met", async () => {
    partyRows.push({ id: "sup_1", orgId: "org_A", name: "Elhaji Adoum", phone: "699000111", whatsapp: null, paymentTermsDays: 30, preferredPaymentMethod: "Bank transfer" });
    seedSupplierHistory("org_A", "sup_1", "item_rice");
    const suggestions = await getPartyEnrichmentSuggestions("org_A", "sup_1", "supplier");
    const note = suggestions.find((s) => s.accept.type === "append_note");
    expect(note).toBeDefined();
    expect(note?.text).toContain("Rice 25kg");
  });

  it("returns nothing for a party that does not belong to this org (org isolation)", async () => {
    partyRows.push({ id: "sup_1", orgId: "org_B", name: "Elhaji Adoum", phone: null, whatsapp: null, paymentTermsDays: null, preferredPaymentMethod: null });
    const suggestions = await getPartyEnrichmentSuggestions("org_A", "sup_1", "supplier");
    expect(suggestions).toEqual([]);
  });
});
