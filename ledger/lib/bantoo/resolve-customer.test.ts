import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractedAction } from "@/lib/ai/actions";
import type { CurrentContext } from "@/lib/auth/current";

const listInventoryItems = vi.fn();
const loadEntityCandidates = vi.fn();
const bankAndCashAccounts = vi.fn();
const getCommandPatternSuggestions = vi.fn();
const getPartyContact = vi.fn();

vi.mock("@/lib/inventory", () => ({
  listInventoryItems: (...args: unknown[]) => listInventoryItems(...args),
}));

vi.mock("@/lib/bantoo/entities", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/bantoo/entities")>();
  return {
    ...actual,
    loadEntityCandidates: (...args: unknown[]) => loadEntityCandidates(...args),
  };
});

vi.mock("@/lib/accounts", () => ({
  bankAndCashAccounts: (...args: unknown[]) => bankAndCashAccounts(...args),
  paymentCounterpartAccounts: vi.fn().mockResolvedValue([]),
  receiptCounterpartAccounts: vi.fn().mockResolvedValue([]),
  receivableAccount: vi.fn(),
}));

vi.mock("@/lib/command-patterns", () => ({
  getCommandPatternSuggestions: (...args: unknown[]) => getCommandPatternSuggestions(...args),
  dueDateFromTerms: vi.fn(),
}));

vi.mock("@/lib/parties", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/parties")>();
  return {
    ...actual,
    getPartyContact: (...args: unknown[]) => getPartyContact(...args),
  };
});

const { resolveExtraction } = await import("@/lib/bantoo/resolve");

const ctx: CurrentContext = {
  orgId: "org_A",
  userId: "user_1",
  baseCurrency: "XAF",
  userName: "Test User",
  userEmail: "test@example.com",
  orgName: "Test Org",
  role: "owner",
  emailVerified: true,
  approvalWorkflowEnabled: false,
};

const MUSA = { id: "party_musa", label: "Musa", text: "Musa" };

function baseFields() {
  return { confidence: 0.9, summary: null, currency: "XAF" } as const;
}

beforeEach(() => {
  listInventoryItems.mockReset().mockResolvedValue([]);
  loadEntityCandidates.mockReset().mockResolvedValue([]);
  bankAndCashAccounts.mockReset().mockResolvedValue([]);
  getCommandPatternSuggestions.mockReset().mockResolvedValue({});
  getPartyContact.mockReset().mockResolvedValue(null);
});

