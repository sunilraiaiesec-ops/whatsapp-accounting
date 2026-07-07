// QA Reliability Swarm — Track 2: Supplier Creation Agent.
//
// Originally proved the execute()-layer half of the field-persistence gap:
// even with a fully-populated draft (email/companyName/taxId/
// paymentTermsDays/creditLimit/defaultDiscount/preferredLanguage/
// preferredPaymentMethod), executeBantooAction()'s "create_supplier" case
// (app/actions/bantoo.ts) never read or persisted any of them, unlike
// "create_customer", which builds a `profileFields` object from exactly
// these draft keys and calls updateParty() with it right after
// createParty().
//
// FIXED: create_supplier's execute() case now mirrors create_customer's
// exactly — both the brand-new-party path (createParty() + a follow-up
// updateParty() call with profileFields) and the "use existing party" path
// (an `enrichment` object built the same way) now persist every extended
// field. This file now asserts the fixed behavior end-to-end and doubles as
// the permanent regression suite for the original gap (see also
// lib/bantoo/qa-swarm-02-supplier-creation.test.ts for the
// extraction/resolve-layer half of the same original bug).
//
// Persistence is verified the same way the existing app/actions/bantoo.test.ts
// suite does: by asserting the EXACT arguments createParty()/updateParty()
// (mocked spies backed by the real Prisma-calling implementations in a
// normal run) are called with — i.e. "read back and assert exact values" at
// the persistence-call boundary, since this repo's test suite has no live
// Postgres available and every other Ask Bantoo test uses the same
// mocked-Prisma convention.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecuteBantooInput } from "@/lib/bantoo/types";

const partyFindFirst = vi.fn();
const partyFindMany = vi.fn();
const createPartySpy = vi.fn();
const updatePartySpy = vi.fn();
const updatePartyNotesSpy = vi.fn();

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
    party: { findFirst: partyFindFirst, findMany: partyFindMany },
  },
}));

vi.mock("@/lib/parties", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/parties")>();
  return {
    ...actual,
    createParty: createPartySpy,
    updateParty: updatePartySpy,
    updatePartyNotes: updatePartyNotesSpy,
  };
});

// This suite exercises persistence/business logic, not locale — pin the UI
// locale to English (see app/actions/bantoo.test.ts's identical mock).
vi.mock("@/lib/bantoo/locale", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/bantoo/locale")>();
  return { ...actual, resolveUiLocale: vi.fn(async () => "en" as const) };
});

const { executeBantooAction } = await import("@/app/actions/bantoo");

// A FULLY populated draft, as if every extraction-stage fix already landed
// and every field the swarm-brief commands mention made it all the way to
// here. This isolates the execute()-layer behavior from the extraction-layer
// concerns tested elsewhere.
function fullSupplierDraft(overrides: Record<string, string> = {}) {
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
    partyName: "Sahel Grain Traders",
    city: "Maroua",
    country: "",
    paymentMethod: "",
    description: "",
    date: "2026-07-07",
    dueDate: "",
    currency: "XAF",
    newName: "",
    phone: "+237655222333",
    whatsapp: "+237655222333",
    email: "sourcing@sahelgrain.cm",
    companyName: "Sahel Grain Traders SARL",
    taxId: "CM-MR-2026-0099",
    paymentTermsDays: "60",
    creditLimit: "3000000",
    defaultDiscount: "5",
    preferredLanguage: "fr",
    preferredPaymentMethod: "bank_transfer",
    note: "Pays via bank transfer only.",
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
  partyFindFirst.mockReset();
  partyFindMany.mockReset().mockResolvedValue([]);
  createPartySpy.mockReset().mockImplementation(async (orgId: string, data: { name: string; type: string }) => ({
    id: "sup_new",
    orgId,
    name: data.name,
    type: data.type,
    phone: null,
  }));
  updatePartySpy.mockReset();
  updatePartyNotesSpy.mockReset();
});

