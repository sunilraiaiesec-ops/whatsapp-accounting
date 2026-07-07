import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecuteBantooInput } from "@/lib/bantoo/types";

// --- Mocks: no DB / network. We exercise the org trust boundary and the
// product-defaults dependent population. ---------------------------------

const inventoryFindFirst = vi.fn();
const accountFindFirst = vi.fn();
const partyFindFirst = vi.fn();
const partyFindMany = vi.fn();
const listInventoryItems = vi.fn();
const receiveGoods = vi.fn();
const createInventoryItem = vi.fn();
const createPayment = vi.fn();
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
    inventoryItem: { findFirst: inventoryFindFirst },
    account: { findFirst: accountFindFirst },
    party: { findFirst: partyFindFirst, findMany: partyFindMany },
  },
}));

// findPossiblePartyDuplicates (the real implementation) is exercised as-is —
// only createParty is stubbed, so we can assert whether a NEW party would
// have been created without touching the DB.
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
  return { ...actual, createPayment };
});

const { executeBantooAction, getBantooProductDefaults } = await import("@/app/actions/bantoo");

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
    partyName: "",
    city: "",
    paymentMethod: "",
    description: "",
    date: "2026-01-05",
    dueDate: "",
    currency: "XAF",
    ...overrides,
  };
}

beforeEach(() => {
  inventoryFindFirst.mockReset();
  accountFindFirst.mockReset();
  partyFindFirst.mockReset();
  partyFindMany.mockReset().mockResolvedValue([]);
  listInventoryItems.mockReset();
  receiveGoods.mockReset();
  createInventoryItem.mockReset();
  createPayment.mockReset();
  createPartySpy.mockReset().mockImplementation(async (orgId: string, data: { name: string; type: string }) => ({
    id: "new_party_1",
    orgId,
    name: data.name,
    type: data.type,
    phone: null,
  }));
});

describe("ensurePartyId duplicate-prevention safety net (via executeBantooAction)", () => {
  it("reuses an existing HIGH-confidence duplicate instead of creating a new contact", async () => {
    accountFindFirst.mockResolvedValue({ id: "bank_1" });
    createPayment.mockResolvedValue({ id: "pay_1", number: "PAY-0001" });
    partyFindMany.mockResolvedValue([
      { id: "sup_existing", name: "Elhaji Adoum", type: "supplier", phone: null, whatsapp: null },
    ]);

    const input: ExecuteBantooInput = {
      action: "expense",
      draft: draft({ amount: "5000", description: "Fuel", partyName: "Elhaji Adoum" }),
      partyId: null,
      createParty: true,
      partyType: "supplier",
      itemId: null,
      bankAccountId: "bank_1",
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(createPartySpy).not.toHaveBeenCalled();
    expect(createPayment).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({ partyId: "sup_existing" }),
    );
  });

  it("still creates a new contact when no existing contact is a close match", async () => {
    accountFindFirst.mockResolvedValue({ id: "bank_1" });
    createPayment.mockResolvedValue({ id: "pay_2", number: "PAY-0002" });
    partyFindMany.mockResolvedValue([
      { id: "sup_other", name: "Zenith Global Traders", type: "supplier", phone: null, whatsapp: null },
    ]);

    const input: ExecuteBantooInput = {
      action: "expense",
      draft: draft({ amount: "5000", description: "Fuel", partyName: "Elhaji Adoum" }),
      partyId: null,
      createParty: true,
      partyType: "supplier",
      itemId: null,
      bankAccountId: "bank_1",
      lineAccountId: "acct_1",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(createPartySpy).toHaveBeenCalledWith("org_A", {
      name: "Elhaji Adoum",
      type: "supplier",
      city: null,
    });
    expect(createPayment).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({ partyId: "new_party_1" }),
    );
  });
});

describe("getBantooProductDefaults dependent population", () => {
  it("returns unit/tax/cost/sale/reorder for an existing org item", async () => {
    listInventoryItems.mockResolvedValue([
      {
        id: "item_1",
        unit: "bag",
        defaultTaxRate: { toString: () => "19.25" },
        avgCost: 12000n, // minor units; XAF has 0 decimals → "12000"
        salePrice: 15000n,
        reorderLevel: { toString: () => "10" },
      },
    ]);

    const res = await getBantooProductDefaults("item_1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.defaults).toEqual({
        unit: "bag",
        taxRate: "19.25",
        costPrice: "12000",
        salePrice: "15000",
        reorderLevel: "10",
      });
    }
  });

  it("rejects an item id that is not in the org (no cross-org leak)", async () => {
    listInventoryItems.mockResolvedValue([{ id: "item_1", unit: "bag", avgCost: 0n, salePrice: 0n, defaultTaxRate: null, reorderLevel: null }]);
    const res = await getBantooProductDefaults("item_from_other_org");
    expect(res.ok).toBe(false);
  });
});

describe("executeBantooAction org trust boundary", () => {
  it("rejects a cross-org itemId when receiving stock", async () => {
    // Supplier is valid & in-org so execution reaches the item validation.
    partyFindFirst.mockResolvedValue({ id: "sup_1" });
    inventoryFindFirst.mockResolvedValue(null); // item id not found in this org

    const input: ExecuteBantooInput = {
      action: "receive_stock",
      draft: draft({ quantity: "5", costPrice: "1000", productName: "Rice" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: "item_other_org",
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "That item was not found." });
    expect(receiveGoods).not.toHaveBeenCalled();
    expect(inventoryFindFirst).toHaveBeenCalledWith({
      where: { id: "item_other_org", orgId: "org_A" },
      select: { id: true },
    });
  });

  it("rejects a cross-org accountId when recording an expense", async () => {
    accountFindFirst.mockResolvedValue(null); // account not in this org

    const input: ExecuteBantooInput = {
      action: "expense",
      draft: draft({ amount: "5000", description: "Fuel" }),
      partyId: null,
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: "bank_other_org",
      lineAccountId: "acct_other_org",
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "That account was not found." });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("creates a customer with name and city for create_customer action", async () => {
    createPartySpy.mockResolvedValue({ id: "cust_new", name: "Golu" });
    partyFindMany.mockResolvedValue([]);
    partyFindFirst.mockResolvedValue({ id: "cust_new", name: "Golu" });

    const input: ExecuteBantooInput = {
      action: "create_customer",
      draft: draft({ partyName: "Golu", city: "Ngoundéré" }),
      partyId: null,
      createParty: true,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/customers/cust_new");
      expect(result.number).toBe("Golu");
      expect(result.kind).toBe("create_customer");
    }
    expect(createPartySpy).toHaveBeenCalledWith("org_A", {
      name: "Golu",
      type: "customer",
      city: "Ngoundéré",
    });
  });
});
