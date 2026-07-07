import { beforeEach, describe, expect, it, vi } from "vitest";

const goodsReceiptCount = vi.fn();
const purchaseInvoiceCount = vi.fn();
const paymentCount = vi.fn();
const purchaseInvoiceFindFirst = vi.fn();
const salesInvoiceFindFirst = vi.fn();
const paymentAggregate = vi.fn();
const receiptAggregate = vi.fn();
const salesInvoiceAggregate = vi.fn();
const purchaseInvoiceAggregate = vi.fn();
const goodsReceiptAggregate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    goodsReceipt: { count: goodsReceiptCount, aggregate: goodsReceiptAggregate },
    purchaseInvoice: { count: purchaseInvoiceCount, findFirst: purchaseInvoiceFindFirst, aggregate: purchaseInvoiceAggregate },
    payment: { count: paymentCount, aggregate: paymentAggregate },
    salesInvoice: { findFirst: salesInvoiceFindFirst, aggregate: salesInvoiceAggregate },
    receipt: { aggregate: receiptAggregate },
  },
}));

const costPatternForItem = vi.fn();
vi.mock("@/lib/command-patterns", () => ({
  costPatternForItem: (...args: unknown[]) => costPatternForItem(...args),
}));

vi.mock("@/lib/ai/provider", () => ({
  isAiConfigured: () => false,
  getAiProvider: () => {
    throw new Error("should not be called when isAiConfigured() is false");
  },
  AiError: class AiError extends Error {},
  AiNotConfiguredError: class AiNotConfiguredError extends Error {},
}));

const { computeRiskReview } = await import("@/lib/approvals/risk-review");
const { serializeForType } = await import("@/lib/approvals/payloads");

beforeEach(() => {
  goodsReceiptCount.mockReset().mockResolvedValue(0);
  purchaseInvoiceCount.mockReset().mockResolvedValue(0);
  paymentCount.mockReset().mockResolvedValue(0);
  purchaseInvoiceFindFirst.mockReset().mockResolvedValue(null);
  salesInvoiceFindFirst.mockReset().mockResolvedValue(null);
  paymentAggregate.mockReset().mockResolvedValue({ _avg: { total: null }, _count: 0 });
  receiptAggregate.mockReset().mockResolvedValue({ _avg: { total: null }, _count: 0 });
  salesInvoiceAggregate.mockReset().mockResolvedValue({ _avg: { total: null }, _count: 0 });
  purchaseInvoiceAggregate.mockReset().mockResolvedValue({ _avg: { total: null }, _count: 0 });
  goodsReceiptAggregate.mockReset().mockResolvedValue({ _avg: { total: null }, _count: 0 });
  costPatternForItem.mockReset().mockResolvedValue(undefined);
});

describe("computeRiskReview — deterministic, advisory-only signals", () => {
  it("flags missing attachment for a receipt-requiring type with none, and returns low risk when it's the only signal", async () => {
    const stored = serializeForType("expense", {
      date: new Date(),
      bankAccountId: "acct_1",
      partyId: null,
      lines: [{ accountId: "a", amount: 1000n, memo: null, className: null, taxRate: null }],
      itemLines: [],
    });
    const review = await computeRiskReview("org_1", "expense", stored as unknown as never, null, "XAF");
    expect(review.signals.some((s) => s.code === "missing_attachment")).toBe(true);
    expect(review.level).toBe("low");
    expect(review.aiNarrative).toBeNull();
  });

  it("does not flag missing attachment when one is present", async () => {
    const stored = serializeForType("expense", {
      date: new Date(),
      bankAccountId: "acct_1",
      partyId: null,
      lines: [{ accountId: "a", amount: 1000n, memo: null, className: null, taxRate: null }],
      itemLines: [],
    });
    const review = await computeRiskReview("org_1", "expense", stored as unknown as never, "doc_1", "XAF");
    expect(review.signals.some((s) => s.code === "missing_attachment")).toBe(false);
  });

  it("flags an unfamiliar supplier with zero prior history for stock_receipt", async () => {
    const stored = serializeForType("stock_receipt", {
      partyId: "supplier_new",
      date: new Date(),
      lines: [{ itemId: "item_1", quantity: "1", unitCost: 1000n }],
    });
    const review = await computeRiskReview("org_1", "stock_receipt", stored as unknown as never, "doc_1", "XAF");
    expect(review.signals.some((s) => s.code === "unfamiliar_supplier")).toBe(true);
  });

  it("does not flag unfamiliar supplier once there is prior history", async () => {
    purchaseInvoiceCount.mockResolvedValue(3);
    const stored = serializeForType("purchase_invoice", {
      partyId: "supplier_known",
      date: new Date(),
      supplierRef: null,
      lines: [],
    });
    const review = await computeRiskReview("org_1", "purchase_invoice", stored as unknown as never, "doc_1", "XAF");
    expect(review.signals.some((s) => s.code === "unfamiliar_supplier")).toBe(false);
  });

  it("flags a possible duplicate invoice number for a purchase invoice", async () => {
    purchaseInvoiceFindFirst.mockResolvedValue({ id: "existing_1", number: "BILL-0001" });
    const stored = serializeForType("purchase_invoice", {
      partyId: "supplier_1",
      date: new Date(),
      supplierRef: "REF-123",
      lines: [],
    });
    const review = await computeRiskReview("org_1", "purchase_invoice", stored as unknown as never, "doc_1", "XAF");
    expect(review.signals.some((s) => s.code === "duplicate_invoice_number")).toBe(true);
  });

  it("flags an amount unusually high vs. historical average", async () => {
    paymentAggregate.mockResolvedValue({ _avg: { total: 1000 }, _count: 5 });
    const stored = serializeForType("expense", {
      date: new Date(),
      bankAccountId: "acct_1",
      partyId: null,
      lines: [{ accountId: "a", amount: 10_000n, memo: null, className: null, taxRate: null }], // 10x average
      itemLines: [],
    });
    const review = await computeRiskReview("org_1", "expense", stored as unknown as never, "doc_1", "XAF");
    expect(review.signals.some((s) => s.code === "amount_unusually_high")).toBe(true);
  });

  it("combines several signals into a higher risk level", async () => {
    purchaseInvoiceFindFirst.mockResolvedValue({ id: "existing_1", number: "BILL-0001" });
    purchaseInvoiceAggregate.mockResolvedValue({ _avg: { total: 1000 }, _count: 5 });
    const stored = serializeForType("purchase_invoice", {
      partyId: "supplier_new",
      date: new Date(),
      supplierRef: "REF-123",
      lines: [{ description: "x", quantity: "1", unitPrice: 10_000n, accountId: "a", itemId: null, taxRate: null }],
    });
    const review = await computeRiskReview("org_1", "purchase_invoice", stored as unknown as never, null, "XAF");
    // unfamiliar_supplier(10) + duplicate_invoice_number(25) + amount_unusually_high(20) + missing_attachment(15) = 70
    expect(review.score).toBeGreaterThanOrEqual(60);
    expect(review.level).toBe("high");
    expect(review.signals.length).toBeGreaterThanOrEqual(4);
  });

  it("never throws or blocks — always returns a review even with zero signals", async () => {
    const stored = serializeForType("payment_received", {
      date: new Date(),
      bankAccountId: "acct_1",
      partyId: "party_1",
      lines: [{ accountId: "a", amount: 1000n, memo: null, className: null, taxRate: null }],
    });
    const review = await computeRiskReview("org_1", "payment_received", stored as unknown as never, "doc_1", "XAF");
    expect(review.level).toBe("low");
    expect(Array.isArray(review.signals)).toBe(true);
  });
});
