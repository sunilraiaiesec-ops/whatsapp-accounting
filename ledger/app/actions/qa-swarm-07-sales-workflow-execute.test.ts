import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecuteBantooInput } from "@/lib/bantoo/types";

// Ask Bantoo Reliability Swarm — Track 7 (Sales Workflow Agent).
//
// GAP THIS FILE CLOSES: the existing app/actions/bantoo.test.ts "Sales
// Intelligence Sprint" describe block covers sales_invoice/credit_note/
// refund_receipt/view_sales_invoice at the executeBantooAction level, but
// its top-level `vi.mock("@/lib/documents", ...)` only re-exports
// createPayment/createSalesInvoice/createCreditNote/createRefundReceipt as
// spies — createReceipt (customer_payment) and createSalesReceipt
// (sales_receipt, i.e. required test commands 1 and 2 from the swarm task
// brief) are NOT mocked there, so calling executeBantooAction with either
// action in that file would fall through to the REAL lib/documents.ts
// implementation and a real (unmocked) prisma.$transaction call. There is
// consequently ZERO existing execute-level test coverage for
// customer_payment or sales_receipt. This file adds it, mirroring the same
// org-trust-boundary / mocked-prisma pattern used throughout
// app/actions/bantoo.test.ts.

const accountFindFirst = vi.fn();
const partyFindFirst = vi.fn();
const partyFindMany = vi.fn();
const createReceipt = vi.fn();
const createSalesReceipt = vi.fn();
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
    inventoryItem: { findFirst: vi.fn() },
    account: { findFirst: accountFindFirst },
    party: { findFirst: partyFindFirst, findMany: partyFindMany },
  },
}));

vi.mock("@/lib/parties", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/parties")>();
  return { ...actual, createParty: createPartySpy };
});

vi.mock("@/lib/accounts", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/accounts")>();
  return {
    ...actual,
    receivableAccount: vi.fn(async () => ({ id: "acct_ar" })),
  };
});

vi.mock("@/lib/documents", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/documents")>();
  return { ...actual, createReceipt, createSalesReceipt };
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
  accountFindFirst.mockReset();
  partyFindFirst.mockReset();
  partyFindMany.mockReset().mockResolvedValue([]);
  createReceipt.mockReset();
  createSalesReceipt.mockReset();
  createPartySpy.mockReset().mockImplementation(async (orgId: string, data: { name: string; type: string }) => ({
    id: "new_party_1",
    orgId,
    name: data.name,
    type: data.type,
    phone: null,
  }));
});

describe("QA-SWARM-07: executeBantooAction — customer_payment full chain (required test command 2)", () => {
  it("posts a receipt with the resolved customer on the AR control line, correct amount and bank account (ledger effect: shows up in that customer's AR-ledger query, per lib/party-ledger.ts's journalLine partyId+accountId filter)", async () => {
    createReceipt.mockResolvedValue({ id: "rec_1", number: "REC-0001" });
    accountFindFirst.mockResolvedValue({ id: "acct_bank" });
    partyFindFirst.mockResolvedValue({ id: "cust_golu" });

    const input: ExecuteBantooInput = {
      action: "customer_payment",
      draft: draft({ amount: "50000", partyName: "Golu Transport Ltd", paymentMethod: "cash" }),
      partyId: "cust_golu",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_bank",
      lineAccountId: null, // resolve.ts defaults this to the receivable account when unset
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/receipts/rec_1");
      expect(result.number).toBe("REC-0001");
      expect(result.kind).toBe("customer_payment");
    }
    expect(createReceipt).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({
        bankAccountId: "acct_bank",
        partyId: "cust_golu",
        paymentMethod: "cash",
        lines: [expect.objectContaining({ accountId: "acct_ar", amount: 50000n })],
      }),
    );
  });

  it("rejects a zero/blank amount rather than posting a zero-value receipt", async () => {
    const input: ExecuteBantooInput = {
      action: "customer_payment",
      draft: draft({ amount: "", partyName: "Golu Transport Ltd" }),
      partyId: "cust_golu",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_bank",
      lineAccountId: null,
    };
    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Enter the amount received." });
    expect(createReceipt).not.toHaveBeenCalled();
  });

  it("requires a resolved/created customer before saving (never posts against a null party)", async () => {
    accountFindFirst.mockResolvedValue({ id: "acct_bank" });
    const input: ExecuteBantooInput = {
      action: "customer_payment",
      draft: draft({ amount: "50000", partyName: "" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_bank",
      lineAccountId: null,
    };
    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Choose the customer who paid." });
    expect(createReceipt).not.toHaveBeenCalled();
  });

  it("rejects a cross-org bank account id (trust boundary)", async () => {
    accountFindFirst.mockResolvedValue(null);
    const input: ExecuteBantooInput = {
      action: "customer_payment",
      draft: draft({ amount: "50000", partyName: "Golu Transport Ltd" }),
      partyId: "cust_golu",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_other_org",
      lineAccountId: null,
    };
    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "That account was not found." });
    expect(createReceipt).not.toHaveBeenCalled();
  });
});

