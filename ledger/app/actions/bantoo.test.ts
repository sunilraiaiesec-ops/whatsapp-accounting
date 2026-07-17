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
const createSalesInvoice = vi.fn();
const createCreditNote = vi.fn();
const createRefundReceipt = vi.fn();
const createPartySpy = vi.fn();
const updatePartySpy = vi.fn();
const updatePartyNotesSpy = vi.fn();
const getPartyBalanceSpy = vi.fn();
const getPartyPurchaseHistoryInRangeSpy = vi.fn();

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
  return {
    ...actual,
    createParty: createPartySpy,
    updateParty: updatePartySpy,
    updatePartyNotes: updatePartyNotesSpy,
  };
});

vi.mock("@/lib/party-ledger", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/party-ledger")>();
  return { ...actual, getPartyBalance: getPartyBalanceSpy };
});

vi.mock("@/lib/party-insights", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/party-insights")>();
  return { ...actual, getPartyPurchaseHistoryInRange: getPartyPurchaseHistoryInRangeSpy };
});

vi.mock("@/lib/inventory", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/inventory")>();
  return { ...actual, listInventoryItems, receiveGoods, createInventoryItem };
});

vi.mock("@/lib/documents", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/documents")>();
  return { ...actual, createPayment, createSalesInvoice, createCreditNote, createRefundReceipt };
});

// This suite tests executeBantooAction's business logic (balances, party
// creation, duplicate handling, etc.), not locale/i18n behavior — pin the
// resolved UI locale to English so its long-standing English message
// assertions keep testing what they always tested. (Locale-switching itself
// is covered by app/actions/qa-swarm-09-language-consistency.test.ts and
// lib/bantoo/qa-swarm-09-language-consistency.test.ts.) Without this, calls
// to resolveUiLocale() made outside a real Next.js request scope fall back
// to routing.defaultLocale ("fr").
vi.mock("@/lib/bantoo/locale", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/bantoo/locale")>();
  return { ...actual, resolveUiLocale: vi.fn(async () => "en" as const) };
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
  accountFindFirst.mockReset();
  partyFindFirst.mockReset();
  partyFindMany.mockReset().mockResolvedValue([]);
  listInventoryItems.mockReset();
  receiveGoods.mockReset();
  createInventoryItem.mockReset();
  createPayment.mockReset();
  createSalesInvoice.mockReset();
  createCreditNote.mockReset();
  createRefundReceipt.mockReset();
  createPartySpy.mockReset().mockImplementation(async (orgId: string, data: { name: string; type: string }) => ({
    id: "new_party_1",
    orgId,
    name: data.name,
    type: data.type,
    phone: null,
  }));
  updatePartySpy.mockReset();
  updatePartyNotesSpy.mockReset();
  getPartyBalanceSpy.mockReset();
  getPartyPurchaseHistoryInRangeSpy.mockReset();
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
      phone: null,
      whatsapp: null,
      country: null,
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
      phone: null,
      whatsapp: null,
      country: null,
    });
  });

  // Launch-blocking bug fix: create_supplier didn't exist at all before this
  // sprint (see the postmortem comment above createSupplierSchema in
  // lib/ai/actions.ts) — this is the execute-time mirror of the
  // create_customer test above, confirming the confirmation message/href/kind
  // all say "supplier" (via /suppliers route + kind: "create_supplier"),
  // never drifting to a customer record.
  it("creates a supplier with name and city for create_supplier action (launch-blocking bug fix)", async () => {
    createPartySpy.mockResolvedValue({ id: "sup_new", name: "Alhaji Ibrahim" });
    partyFindMany.mockResolvedValue([]);
    partyFindFirst.mockResolvedValue({ id: "sup_new", name: "Alhaji Ibrahim", notes: null });

    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: draft({ partyName: "Alhaji Ibrahim", city: "Garoua", phone: "690123456", whatsapp: "690123456" }),
      partyId: null,
      createParty: true,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/suppliers/sup_new");
      expect(result.number).toBe("Alhaji Ibrahim");
      expect(result.kind).toBe("create_supplier");
    }
    expect(createPartySpy).toHaveBeenCalledWith("org_A", {
      name: "Alhaji Ibrahim",
      type: "supplier",
      city: "Garoua",
      phone: "690123456",
      whatsapp: "690123456",
      country: null,
    });
  });

  it("create_supplier: appends the internal note after saving, mirroring create_customer", async () => {
    createPartySpy.mockResolvedValue({ id: "sup_new", name: "Alhaji Ibrahim" });
    partyFindMany.mockResolvedValue([]);
    partyFindFirst.mockResolvedValue({ id: "sup_new", name: "Alhaji Ibrahim", notes: null });

    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: draft({
        partyName: "Alhaji Ibrahim",
        city: "Garoua",
        note: "I'll be buying sesame from him every month",
      }),
      partyId: null,
      createParty: true,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(updatePartyNotesSpy).toHaveBeenCalledWith(
      "org_A",
      "sup_new",
      expect.stringContaining("I'll be buying sesame from him every month"),
    );
  });

  it("create_supplier: rejects when the supplier name is blank", async () => {
    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: draft({ partyName: "   " }),
      partyId: null,
      createParty: true,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Enter the supplier name." });
    expect(createPartySpy).not.toHaveBeenCalled();
  });
});

