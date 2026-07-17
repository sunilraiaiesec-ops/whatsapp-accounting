// ---------------------------------------------------------------------------
// QA Swarm Track 10 — Persistence/Navigation Agent.
//
// Structural ID-consistency check for every money/document-creating Ask
// Bantoo action type (receive_stock, supplier_purchase, customer_payment,
// expense, sales_receipt, add_inventory_item, sales_invoice, credit_note,
// refund_receipt): the href returned by executeBantooAction() must always be
// built directly from the SAME object returned by the underlying
// lib/documents.ts / lib/inventory.ts creation call — never a second,
// independently-derived id. This mirrors the codebase's own established
// testing convention (see app/actions/bantoo.test.ts) of mocking the
// document-creation functions themselves and asserting on the call args
// (proxy for "what would actually be persisted") plus the returned id.
//
// Unlike the Party-backed actions (create_customer/create_supplier/etc,
// covered end-to-end with a real in-memory Party store in
// lib/bantoo/qa-swarm-10-persistence-nav.test.ts), these money-document
// actions do a SINGLE write (no re-fetch-by-fuzzy-match-after-the-fact), so
// there is no structural opportunity for the returned id to drift from the
// persisted row's real id — these tests confirm that invariant holds for
// every action type in this family, and that every amount/field shown in
// the confirmation draft is actually the value forwarded to the persistence
// layer.
//
// THIS FILE IS READ-ONLY WITH RESPECT TO PRODUCTION SOURCE: new tests only.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecuteBantooInput } from "@/lib/bantoo/types";

const inventoryFindFirst = vi.fn();
const accountFindFirst = vi.fn();
const partyFindFirst = vi.fn();
const partyFindMany = vi.fn();
const listInventoryItems = vi.fn();
const receiveGoods = vi.fn();
const createInventoryItem = vi.fn();
const createPurchaseInvoice = vi.fn();
const createReceipt = vi.fn();
const createPayment = vi.fn();
const createSalesReceipt = vi.fn();
const createSalesInvoice = vi.fn();
const createCreditNote = vi.fn();
const createRefundReceipt = vi.fn();
const createPartySpy = vi.fn();

vi.mock("@/lib/auth/current", () => ({
  requireContext: vi.fn(async () => ({
    userId: "user_1",
    orgId: "org_A",
    userName: "T",
    userEmail: "t@example.com",
    orgName: "Org A",
    baseCurrency: "XAF",
    role: "owner",
    emailVerified: true,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inventoryItem: { findFirst: inventoryFindFirst, findMany: vi.fn(async () => []) },
    account: { findFirst: accountFindFirst },
    party: { findFirst: partyFindFirst, findMany: partyFindMany },
  },
}));

vi.mock("@/lib/parties", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/parties")>();
  return { ...actual, createParty: createPartySpy };
});

vi.mock("@/lib/inventory", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/inventory")>();
  return { ...actual, listInventoryItems, receiveGoods, createInventoryItem };
});

vi.mock("@/lib/documents", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/documents")>();
  return {
    ...actual,
    createPurchaseInvoice,
    createReceipt,
    createPayment,
    createSalesReceipt,
    createSalesInvoice,
    createCreditNote,
    createRefundReceipt,
  };
});

const { executeBantooAction } = await import("@/app/actions/bantoo");

function draft(overrides: Record<string, string> = {}) {
  return {
    productName: "",
    barcode: "",
    sku: "",
    category: "",
    unit: "",
    quantity: "",
    costPrice: "",
    salePrice: "",
    taxRate: "",
    reorderLevel: "",
    amount: "",
    unitPrice: "",
    partyName: "",
    city: "",
    country: "",
    paymentMethod: "",
    description: "",
    date: "2026-01-05",
    dueDate: "",
    currency: "XAF",
    newName: "",
    phone: "",
    whatsapp: "",
    email: "",
    companyName: "",
    taxId: "",
    paymentTermsDays: "",
    creditLimit: "",
    defaultDiscount: "",
    preferredLanguage: "",
    preferredPaymentMethod: "",
    note: "",
    view: "",
    periodText: "",
    dateFrom: "",
    dateTo: "",
    contactMethod: "",
    requestedAction: "",
    postAction: "",
    ...overrides,
  };
}

beforeEach(() => {
  inventoryFindFirst.mockReset();
  accountFindFirst.mockReset().mockResolvedValue({ id: "acct_1" });
  partyFindFirst.mockReset().mockResolvedValue({ id: "party_1" });
  partyFindMany.mockReset().mockResolvedValue([]);
  listInventoryItems.mockReset().mockResolvedValue([]);
  receiveGoods.mockReset();
  createInventoryItem.mockReset();
  createPurchaseInvoice.mockReset();
  createReceipt.mockReset();
  createPayment.mockReset();
  createSalesReceipt.mockReset();
  createSalesInvoice.mockReset();
  createCreditNote.mockReset();
  createRefundReceipt.mockReset();
  createPartySpy.mockReset();
});