describe("resolveExtraction — Customer Intelligence Sprint", () => {
  it("edit_customer: resolves the party and pre-fills contact fields from the org (never cross-org)", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    getPartyContact.mockResolvedValue({
      id: "party_musa",
      name: "Musa",
      phone: "690000000",
      whatsapp: null,
      email: "musa@example.com",
      city: "Maroua",
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "edit_customer",
      customer_name: "Musa",
      new_name: null,
      city: null,
      phone: "690123456",
      whatsapp: null,
      email: null,
      note: null,
      post_action: null,
      unsupported_requests: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);

    expect(loadEntityCandidates).toHaveBeenCalledWith(ctx, "customer");
    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.createParty).toBe(false);
    // Explicit phone from the command overrides the pre-filled current value.
    expect(proposal.draft.phone).toBe("690123456");
    // Untouched fields fall back to the party's current values.
    expect(proposal.draft.email).toBe("musa@example.com");
    expect(proposal.draft.city).toBe("Maroua");
    expect(proposal.warnings.some((w) => w.code === "noChangesToSave")).toBe(false);
  });

  it("edit_customer: warns noChangesToSave when nothing new was said", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    getPartyContact.mockResolvedValue({
      id: "party_musa",
      name: "Musa",
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "edit_customer",
      customer_name: "Musa",
      new_name: null,
      city: null,
      phone: null,
      whatsapp: null,
      email: null,
      note: null,
      post_action: null,
      unsupported_requests: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "noChangesToSave")).toBe(true);
  });

  it("edit_customer: unknown customer name -> customerNotFound, never 'not sure'", async () => {
    loadEntityCandidates.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "edit_customer",
      customer_name: "Zzqx Unknown",
      new_name: null,
      city: null,
      phone: null,
      whatsapp: null,
      email: null,
      note: null,
      post_action: null,
      unsupported_requests: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.warnings.some((w) => w.code === "customerNotFound" && w.params?.name === "Zzqx Unknown")).toBe(
      true,
    );
    expect(proposal.warnings.some((w) => w.code === "lowConfidence")).toBe(false);
  });

  it("edit_customer: ambiguous matches -> customerAmbiguous with multiple options", async () => {
    // A typo'd query ("Musah") that fuzzy-matches two different customers
    // equally well (both land in the "medium" bucket) — neither is a
    // confident auto-select, so this must surface as ambiguous rather than
    // guessing which "Musa" the user meant.
    loadEntityCandidates.mockResolvedValue([
      { id: "p1", label: "Musa Ibrahim", text: "Musa Ibrahim" },
      { id: "p2", label: "Musa Adamou", text: "Musa Adamou" },
    ]);
    const action: ExtractedAction = {
      action: "edit_customer",
      customer_name: "Musah",
      new_name: null,
      city: null,
      phone: null,
      whatsapp: null,
      email: null,
      note: null,
      post_action: null,
      unsupported_requests: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.partyOptions.length).toBeGreaterThan(1);
    expect(proposal.warnings.some((w) => w.code === "customerAmbiguous")).toBe(true);
  });

  it("view_customer: profile resolves a deep link target via partyId, not a guess", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "view_customer",
      customer_name: "Musa",
      view: "profile",
      period_text: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.draft.view).toBe("profile");
  });

  it("view_customer: list view never requires a party (bare 'search customers')", async () => {
    const action: ExtractedAction = {
      action: "view_customer",
      customer_name: null,
      view: "list",
      period_text: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.draft.view).toBe("list");
    expect(loadEntityCandidates).not.toHaveBeenCalled();
    expect(proposal.warnings.some((w) => w.code === "enterCustomerName")).toBe(false);
  });

  it("view_customer: statement resolves the period into a concrete date range", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "view_customer",
      customer_name: "Musa",
      view: "statement",
      period_text: "June",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.dateFrom).toBeTruthy();
    expect(proposal.draft.dateTo).toBeTruthy();
    expect(proposal.draft.periodText).toBe("June");
  });

  it("customer_balance: resolves the party for a balance lookup", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "customer_balance",
      customer_name: "Musa",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.partyType).toBe("customer");
  });

  it("add_customer_note: warns when the note text is empty", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "add_customer_note",
      customer_name: "Musa",
      note: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "enterNoteText")).toBe(true);
  });

  it("add_customer_note: carries the note text through to the draft when present", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "add_customer_note",
      customer_name: "Musa",
      note: "prefers morning delivery",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.note).toBe("prefers morning delivery");
    expect(proposal.warnings.some((w) => w.code === "enterNoteText")).toBe(false);
  });

  it("contact_customer: call — missing phone warns missingPhone and never invents a number", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    getPartyContact.mockResolvedValue({
      id: "party_musa",
      name: "Musa",
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "contact_customer",
      customer_name: "Musa",
      method: "call",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.phone).toBe("");
    expect(proposal.warnings.some((w) => w.code === "missingPhone")).toBe(true);
  });

  it("contact_customer: whatsapp — present number surfaces cleanly with no warning", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    getPartyContact.mockResolvedValue({
      id: "party_musa",
      name: "Musa",
      phone: null,
      whatsapp: "690123456",
      email: null,
      city: null,
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "contact_customer",
      customer_name: "Musa",
      method: "whatsapp",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.whatsapp).toBe("690123456");
    expect(proposal.warnings.some((w) => w.code === "missingWhatsapp")).toBe(false);
  });

  it("contact_customer: email — missing email warns missingEmail", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    getPartyContact.mockResolvedValue({
      id: "party_musa",
      name: "Musa",
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "contact_customer",
      customer_name: "Musa",
      method: "email",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "missingEmail")).toBe(true);
  });

  it("customer_query: resolves a period-scoped question about a specific customer", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "customer_query",
      customer_name: "Musa",
      question: "what did Musa buy last month",
      period_text: "last month",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.draft.dateFrom).toBeTruthy();
    expect(proposal.draft.dateTo).toBeTruthy();
  });

  it("unsupported_customer_action: archive/reactivate/merge/upload never say 'not sure' and always warn notYetAvailable", async () => {
    for (const requested of ["archive", "reactivate", "merge", "upload_document"] as const) {
      const action: ExtractedAction = {
        action: "unsupported_customer_action",
        customer_name: "Musa",
        requested,
        ...baseFields(),
      };
      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.warnings.some((w) => w.code === "notYetAvailable")).toBe(true);
      expect(proposal.warnings.some((w) => w.code === "lowConfidence")).toBe(false);
      expect(proposal.action).toBe("unsupported_customer_action");
    }
  });

  // --- Safety fix: silent customer identity merging (create_customer) ------
  describe("create_customer: possible-duplicate safety fix", () => {
    it("exact match, no conflicting details -> safe to auto-associate, no duplicate warning", async () => {
      loadEntityCandidates.mockResolvedValue([{ id: "party_elhaji", label: "Elhaji Adamou", text: "Elhaji Adamou" }]);
      getPartyContact.mockResolvedValue({
        id: "party_elhaji",
        name: "Elhaji Adamou",
        phone: null,
        whatsapp: null,
        email: null,
        city: null,
        country: null,
        notes: null,
      });

      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Elhaji Adamou",
        city: null,
        phone: null,
        whatsapp: null,
        country: null,
        note: null,
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: null,
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.partyId).toBe("party_elhaji");
      expect(proposal.createParty).toBe(false);
      expect(proposal.duplicateCandidate).toBeNull();
      expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(false);
    });

    it("match found but new request has a different city than the existing record -> requires disambiguation", async () => {
      loadEntityCandidates.mockResolvedValue([{ id: "party_elhaji", label: "Elhaji Adamou", text: "Elhaji Adamou" }]);
      getPartyContact.mockResolvedValue({
        id: "party_elhaji",
        name: "Elhaji Adamou",
        phone: null,
        whatsapp: null,
        email: null,
        city: "Douala",
        country: null,
        notes: null,
      });

      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Elhaji Adamou",
        city: "Garoua",
        phone: null,
        whatsapp: null,
        country: null,
        note: null,
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: null,
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      // Never silently reused or overwritten — the client must choose.
      expect(proposal.partyId).toBeNull();
      expect(proposal.createParty).toBe(false);
      expect(proposal.duplicateCandidate).toEqual({
        id: "party_elhaji",
        name: "Elhaji Adamou",
        city: "Douala",
        phone: null,
        whatsapp: null,
        country: null,
      });
      expect(
        proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer" && w.params?.name === "Elhaji Adamou"),
      ).toBe(true);
      // The new (conflicting) city is still shown in the editable draft for
      // review, but is NOT what's stored against the existing party's id —
      // partyId stays null until the user explicitly chooses.
      expect(proposal.draft.city).toBe("Garoua");
    });

    it("match found but new request has a different phone than the existing record -> requires disambiguation", async () => {
      loadEntityCandidates.mockResolvedValue([{ id: "party_elhaji", label: "Elhaji Adamou", text: "Elhaji Adamou" }]);
      getPartyContact.mockResolvedValue({
        id: "party_elhaji",
        name: "Elhaji Adamou",
        phone: "699000000",
        whatsapp: null,
        email: null,
        city: null,
        country: null,
        notes: null,
      });

      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Elhaji Adamou",
        city: null,
        phone: "690123456",
        whatsapp: null,
        country: null,
        note: null,
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: null,
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.partyId).toBeNull();
      expect(proposal.duplicateCandidate?.phone).toBe("699000000");
      expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(true);
    });

    it("no match -> proceeds as a genuinely new customer, no duplicate warning", async () => {
      loadEntityCandidates.mockResolvedValue([]);
      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Brand New Person",
        city: "Garoua",
        phone: "690123456",
        whatsapp: null,
        country: null,
        note: null,
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: null,
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.partyId).toBeNull();
      expect(proposal.createParty).toBe(true);
      expect(proposal.duplicateCandidate).toBeNull();
      expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(false);
      expect(getPartyContact).not.toHaveBeenCalled();
    });

    it("never overwrites the existing customer's stored details when a conflict is detected", async () => {
      loadEntityCandidates.mockResolvedValue([{ id: "party_elhaji", label: "Elhaji Adamou", text: "Elhaji Adamou" }]);
      const existing = {
        id: "party_elhaji",
        name: "Elhaji Adamou",
        phone: "699000000",
        whatsapp: "699000000",
        email: null,
        city: "Douala",
        country: null,
        notes: null,
      };
      getPartyContact.mockResolvedValue(existing);

      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Elhaji Adamou",
        city: "Garoua",
        phone: "690123456",
        whatsapp: "690123456",
        country: null,
        note: null,
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: null,
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      // The existing record's own details are surfaced unchanged for
      // comparison — proving nothing was merged/overwritten server-side.
      expect(proposal.duplicateCandidate).toEqual({
        id: existing.id,
        name: existing.name,
        city: existing.city,
        phone: existing.phone,
        whatsapp: existing.whatsapp,
        country: existing.country,
      });
      expect(proposal.partyId).toBeNull();
    });
  });

  // --- Multi-step Task Planning: plan checklist -----------------------------
  describe("create_customer / edit_customer: plan checklist", () => {
    it("simple 'add Musa as a customer' -> plan has just [createCustomer]", async () => {
      loadEntityCandidates.mockResolvedValue([]);
      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Musa",
        city: null,
        phone: null,
        whatsapp: null,
        country: null,
        note: null,
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: null,
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.plan).toEqual([
        { code: "createCustomer", status: "ready", params: { name: "Musa" } },
      ]);
    });

    it("'add Musa as a customer in Garoua' -> plan has [createCustomer, setCity]", async () => {
      loadEntityCandidates.mockResolvedValue([]);
      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Musa",
        city: "Garoua",
        phone: null,
        whatsapp: null,
        country: null,
        note: null,
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: null,
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.plan).toEqual([
        { code: "createCustomer", status: "ready", params: { name: "Musa" } },
        { code: "setCity", status: "ready", params: { value: "Garoua" } },
      ]);
    });

    it("Elhaji Adamou example: compound request populates every field AND the full plan (not just the name)", async () => {
      loadEntityCandidates.mockResolvedValue([]);
      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Elhaji Adamou",
        city: "Garoua",
        phone: "690123456",
        whatsapp: "690123456",
        country: null,
        note: "He usually pays every Friday after Jummah",
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: "open_profile",
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.draft.city).toBe("Garoua");
      expect(proposal.draft.phone).toBe("690123456");
      expect(proposal.draft.whatsapp).toBe("690123456");
      expect(proposal.draft.note).toBe("He usually pays every Friday after Jummah");
      expect(proposal.draft.postAction).toBe("open_profile");
      expect(proposal.plan).toEqual([
        { code: "createCustomer", status: "ready", params: { name: "Elhaji Adamou" } },
        { code: "setCity", status: "ready", params: { value: "Garoua" } },
        { code: "setPhone", status: "ready", params: { value: "690123456" } },
        { code: "setWhatsapp", status: "ready", params: { value: "690123456" } },
        { code: "setNote", status: "ready", params: { value: "He usually pays every Friday after Jummah" } },
        { code: "openProfile", status: "ready" },
      ]);
    });

    it("a trailing unsupported request is shown as an unavailable plan step, never crashes or blocks supported steps", async () => {
      loadEntityCandidates.mockResolvedValue([]);
      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Musa",
        city: null,
        phone: null,
        whatsapp: null,
        country: null,
        note: null,
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: null,
        unsupported_requests: ["then invoice him for 25 bags of rice", "then email the invoice"],
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.plan[0]).toEqual({ code: "createCustomer", status: "ready", params: { name: "Musa" } });
      expect(proposal.plan.slice(1)).toEqual([
        { code: "unsupportedStep", status: "unavailable", params: { request: "then invoice him for 25 bags of rice" } },
        { code: "unsupportedStep", status: "unavailable", params: { request: "then email the invoice" } },
      ]);
      // The supported step is still fully executable — createParty stays true.
      expect(proposal.createParty).toBe(true);
    });

    it("combined with the safety fix: a compound multi-field request still requires disambiguation when it conflicts with an existing customer", async () => {
      loadEntityCandidates.mockResolvedValue([{ id: "party_elhaji", label: "Elhaji Adamou", text: "Elhaji Adamou" }]);
      getPartyContact.mockResolvedValue({
        id: "party_elhaji",
        name: "Elhaji Adamou",
        phone: null,
        whatsapp: null,
        email: null,
        city: "Douala",
        country: null,
        notes: null,
      });

      const action: ExtractedAction = {
        action: "create_customer",
        customer_name: "Elhaji Adamou",
        city: "Garoua",
        phone: "690123456",
        whatsapp: "690123456",
        country: null,
        note: "Pays every Friday",
        email: null,
        company_name: null,
        tax_id: null,
        payment_terms_days: null,
        credit_limit: null,
        default_discount: null,
        preferred_language: null,
        preferred_payment_method: null,
        post_action: "open_profile",
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.partyId).toBeNull();
      expect(proposal.duplicateCandidate?.id).toBe("party_elhaji");
      expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(true);
      // The plan is still built in full — disambiguation gates Confirm & Save
      // client-side, it doesn't hide what will happen once resolved.
      expect(proposal.plan.map((s) => s.code)).toEqual([
        "createCustomer",
        "setCity",
        "setPhone",
        "setWhatsapp",
        "setNote",
        "openProfile",
      ]);
    });

    it("edit_customer: plan reflects only the fields actually requested to change, not values merely pre-filled from the current record", async () => {
      loadEntityCandidates.mockResolvedValue([MUSA]);
      getPartyContact.mockResolvedValue({
        id: "party_musa",
        name: "Musa",
        phone: "690000000",
        whatsapp: "690000000",
        email: "musa@example.com",
        city: "Maroua",
        country: null,
        notes: null,
      });

      const action: ExtractedAction = {
        action: "edit_customer",
        customer_name: "Musa",
        new_name: null,
        city: null,
        phone: "690123456",
        whatsapp: null,
        email: null,
        note: "Prefers evening delivery",
        post_action: null,
        unsupported_requests: null,
        ...baseFields(),
      };

      const proposal = await resolveExtraction(ctx, action);
      // Phone was explicitly requested to change, and a note was added — but
      // whatsapp/city/email were only pre-filled from the current record, so
      // they must NOT show up as plan steps (nothing was actually asked).
      expect(proposal.plan).toEqual([
        { code: "editCustomer", status: "ready", params: { name: "Musa" } },
        { code: "setPhone", status: "ready", params: { value: "690123456" } },
        { code: "setNote", status: "ready", params: { value: "Prefers evening delivery" } },
      ]);
    });
  });

  it("never leaks candidates across orgs: resolveParty is always called with the caller's ctx", async () => {
    loadEntityCandidates.mockResolvedValue([MUSA]);
    const action: ExtractedAction = {
      action: "customer_balance",
      customer_name: "Musa",
      ...baseFields(),
    };
    await resolveExtraction(ctx, action);
    for (const call of loadEntityCandidates.mock.calls) {
      expect(call[0]).toBe(ctx);
    }
  });
});