// --- Bug fix: "create as new" duplicate-choice was silently ignored -------
// Repro (from the live bug report): an existing customer "golu" (Garoua) is
// on file. The user asks Ask Bantoo to add "Golu Transport" in Ngoundéré —
// resolve.ts correctly flags the name-match conflict and the client shows
// the duplicate-choice prompt. "Golu Transport" contains "golu" as a
// substring, which scores >= MATCH_HIGH (90) in the shared fuzzy matcher
// (lib/bantoo/match.ts), so ensurePartyId's OWN independent duplicate
// re-check used to silently reuse the existing "golu" party — discarding the
// user's explicit "create as a new customer with the same name" choice and
// every new field value (city/phone/whatsapp/note) they had just entered.
// The fix: the client now sends an authoritative `duplicateResolution` flag,
// and execute() branches on it directly (via ensurePartyId's `forceCreate`)
// instead of re-deriving party identity via fuzzy matching a second time.
describe("executeBantooAction — create_customer duplicate-choice resolution (Golu Transport regression)", () => {
  it('"create as new" choice creates a DIFFERENT party with the new name/city/phone/whatsapp/note, even though the name fuzzy-matches the existing customer at HIGH confidence', async () => {
    // The existing "golu" (Garoua) record that resolve.ts's duplicateCandidate
    // pointed at — "Golu Transport" contains "golu" as a substring, which
    // scores 90 (>= MATCH_HIGH) in the shared matcher, so this is exactly the
    // scenario that used to be silently re-matched at execute time.
    partyFindMany.mockResolvedValue([
      { id: "party_golu_garoua", name: "golu", type: "customer", phone: null, whatsapp: null },
    ]);
    createPartySpy.mockResolvedValue({ id: "party_golu_transport", name: "Golu Transport" });
    partyFindFirst.mockResolvedValue({
      id: "party_golu_transport",
      name: "Golu Transport",
      notes: null,
    });

    const input: ExecuteBantooInput = {
      action: "create_customer",
      draft: draft({
        partyName: "Golu Transport",
        city: "Ngoundéré",
        phone: "+237699123456",
        whatsapp: "+237699123456",
        note: "prefers WhatsApp, pays after 14 days, do not confuse with existing Golu in Garoua",
      }),
      partyId: null,
      createParty: true,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
      duplicateResolution: "create_new",
    };

    const result = await executeBantooAction(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // A brand-new party id — NOT the existing "golu"/Garoua record.
      expect(result.href).toBe("/customers/party_golu_transport");
      expect(result.href).not.toBe("/customers/party_golu_garoua");
      // The confirmation message uses the NEW name, never the old "golu".
      expect(result.number).toBe("Golu Transport");
    }

    // A genuinely new party was created with every submitted field — the
    // existing-party fuzzy-match safety net was bypassed, not consulted.
    expect(createPartySpy).toHaveBeenCalledWith("org_A", {
      name: "Golu Transport",
      type: "customer",
      city: "Ngoundéré",
      phone: "+237699123456",
      whatsapp: "+237699123456",
      country: null,
    });
    // Launch Bug Fix Sprint: every brand-new customer gets companyName
    // defaulted to its own name (see the "Company name field appears
    // blank" bug this closes) and defaultCurrency set from the request's
    // currency (defaults to the org base currency) — applied via a
    // follow-up updateParty call, never by re-litigating the party
    // identity/duplicate decision above.
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "party_golu_transport", {
      companyName: "Golu Transport",
      defaultCurrency: "XAF",
    });
    expect(updatePartyNotesSpy).toHaveBeenCalledWith(
      "org_A",
      "party_golu_transport",
      expect.stringContaining("prefers WhatsApp, pays after 14 days"),
    );
  });

  it('"use existing customer" choice enriches the EXISTING party (city/phone/whatsapp/note) instead of creating a duplicate, and the confirmation reflects the EXISTING record', async () => {
    partyFindFirst.mockResolvedValue({
      id: "party_golu_garoua",
      name: "golu",
      notes: "[2026-01-01] Regular customer",
    });

    const input: ExecuteBantooInput = {
      action: "create_customer",
      draft: draft({
        partyName: "Golu Transport",
        city: "Ngoundéré",
        phone: "+237699123456",
        whatsapp: "+237699123456",
        note: "prefers WhatsApp, pays after 14 days",
      }),
      // The client sets partyId to the existing match's id as soon as "use
      // existing" is chosen (see duplicateChoiceBlock in BantooCommand.tsx).
      partyId: "party_golu_garoua",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
      duplicateResolution: "use_existing",
    };

    const result = await executeBantooAction(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Navigates to (and names) the EXISTING record — never a new one.
      expect(result.href).toBe("/customers/party_golu_garoua");
      expect(result.number).toBe("golu");
    }

    expect(createPartySpy).not.toHaveBeenCalled();
    // The existing party is enriched with the newly submitted contact
    // details rather than silently discarding them.
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "party_golu_garoua", {
      city: "Ngoundéré",
      phone: "+237699123456",
      whatsapp: "+237699123456",
    });
    expect(updatePartyNotesSpy).toHaveBeenCalledWith(
      "org_A",
      "party_golu_garoua",
      expect.stringContaining("prefers WhatsApp, pays after 14 days"),
    );
  });

  it("no-duplicate regression guard: a genuinely new name with no close match still creates a single new party without needing a duplicateResolution choice", async () => {
    partyFindMany.mockResolvedValue([]);
    createPartySpy.mockResolvedValue({ id: "cust_brand_new", name: "Brand New Person" });
    partyFindFirst.mockResolvedValue({ id: "cust_brand_new", name: "Brand New Person", notes: null });

    const input: ExecuteBantooInput = {
      action: "create_customer",
      draft: draft({ partyName: "Brand New Person", city: "Garoua" }),
      partyId: null,
      createParty: true,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
      // No duplicate prompt was ever shown for this request.
      duplicateResolution: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/customers/cust_brand_new");
      expect(result.number).toBe("Brand New Person");
    }
    expect(createPartySpy).toHaveBeenCalledTimes(1);
  });

  it("safety net still applies when createParty=true but duplicateResolution is omitted (e.g. an older/buggy client) — never silently creates an unreviewed near-duplicate", async () => {
    partyFindMany.mockResolvedValue([
      { id: "party_golu_garoua", name: "golu", type: "customer", phone: null, whatsapp: null },
    ]);

    const input: ExecuteBantooInput = {
      action: "create_customer",
      draft: draft({ partyName: "Golu Transport", city: "Ngoundéré" }),
      partyId: null,
      createParty: true,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
      // duplicateResolution intentionally omitted — falls back to the
      // pre-existing safe behavior (reuse on a HIGH-confidence match) rather
      // than ever assuming "create new" by default.
    };

    partyFindFirst.mockResolvedValue({ id: "party_golu_garoua", name: "golu", notes: null });

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(createPartySpy).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.href).toBe("/customers/party_golu_garoua");
    }
  });

  it("create_supplier's simple non-duplicate path is unaffected by the duplicateResolution plumbing (no dedup-choice UI exists for suppliers yet)", async () => {
    partyFindMany.mockResolvedValue([]);
    createPartySpy.mockResolvedValue({ id: "sup_brand_new", name: "New Supplier Co" });
    partyFindFirst.mockResolvedValue({ id: "sup_brand_new", name: "New Supplier Co", notes: null });

    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: draft({ partyName: "New Supplier Co", city: "Douala" }),
      partyId: null,
      createParty: true,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/suppliers/sup_brand_new");
      expect(result.number).toBe("New Supplier Co");
    }
    expect(createPartySpy).toHaveBeenCalledWith("org_A", {
      name: "New Supplier Co",
      type: "supplier",
      city: "Douala",
      phone: null,
      whatsapp: null,
      country: null,
    });
  });
});