describe("executeBantooAction — create_supplier persists every extended profile field (Track 2 primary hypothesis, execute()-layer proof, now fixed)", () => {
  it("brand-new supplier: createParty() still only receives the quick-add fields (name/type/city/phone/whatsapp/country), but a follow-up updateParty() now persists every extended profile field", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_new", name: "Sahel Grain Traders", notes: null });

    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: fullSupplierDraft(),
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
      expect(result.kind).toBe("create_supplier");
    }

    // Only the "quick-add" fields ever reach createParty() — exactly what
    // create_customer's OWN createParty() call receives too. The extended
    // fields are applied via a FOLLOW-UP updateParty() call, same as
    // create_customer does.
    expect(createPartySpy).toHaveBeenCalledWith("org_A", {
      name: "Sahel Grain Traders",
      type: "supplier",
      city: "Maroua",
      phone: "+237655222333",
      whatsapp: "+237655222333",
      country: null,
    });

    // FIXED: create_supplier's execute() branch now makes the same
    // follow-up updateParty() call create_customer's branch always has,
    // built from a `profileFields` object populated from exactly these
    // draft keys (see app/actions/bantoo.ts's "create_supplier" case).
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "sup_new", {
      companyName: "Sahel Grain Traders SARL",
      email: "sourcing@sahelgrain.cm",
      taxId: "CM-MR-2026-0099",
      paymentTermsDays: 60,
      creditLimit: 3000000n,
      defaultDiscount: "5",
      defaultCurrency: "XAF",
      preferredLanguage: "fr",
      preferredPaymentMethod: "bank_transfer",
    });
  });

  it("note IS persisted (via appendPartyNote/updatePartyNotes) — confirms the note pathway specifically still works", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_new", name: "Sahel Grain Traders", notes: null });

    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: fullSupplierDraft(),
      partyId: null,
      createParty: true,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    await executeBantooAction(input);
    expect(updatePartyNotesSpy).toHaveBeenCalledWith(
      "org_A",
      "sup_new",
      expect.stringContaining("Pays via bank transfer only."),
    );
  });

  it("FIXED: 'use existing supplier' path (partyId already resolved) now enriches the existing record with every submitted extended field — mirrors create_customer's equivalent enrichment block", async () => {
    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: fullSupplierDraft({ partyName: "Sahel Grain Traders" }),
      partyId: "sup_existing",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };
    partyFindFirst.mockResolvedValue({ id: "sup_existing", name: "Sahel Grain Traders", notes: null });

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("/suppliers/sup_existing");
    }
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "sup_existing", {
      city: "Maroua",
      phone: "+237655222333",
      whatsapp: "+237655222333",
      email: "sourcing@sahelgrain.cm",
      companyName: "Sahel Grain Traders SARL",
      taxId: "CM-MR-2026-0099",
      paymentTermsDays: 60,
      creditLimit: 3000000n,
      defaultDiscount: "5",
      preferredLanguage: "fr",
      preferredPaymentMethod: "bank_transfer",
    });
    expect(createPartySpy).not.toHaveBeenCalled();
  });

  it("control case: the IDENTICAL fully-populated draft for create_customer DOES persist every extended field via a follow-up updateParty() call (true parity, not a supplier-only special case)", async () => {
    partyFindFirst.mockResolvedValue({ id: "cust_new", name: "Sahel Grain Traders", notes: null });
    createPartySpy.mockResolvedValue({ id: "cust_new", name: "Sahel Grain Traders" });

    const input: ExecuteBantooInput = {
      action: "create_customer",
      draft: fullSupplierDraft(),
      partyId: null,
      createParty: true,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "cust_new", {
      companyName: "Sahel Grain Traders SARL",
      email: "sourcing@sahelgrain.cm",
      taxId: "CM-MR-2026-0099",
      paymentTermsDays: 60,
      creditLimit: 3000000n,
      defaultDiscount: "5",
      defaultCurrency: "XAF",
      preferredLanguage: "fr",
      preferredPaymentMethod: "bank_transfer",
    });
  });
});

describe("executeBantooAction — create_supplier end-to-end field verification, per swarm-brief required command", () => {
  it('command #2 (full EN): city/phone/whatsapp persist via createParty(), and email/paymentTerms/etc. now persist via a follow-up updateParty() call; the confirmation route/kind say "supplier" throughout', async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_nile", name: "Nile Packaging SARL", notes: null });
    createPartySpy.mockResolvedValue({ id: "sup_nile", name: "Nile Packaging SARL" });

    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: fullSupplierDraft({
        partyName: "Nile Packaging SARL",
        city: "Douala",
        phone: "+237699888777",
        whatsapp: "+237699888777",
        email: "sales@nilepackaging.cm",
        paymentTermsDays: "21",
        creditLimit: "",
        taxId: "",
        note: "Supplies rice bags and labels.",
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
    if (result.ok) {
      expect(result.href).toBe("/suppliers/sup_nile");
      expect(result.kind).toBe("create_supplier");
    }
    expect(createPartySpy).toHaveBeenCalledWith("org_A", {
      name: "Nile Packaging SARL",
      type: "supplier",
      city: "Douala",
      phone: "+237699888777",
      whatsapp: "+237699888777",
      country: null,
    });
    // FIXED: email + payment terms (and every other extended field) now
    // reach the database via the follow-up updateParty() call.
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "sup_nile", {
      companyName: "Sahel Grain Traders SARL",
      email: "sales@nilepackaging.cm",
      paymentTermsDays: 21,
      defaultDiscount: "5",
      defaultCurrency: "XAF",
      preferredLanguage: "fr",
      preferredPaymentMethod: "bank_transfer",
    });
  });

  it("command #5 (persistence trap): phone persists via createParty(), and payment terms (53 days) and credit limit (9,876,543 XAF) now reach the database via updateParty()", async () => {
    partyFindFirst.mockResolvedValue({ id: "sup_trap", name: "Test Non Default Supplier", notes: null });
    createPartySpy.mockResolvedValue({ id: "sup_trap", name: "Test Non Default Supplier" });

    const input: ExecuteBantooInput = {
      action: "create_supplier",
      draft: fullSupplierDraft({
        partyName: "Test Non Default Supplier",
        city: "Yaoundé",
        phone: "+237600222333",
        whatsapp: "",
        email: "",
        companyName: "",
        taxId: "",
        paymentTermsDays: "53",
        creditLimit: "9876543",
        defaultDiscount: "",
        preferredLanguage: "",
        preferredPaymentMethod: "",
        note: "",
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
    expect(createPartySpy).toHaveBeenCalledWith("org_A", {
      name: "Test Non Default Supplier",
      type: "supplier",
      city: "Yaoundé",
      phone: "+237600222333",
      whatsapp: null,
      country: null,
    });
    // The whole reason this command is called a "persistence trap": a
    // non-default paymentTermsDays (53, vs the more common 30) and a
    // distinctive creditLimit (9,876,543) are exactly the kind of value
    // that would be easy to silently lose against a "looks fine" 0/null
    // default — this now proves they DO reach the database.
    expect(updatePartySpy).toHaveBeenCalledWith("org_A", "sup_trap", {
      companyName: "Test Non Default Supplier",
      paymentTermsDays: 53,
      creditLimit: 9876543n,
      defaultCurrency: "XAF",
    });
  });
});