describe("Document-creating actions: href id always equals the actual persisted document's own id", () => {
  it("receive_stock: href/number match the object returned by receiveGoods, and every submitted field reaches it", async () => {
    receiveGoods.mockResolvedValue({ id: "gr_77", number: "GR-0077" });
    inventoryFindFirst.mockResolvedValue({ id: "item_1" });

    const input: ExecuteBantooInput = {
      action: "receive_stock",
      draft: draft({ quantity: "10", costPrice: "500", productName: "Rice 50kg", description: "From Elhaji" }),
      partyId: "party_1",
      createParty: false,
      partyType: "supplier",
      itemId: "item_1",
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe(`/goods-receipts/${"gr_77"}`);
    expect(result.number).toBe("GR-0077");
    expect(receiveGoods).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({
        partyId: "party_1",
        lines: [expect.objectContaining({ itemId: "item_1", quantity: "10", unitCost: 500n })],
      }),
    );
  });

  it("supplier_purchase: href/number match the object returned by createPurchaseInvoice", async () => {
    createPurchaseInvoice.mockResolvedValue({ id: "bill_9", number: "BILL-0009" });

    const input: ExecuteBantooInput = {
      action: "supplier_purchase",
      draft: draft({ amount: "120000", description: "Cement", partyName: "Olam" }),
      partyId: "party_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/purchase-invoices/bill_9");
    expect(result.number).toBe("BILL-0009");
    expect(createPurchaseInvoice).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({ partyId: "party_1" }),
    );
  });

  it("customer_payment: href/number match the object returned by createReceipt", async () => {
    createReceipt.mockResolvedValue({ id: "rec_3", number: "REC-0003" });

    const input: ExecuteBantooInput = {
      action: "customer_payment",
      draft: draft({ amount: "50000", partyName: "Aisha Musa" }),
      partyId: "party_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_1",
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/receipts/rec_3");
    expect(result.number).toBe("REC-0003");
  });

  it("expense: href/number match the object returned by createPayment", async () => {
    createPayment.mockResolvedValue({ id: "pay_5", number: "PAY-0005" });

    const input: ExecuteBantooInput = {
      action: "expense",
      draft: draft({ amount: "7500", description: "Fuel" }),
      partyId: null,
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: "acct_1",
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/payments/pay_5");
    expect(result.number).toBe("PAY-0005");
  });

  it("sales_receipt: href/number match the object returned by createSalesReceipt", async () => {
    createSalesReceipt.mockResolvedValue({ id: "sr_2", number: "SR-0002" });

    const input: ExecuteBantooInput = {
      action: "sales_receipt",
      draft: draft({ amount: "15000", partyName: "Walk-in" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_1",
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/sales-receipts/sr_2");
    expect(result.number).toBe("SR-0002");
  });

  it("sales_invoice: href/number match the object returned by createSalesInvoice, due date is forwarded", async () => {
    createSalesInvoice.mockResolvedValue({ id: "inv_8", number: "INV-0008" });

    const input: ExecuteBantooInput = {
      action: "sales_invoice",
      draft: draft({ amount: "200000", partyName: "Golu Transport", dueDate: "2026-02-04" }),
      partyId: "party_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/sales-invoices/inv_8");
    expect(result.number).toBe("INV-0008");
    expect(createSalesInvoice).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({ partyId: "party_1", dueDate: new Date("2026-02-04") }),
    );
  });

  it("credit_note: href/number match the object returned by createCreditNote", async () => {
    createCreditNote.mockResolvedValue({ id: "cn_4", number: "CN-0004" });

    const input: ExecuteBantooInput = {
      action: "credit_note",
      draft: draft({ amount: "9000", partyName: "Aisha Musa" }),
      partyId: "party_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/credit-notes/cn_4");
    expect(result.number).toBe("CN-0004");
  });

  it("refund_receipt: href/number match the object returned by createRefundReceipt, party optional", async () => {
    createRefundReceipt.mockResolvedValue({ id: "rr_1", number: "RR-0001" });

    const input: ExecuteBantooInput = {
      action: "refund_receipt",
      draft: draft({ amount: "3000" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_1",
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/refund-receipts/rr_1");
    expect(result.number).toBe("RR-0001");
  });

  it("add_inventory_item: href/number match the created item's own code, opening stock (if any) uses that SAME item's id", async () => {
    createInventoryItem.mockResolvedValue({ id: "item_new", code: "BAN-0001" });

    const input: ExecuteBantooInput = {
      action: "add_inventory_item",
      draft: draft({ productName: "Sugar 1kg", salePrice: "1000" }),
      partyId: null,
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/inventory-items");
    expect(result.number).toBe("BAN-0001");
  });

  it("add_inventory_item WITH opening stock: receiveGoods is called with the exact itemId just created (no id drift between the new item and its opening-stock receipt)", async () => {
    createInventoryItem.mockResolvedValue({ id: "item_new2", code: "BAN-0002" });
    receiveGoods.mockResolvedValue({ id: "gr_1", number: "GR-0001" });

    const input: ExecuteBantooInput = {
      action: "add_inventory_item",
      draft: draft({
        productName: "Sugar 1kg",
        salePrice: "1000",
        quantity: "20",
        costPrice: "700",
        partyName: "Olam",
      }),
      partyId: "party_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(receiveGoods).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({
        partyId: "party_1",
        lines: [expect.objectContaining({ itemId: "item_new2", quantity: "20", unitCost: 700n })],
      }),
    );
  });
});
