import { beforeEach, describe, expect, it, vi } from "vitest";

const createPayment = vi.fn();
const createReceipt = vi.fn();
const createSalesInvoice = vi.fn();
const createPurchaseInvoice = vi.fn();

vi.mock("@/lib/documents", () => ({
  createPayment: (...args: unknown[]) => createPayment(...args),
  createReceipt: (...args: unknown[]) => createReceipt(...args),
  createSalesInvoice: (...args: unknown[]) => createSalesInvoice(...args),
  createPurchaseInvoice: (...args: unknown[]) => createPurchaseInvoice(...args),
}));

const receiveGoods = vi.fn();
const adjustInventory = vi.fn();
vi.mock("@/lib/inventory", () => ({
  receiveGoods: (...args: unknown[]) => receiveGoods(...args),
  adjustInventory: (...args: unknown[]) => adjustInventory(...args),
}));

const {
  serializePaymentPayload,
  serializeForType,
  postApprovedPayload,
  estimateAmountMinor,
  estimateAmountMinorFromStored,
  partyIdFromStored,
} = await import("@/lib/approvals/payloads");

beforeEach(() => {
  createPayment.mockReset().mockResolvedValue({ id: "pay_1" });
  createReceipt.mockReset().mockResolvedValue({ id: "rec_1" });
  createSalesInvoice.mockReset().mockResolvedValue({ id: "si_1" });
  createPurchaseInvoice.mockReset().mockResolvedValue({ id: "pi_1" });
  receiveGoods.mockReset().mockResolvedValue({ id: "gr_1" });
  adjustInventory.mockReset().mockResolvedValue({ id: "ia_1" });
});

describe("serialize/hydrate round-trip — Dates and BigInts survive JSON storage", () => {
  it("serializePaymentPayload converts Date -> ISO string and BigInt -> decimal string", () => {
    const date = new Date("2026-01-15T10:00:00.000Z");
    const stored = serializePaymentPayload({
      date,
      bankAccountId: "acct_1",
      partyId: "party_1",
      lines: [{ accountId: "acct_2", amount: 5000n, memo: null, className: null, taxRate: null }],
      itemLines: [],
    });
    expect(stored.date).toBe(date.toISOString());
    expect(stored.lines[0].amount).toBe("5000");
    expect(typeof stored.lines[0].amount).toBe("string");
  });

  it("postApprovedPayload hydrates back to the exact BigInt/Date shape createPayment expects", async () => {
    const date = new Date("2026-01-15T10:00:00.000Z");
    const stored = serializePaymentPayload({
      date,
      bankAccountId: "acct_1",
      partyId: null,
      lines: [{ accountId: "acct_2", amount: 5000n, memo: null, className: null, taxRate: null }],
      itemLines: [],
    });

    await postApprovedPayload("org_1", "expense", stored as unknown as never);

    expect(createPayment).toHaveBeenCalledTimes(1);
    const [orgId, hydrated] = createPayment.mock.calls[0];
    expect(orgId).toBe("org_1");
    expect(hydrated.date).toEqual(date);
    expect(hydrated.lines[0].amount).toBe(5000n);
    expect(typeof hydrated.lines[0].amount).toBe("bigint");
  });
});

describe("postApprovedPayload — dispatches to the SAME real posting function per type", () => {
  it("supplier_payment and expense both dispatch to createPayment", async () => {
    const stored = serializePaymentPayload({
      date: new Date(),
      bankAccountId: "acct_1",
      partyId: "party_1",
      lines: [],
      itemLines: [],
    });
    await postApprovedPayload("org_1", "expense", stored as unknown as never);
    await postApprovedPayload("org_1", "supplier_payment", stored as unknown as never);
    expect(createPayment).toHaveBeenCalledTimes(2);
  });

  it("stock_receipt dispatches to receiveGoods, inventory_adjustment to adjustInventory", async () => {
    const goodsReceiptStored = serializeForType("stock_receipt", {
      partyId: "party_1",
      date: new Date(),
      lines: [{ itemId: "item_1", quantity: "2", unitCost: 1000n }],
    });
    await postApprovedPayload("org_1", "stock_receipt", goodsReceiptStored as unknown as never);
    expect(receiveGoods).toHaveBeenCalledTimes(1);

    const adjustmentStored = serializeForType("inventory_adjustment", {
      date: new Date(),
      adjustmentAccountId: "acct_1",
      lines: [{ itemId: "item_1", newQuantity: "10" }],
    });
    await postApprovedPayload("org_1", "inventory_adjustment", adjustmentStored as unknown as never);
    expect(adjustInventory).toHaveBeenCalledTimes(1);
  });
});

describe("estimateAmountMinor — used for the Manager threshold and risk review", () => {
  it("sums cash lines and item lines for a payment", () => {
    const amount = estimateAmountMinor("expense", {
      date: new Date(),
      bankAccountId: "acct_1",
      lines: [{ accountId: "a", amount: 1000n, memo: null, className: null, taxRate: null }],
      itemLines: [{ itemId: "i1", quantity: "2", unitCost: 500n, memo: null, className: null, taxRate: null }],
    });
    expect(amount).toBe(2000n); // 1000 + (2 * 500)
  });

  it("returns 0 for inventory_adjustment (no single amount concept)", () => {
    expect(
      estimateAmountMinor("inventory_adjustment", {
        date: new Date(),
        adjustmentAccountId: "a",
        lines: [{ itemId: "i1", newQuantity: "5" }],
      }),
    ).toBe(0n);
  });

  it("estimateAmountMinorFromStored matches estimateAmountMinor for the same values", () => {
    const raw = {
      partyId: "p1",
      date: new Date(),
      lines: [{ description: "x", quantity: "3", unitPrice: 1000n, accountId: "a", itemId: null, taxRate: null }],
    };
    const stored = serializeForType("sales_invoice", raw);
    expect(estimateAmountMinorFromStored("sales_invoice", stored as unknown as never)).toBe(
      estimateAmountMinor("sales_invoice", raw),
    );
  });
});

describe("partyIdFromStored", () => {
  it("extracts partyId for party-bearing types and null for inventory_adjustment", () => {
    const stored = serializeForType("purchase_invoice", {
      partyId: "supplier_1",
      date: new Date(),
      lines: [],
    });
    expect(partyIdFromStored("purchase_invoice", stored as unknown as never)).toBe("supplier_1");
    expect(
      partyIdFromStored(
        "inventory_adjustment",
        serializeForType("inventory_adjustment", {
          date: new Date(),
          adjustmentAccountId: "a",
          lines: [],
        }) as unknown as never,
      ),
    ).toBeNull();
  });
});
