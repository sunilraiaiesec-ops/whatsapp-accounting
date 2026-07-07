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

vi.mock("@/lib/parties", () => ({
  getPartyContact: (...args: unknown[]) => getPartyContact(...args),
}));

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