describe("executeBantooAction — Customer Intelligence Sprint", () => {
  it("edit_customer: updates an in-org party and returns its profile link", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1" });
    updatePartySpy.mockResolvedValue({ id: "cust_1", name: "Musa Ibrahim" });

    const input: ExecuteBantooInput = {
      action: "edit_customer",
      draft: draft({ partyName: "Musa", newName: "Musa Ibrahim", phone: "690123456" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/customers/cust_1");
      expect(result.kind).toBe("edit_customer");
    }
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "cust_1", {
      name: "Musa Ibrahim",
      phone: "690123456",
      whatsapp: "",
      email: "",
      city: "",
    });
  });

  it("edit_customer: rejects a cross-org partyId", async () => {
    partyFindFirst.mockResolvedValue(null);

    const input: ExecuteBantooInput = {
      action: "edit_customer",
      draft: draft({ partyName: "Musa", phone: "690123456" }),
      partyId: "cust_other_org",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "That customer was not found." });
    expect(updatePartySpy).not.toHaveBeenCalled();
  });

  it("edit_customer: requires a resolved customer before saving", async () => {
    const input: ExecuteBantooInput = {
      action: "edit_customer",
      draft: draft({ partyName: "Musa", phone: "690123456" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Choose the customer to edit." });
    expect(updatePartySpy).not.toHaveBeenCalled();
  });

  it("view_customer: profile navigates straight to the customer page", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa" });

    const input: ExecuteBantooInput = {
      action: "view_customer",
      draft: draft({ view: "profile" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: true, href: "/customers/cust_1", number: "Musa", kind: "view_customer" });
  });

  it("view_customer: ledger and documents deep-link to the right tab", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa" });

    const ledger = await executeBantooAction({
      action: "view_customer",
      draft: draft({ view: "ledger" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(ledger).toMatchObject({ ok: true, href: "/customers/cust_1?tab=transactions" });

    const documents = await executeBantooAction({
      action: "view_customer",
      draft: draft({ view: "documents" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(documents).toMatchObject({ ok: true, href: "/customers/cust_1?tab=documents" });
  });

  it("view_customer: statement includes the resolved date range in the report link", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa" });

    const result = await executeBantooAction({
      action: "view_customer",
      draft: draft({ view: "statement", dateFrom: "2026-06-01", dateTo: "2026-06-30" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toMatchObject({
      ok: true,
      href: "/reports/customer-statement?partyId=cust_1&from=2026-06-01&to=2026-06-30",
    });
  });

  it("view_customer: list opens the customer list without resolving a party", async () => {
    const result = await executeBantooAction({
      action: "view_customer",
      draft: draft({ view: "list" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: true, href: "/customers", number: "", kind: "view_customer" });
    expect(partyFindFirst).not.toHaveBeenCalled();
  });

  it("view_customer: rejects a cross-org partyId", async () => {
    partyFindFirst.mockResolvedValue(null);
    const result = await executeBantooAction({
      action: "view_customer",
      draft: draft({ view: "profile" }),
      partyId: "cust_other_org",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: false, error: "That customer was not found." });
  });

  it("customer_balance: reports how much a customer owes, org-scoped", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa" });
    getPartyBalanceSpy.mockResolvedValue(25000n);

    const result = await executeBantooAction({
      action: "customer_balance",
      draft: draft(),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(getPartyBalanceSpy).toHaveBeenCalledWith("org_A", "cust_1", "customer");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("Musa");
      expect(result.message).toContain("25,000");
    }
  });

  it("customer_balance: reports no outstanding balance when zero", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa" });
    getPartyBalanceSpy.mockResolvedValue(0n);

    const result = await executeBantooAction({
      action: "customer_balance",
      draft: draft(),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toBe("Musa has no outstanding balance.");
  });

  it("add_customer_note: appends a dated note to any existing notes", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa", notes: "Existing note" });
    updatePartyNotesSpy.mockResolvedValue({ id: "cust_1" });

    const result = await executeBantooAction({
      action: "add_customer_note",
      draft: draft({ note: "prefers morning delivery" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result.ok).toBe(true);
    expect(updatePartyNotesSpy).toHaveBeenCalledWith(
      "org_A",
      "cust_1",
      expect.stringMatching(/^Existing note\n\[\d{4}-\d{2}-\d{2}\] prefers morning delivery$/),
    );
  });

  it("add_customer_note: rejects empty note text", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa", notes: null });
    const result = await executeBantooAction({
      action: "add_customer_note",
      draft: draft({ note: "  " }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: false, error: "Enter the note text." });
    expect(updatePartyNotesSpy).not.toHaveBeenCalled();
  });

  it("contact_customer: call produces a tel: link from the party's phone", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa", phone: "690123456", whatsapp: null, email: null });
    const result = await executeBantooAction({
      action: "contact_customer",
      draft: draft({ contactMethod: "call" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: true, href: "tel:690123456", number: "Musa", kind: "contact_customer" });
  });

  it("contact_customer: whatsapp produces a wa.me link with digits only", async () => {
    partyFindFirst.mockResolvedValue({
      id: "cust_1",
      name: "Musa",
      phone: null,
      whatsapp: "+237 690 12 34 56",
      email: null,
    });
    const result = await executeBantooAction({
      action: "contact_customer",
      draft: draft({ contactMethod: "whatsapp" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({
      ok: true,
      href: "https://wa.me/237690123456",
      number: "Musa",
      kind: "contact_customer",
    });
  });

  it("contact_customer: email without one on file asks to add it rather than inventing one", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa", phone: null, whatsapp: null, email: null });
    const result = await executeBantooAction({
      action: "contact_customer",
      draft: draft({ contactMethod: "email" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "This customer has no email on file. Add one first.",
    });
  });

  it("customer_query: answers with the customer's purchases in the resolved period", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa" });
    getPartyPurchaseHistoryInRangeSpy.mockResolvedValue({
      items: [{ name: "Rice 50kg", quantity: "10", unit: "bag" }],
      orderCount: 2,
    });

    const result = await executeBantooAction({
      action: "customer_query",
      draft: draft({ periodText: "last month", dateFrom: "2026-06-01", dateTo: "2026-06-30" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(getPartyPurchaseHistoryInRangeSpy).toHaveBeenCalledWith(
      "org_A",
      "cust_1",
      "customer",
      "2026-06-01",
      "2026-06-30",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("Musa");
      expect(result.message).toContain("Rice 50kg");
    }
  });

  it("customer_query: reports no purchases found instead of guessing", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_1", name: "Musa" });
    getPartyPurchaseHistoryInRangeSpy.mockResolvedValue({ items: [], orderCount: 0 });

    const result = await executeBantooAction({
      action: "customer_query",
      draft: draft({}),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toBe("No purchases found for Musa.");
  });

  it("unsupported_customer_action: never silently succeeds, always reports not-available", async () => {
    const result = await executeBantooAction({
      action: "unsupported_customer_action",
      draft: draft({ requestedAction: "archive" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: false, error: "This action is not available yet." });
  });
});

describe("executeBantooAction — Supplier & Purchasing Intelligence Sprint", () => {
  it("edit_supplier: updates an in-org party and returns its profile link", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1" });
    updatePartySpy.mockResolvedValue({ id: "sup_1", name: "Elhaji Adoum" });

    const input: ExecuteBantooInput = {
      action: "edit_supplier",
      draft: draft({ partyName: "Elhaji", newName: "Elhaji Adoum", phone: "690123456" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/suppliers/sup_1");
      expect(result.kind).toBe("edit_supplier");
    }
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "sup_1", {
      name: "Elhaji Adoum",
      phone: "690123456",
      whatsapp: "",
      email: "",
      city: "",
    });
  });

  it("edit_supplier: rejects a cross-org partyId", async () => {
    partyFindFirst.mockResolvedValue(null);

    const input: ExecuteBantooInput = {
      action: "edit_supplier",
      draft: draft({ partyName: "Elhaji", phone: "690123456" }),
      partyId: "sup_other_org",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "That supplier was not found." });
    expect(updatePartySpy).not.toHaveBeenCalled();
  });

  it("edit_supplier: requires a resolved supplier before saving", async () => {
    const input: ExecuteBantooInput = {
      action: "edit_supplier",
      draft: draft({ partyName: "Elhaji", phone: "690123456" }),
      partyId: null,
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Choose the supplier to edit." });
    expect(updatePartySpy).not.toHaveBeenCalled();
  });

  it("view_supplier: profile navigates straight to the supplier page", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji" });

    const input: ExecuteBantooInput = {
      action: "view_supplier",
      draft: draft({ view: "profile" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: true, href: "/suppliers/sup_1", number: "Elhaji", kind: "view_supplier" });
  });

  it("view_supplier: ledger and documents deep-link to the right tab", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji" });

    const ledger = await executeBantooAction({
      action: "view_supplier",
      draft: draft({ view: "ledger" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(ledger).toMatchObject({ ok: true, href: "/suppliers/sup_1?tab=transactions" });

    const documents = await executeBantooAction({
      action: "view_supplier",
      draft: draft({ view: "documents" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(documents).toMatchObject({ ok: true, href: "/suppliers/sup_1?tab=documents" });
  });

  it("view_supplier: list opens the supplier list without resolving a party", async () => {
    const result = await executeBantooAction({
      action: "view_supplier",
      draft: draft({ view: "list" }),
      partyId: null,
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: true, href: "/suppliers", number: "", kind: "view_supplier" });
    expect(partyFindFirst).not.toHaveBeenCalled();
  });

  it("view_supplier: rejects a cross-org partyId", async () => {
    partyFindFirst.mockResolvedValue(null);
    const result = await executeBantooAction({
      action: "view_supplier",
      draft: draft({ view: "profile" }),
      partyId: "sup_other_org",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: false, error: "That supplier was not found." });
  });

  it("supplier_balance: positive balance means the org owes the supplier", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji" });
    getPartyBalanceSpy.mockResolvedValue(25000n);

    const result = await executeBantooAction({
      action: "supplier_balance",
      draft: draft(),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(getPartyBalanceSpy).toHaveBeenCalledWith("org_A", "sup_1", "supplier");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("You owe Elhaji");
      expect(result.message).toContain("25,000");
    }
  });

  it("supplier_balance: negative balance means the supplier owes us a credit", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji" });
    getPartyBalanceSpy.mockResolvedValue(-5000n);

    const result = await executeBantooAction({
      action: "supplier_balance",
      draft: draft(),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("Elhaji has a credit balance of 5,000 XAF with you.");
    }
  });

  it("supplier_balance: reports no outstanding balance when zero", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji" });
    getPartyBalanceSpy.mockResolvedValue(0n);

    const result = await executeBantooAction({
      action: "supplier_balance",
      draft: draft(),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toBe("You have no outstanding balance with Elhaji.");
  });

  it("add_supplier_note: appends a dated note to any existing notes", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji", notes: "Existing note" });
    updatePartyNotesSpy.mockResolvedValue({ id: "sup_1" });

    const result = await executeBantooAction({
      action: "add_supplier_note",
      draft: draft({ note: "delivers on Tuesdays" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result.ok).toBe(true);
    expect(updatePartyNotesSpy).toHaveBeenCalledWith(
      "org_A",
      "sup_1",
      expect.stringMatching(/^Existing note\n\[\d{4}-\d{2}-\d{2}\] delivers on Tuesdays$/),
    );
  });

  it("add_supplier_note: rejects empty note text", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji", notes: null });
    const result = await executeBantooAction({
      action: "add_supplier_note",
      draft: draft({ note: "  " }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: false, error: "Enter the note text." });
    expect(updatePartyNotesSpy).not.toHaveBeenCalled();
  });

  it("contact_supplier: call produces a tel: link from the party's phone", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji", phone: "690123456", whatsapp: null, email: null });
    const result = await executeBantooAction({
      action: "contact_supplier",
      draft: draft({ contactMethod: "call" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: true, href: "tel:690123456", number: "Elhaji", kind: "contact_supplier" });
  });

  it("contact_supplier: whatsapp produces a wa.me link with digits only", async () => {
    partyFindFirst.mockResolvedValue({
      id: "sup_1",
      name: "Elhaji",
      phone: null,
      whatsapp: "+237 690 12 34 56",
      email: null,
    });
    const result = await executeBantooAction({
      action: "contact_supplier",
      draft: draft({ contactMethod: "whatsapp" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({
      ok: true,
      href: "https://wa.me/237690123456",
      number: "Elhaji",
      kind: "contact_supplier",
    });
  });

  it("contact_supplier: email without one on file asks to add it rather than inventing one", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji", phone: null, whatsapp: null, email: null });
    const result = await executeBantooAction({
      action: "contact_supplier",
      draft: draft({ contactMethod: "email" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "This supplier has no email on file. Add one first.",
    });
  });

  it("supplier_query: answers with what was bought from the supplier in the resolved period", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji" });
    getPartyPurchaseHistoryInRangeSpy.mockResolvedValue({
      items: [{ name: "Rice 50kg", quantity: "10", unit: "bag" }],
      orderCount: 2,
    });

    const result = await executeBantooAction({
      action: "supplier_query",
      draft: draft({ periodText: "last month", dateFrom: "2026-06-01", dateTo: "2026-06-30" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(getPartyPurchaseHistoryInRangeSpy).toHaveBeenCalledWith(
      "org_A",
      "sup_1",
      "supplier",
      "2026-06-01",
      "2026-06-30",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("Elhaji");
      expect(result.message).toContain("Rice 50kg");
    }
  });

  it("supplier_query: reports no purchases found instead of guessing", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_1", name: "Elhaji" });
    getPartyPurchaseHistoryInRangeSpy.mockResolvedValue({ items: [], orderCount: 0 });

    const result = await executeBantooAction({
      action: "supplier_query",
      draft: draft({}),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toBe("No purchases found from Elhaji.");
  });

  it("unsupported_supplier_action: never silently succeeds, always reports not-available", async () => {
    const result = await executeBantooAction({
      action: "unsupported_supplier_action",
      draft: draft({ requestedAction: "archive" }),
      partyId: "sup_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: false, error: "This action is not available yet." });
  });
});

describe("executeBantooAction — Sales Intelligence Sprint", () => {
  it("sales_invoice: posts a credit sale with the resolved customer, income account, and due date", async () => {
    createSalesInvoice.mockResolvedValue({ id: "inv_1", number: "INV-0001" });

    const input: ExecuteBantooInput = {
      action: "sales_invoice",
      draft: draft({
        amount: "50000",
        description: "Rice delivery",
        partyName: "Musa",
        dueDate: "2026-08-15",
      }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_income",
    };
    accountFindFirst.mockResolvedValue({ id: "acct_income" });
    partyFindFirst.mockResolvedValue({ id: "cust_1" });

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/sales-invoices/inv_1");
      expect(result.number).toBe("INV-0001");
      expect(result.kind).toBe("sales_invoice");
    }
    expect(createSalesInvoice).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({
        partyId: "cust_1",
        dueDate: expect.any(Date),
        lines: [
          expect.objectContaining({
            description: "Rice delivery",
            unitPrice: 50000n,
            accountId: "acct_income",
          }),
        ],
      }),
    );
  });

  it("sales_invoice: posts the real quantity/unitPrice as the line, not the hardcoded quantity-1-at-amount fallback (production bug repro)", async () => {
    createSalesInvoice.mockResolvedValue({ id: "inv_2", number: "INV-0002" });

    const input: ExecuteBantooInput = {
      action: "sales_invoice",
      draft: draft({
        amount: String(2560 * 7000),
        quantity: "2560",
        unitPrice: "7000",
        description: "Rice",
        partyName: "Baffoussam",
      }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_income",
    };
    accountFindFirst.mockResolvedValue({ id: "acct_income" });
    partyFindFirst.mockResolvedValue({ id: "cust_1" });

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(createSalesInvoice).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            quantity: "2560",
            unitPrice: 7000n,
            accountId: "acct_income",
          }),
        ],
      }),
    );
  });

  it("sales_invoice: rejects a zero/blank amount rather than posting a zero-value invoice", async () => {
    const input: ExecuteBantooInput = {
      action: "sales_invoice",
      draft: draft({ amount: "", partyName: "Musa" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_income",
    };
    accountFindFirst.mockResolvedValue({ id: "acct_income" });

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Enter the sale amount." });
    expect(createSalesInvoice).not.toHaveBeenCalled();
  });

  it("sales_invoice: rejects a cross-org income account", async () => {
    accountFindFirst.mockResolvedValue(null);

    const input: ExecuteBantooInput = {
      action: "sales_invoice",
      draft: draft({ amount: "50000", partyName: "Musa" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_other_org",
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "That account was not found." });
    expect(createSalesInvoice).not.toHaveBeenCalled();
  });

  it("credit_note: posts a credit note for the resolved customer", async () => {
    createCreditNote.mockResolvedValue({ id: "cn_1", number: "CN-0001" });
    accountFindFirst.mockResolvedValue({ id: "acct_income" });
    partyFindFirst.mockResolvedValue({ id: "cust_1" });

    const input: ExecuteBantooInput = {
      action: "credit_note",
      draft: draft({ amount: "5000", description: "Returned goods", partyName: "Musa" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_income",
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/credit-notes/cn_1");
      expect(result.number).toBe("CN-0001");
      expect(result.kind).toBe("credit_note");
    }
    expect(createCreditNote).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({
        partyId: "cust_1",
        lines: [expect.objectContaining({ unitPrice: 5000n, accountId: "acct_income" })],
      }),
    );
  });

  it("credit_note: requires a resolved customer before saving", async () => {
    accountFindFirst.mockResolvedValue({ id: "acct_income" });

    const input: ExecuteBantooInput = {
      action: "credit_note",
      draft: draft({ amount: "5000", partyName: "" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_income",
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Choose the customer to credit." });
    expect(createCreditNote).not.toHaveBeenCalled();
  });

  it("refund_receipt: posts a cash refund with no customer attached (walk-in refund)", async () => {
    createRefundReceipt.mockResolvedValue({ id: "rr_1", number: "RR-0001" });
    accountFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "acct_bank" ? { id: "acct_bank" } : { id: "acct_income" },
    );

    const input: ExecuteBantooInput = {
      action: "refund_receipt",
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
    if (result.ok) {
      expect(result.href).toBe("/refund-receipts/rr_1");
      expect(result.kind).toBe("refund_receipt");
    }
    expect(createRefundReceipt).toHaveBeenCalledWith(
      "org_A",
      expect.objectContaining({ bankAccountId: "acct_bank", partyId: null }),
    );
  });

  it("refund_receipt: rejects when no bank/cash account is chosen", async () => {
    const input: ExecuteBantooInput = {
      action: "refund_receipt",
      draft: draft({ amount: "5000" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: "acct_income",
    };

    const result = await executeBantooAction(input);
    expect(result).toEqual({ ok: false, error: "Choose a bank or cash account." });
    expect(createRefundReceipt).not.toHaveBeenCalled();
  });

  it("view_sales_invoice: opens the sales invoice list without resolving a party", async () => {
    const result = await executeBantooAction({
      action: "view_sales_invoice",
      draft: draft({ view: "list" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: true, href: "/sales-invoices", number: "", kind: "view_sales_invoice" });
    expect(partyFindFirst).not.toHaveBeenCalled();
  });

  it("unsupported_sales_action: never silently succeeds, always reports not-available", async () => {
    const result = await executeBantooAction({
      action: "unsupported_sales_action",
      draft: draft({ requestedAction: "edit" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    });
    expect(result).toEqual({ ok: false, error: "This action is not available yet." });
    expect(createSalesInvoice).not.toHaveBeenCalled();
    expect(createCreditNote).not.toHaveBeenCalled();
    expect(createRefundReceipt).not.toHaveBeenCalled();
  });
});