describe("QA-SWARM-07: executeBantooAction — sales_receipt full chain (required test command 1)", () => {
  it("posts a cash sale with the resolved customer, bank account, and income line (ledger effect: intentionally does NOT touch AR — see documents.ts's Dr bank/Cr income posting — but IS listed on that customer's profile Documents tab per lib/party-documents.ts's listPartyOtherDocuments, and org-wide at /sales-receipts)", async () => {
    createSalesReceipt.mockResolvedValue({ id: "sr_1", number: "SR-0001" });
    accountFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "acct_bank" ? { id: "acct_bank" } : { id: "acct_income" },
    );
    partyFindFirst.mockResolvedValue({ id: "cust_musa" });

    const input: ExecuteBantooInput = {
      action: "sales_receipt",
      draft: draft({ amount: "25000", partyName: "Musa", description: "Rice sale" }),
      partyId: "cust_musa",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_bank",
      lineAccountId: "acct_income",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/sales-receipts/sr_1");
      expect(result.number).toBe("SR-0001");
      expect(result.kind).toBe("sales_receipt");
    }
    expect(createSalesReceipt).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({
        bankAccountId: "acct_bank",
        partyId: "cust_musa",
        lines: [
          expect.objectContaining({
            description: "Rice sale",
            unitPrice: 25000n,
            accountId: "acct_income",
          }),
        ],
      }),
    );
  });

  it("sales_receipt allows an anonymous/walk-in sale (no customer resolved) — unlike customer_payment", async () => {
    createSalesReceipt.mockResolvedValue({ id: "sr_2", number: "SR-0002" });
    accountFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "acct_bank" ? { id: "acct_bank" } : { id: "acct_income" },
    );

    const input: ExecuteBantooInput = {
      action: "sales_receipt",
      draft: draft({ amount: "5000", partyName: "" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_bank",
      lineAccountId: "acct_income",
    };
    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(createSalesReceipt).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({ partyId: null }),
    );
  });

  it("rejects a zero/blank amount rather than posting a zero-value sales receipt", async () => {
    const input: ExecuteBantooInput = {
      action: "sales_receipt",
      draft: draft({ amount: "", partyName: "Musa" }),
      partyId: "cust_musa",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_bank",
      lineAccountId: "acct_income",
    };
    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Enter the sale amount." });
    expect(createSalesReceipt).not.toHaveBeenCalled();
  });

  it("rejects when no bank/cash account is chosen", async () => {
    const input: ExecuteBantooInput = {
      action: "sales_receipt",
      draft: draft({ amount: "25000", partyName: "Musa" }),
      partyId: "cust_musa",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_income",
    };
    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Choose a bank or cash account." });
    expect(createSalesReceipt).not.toHaveBeenCalled();
  });
});

describe("QA-SWARM-07: unknown/unresolved customer name (required test command 7) never silently creates a phantom party without explicit confirmation", () => {
  it("customer_payment with createParty=false and no partyId fails cleanly instead of guessing a party", async () => {
    const input: ExecuteBantooInput = {
      action: "customer_payment",
      draft: draft({ amount: "15000", partyName: "Someone Who Doesnt Exist" }),
      partyId: null,
      createParty: false, // resolve.ts sets this true only after the UI offers "create new" and the user hasn't confirmed it yet
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_bank",
      lineAccountId: null,
    };
    accountFindFirst.mockResolvedValue({ id: "acct_bank" });

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Choose the customer who paid." });
    expect(createReceipt).not.toHaveBeenCalled();
    expect(createPartySpy).not.toHaveBeenCalled();
  });

  it("customer_payment with createParty=true (explicit user confirmation) creates exactly the named new customer, not a fuzzy-matched unrelated one", async () => {
    createReceipt.mockResolvedValue({ id: "rec_2", number: "REC-0002" });
    accountFindFirst.mockResolvedValue({ id: "acct_bank" });
    partyFindMany.mockResolvedValue([]); // no existing party named anything similar

    const input: ExecuteBantooInput = {
      action: "customer_payment",
      draft: draft({ amount: "15000", partyName: "Someone Who Doesnt Exist" }),
      partyId: null,
      createParty: true,
      partyType: "customer",
      itemId: null,
      bankAccountId: "acct_bank",
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(createPartySpy).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({ name: "Someone Who Doesnt Exist", type: "customer" }),
    );
    expect(createReceipt).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({ partyId: "new_party_1" }),
    );
  });
});
