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

const ELHAJI = { id: "party_elhaji", label: "Elhaji Adoum", text: "Elhaji Adoum" };

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

describe("resolveExtraction — Supplier & Purchasing Intelligence Sprint", () => {
  it("edit_supplier: resolves the party and pre-fills contact fields from the org (never cross-org)", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    getPartyContact.mockResolvedValue({
      id: "party_elhaji",
      name: "Elhaji Adoum",
      phone: "690000000",
      whatsapp: null,
      email: "elhaji@example.com",
      city: "Maroua",
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "edit_supplier",
      supplier_name: "Elhaji Adoum",
      new_name: null,
      city: null,
      phone: "690123456",
      whatsapp: null,
      email: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);

    expect(loadEntityCandidates).toHaveBeenCalledWith(ctx, "supplier");
    expect(proposal.partyId).toBe("party_elhaji");
    expect(proposal.createParty).toBe(false);
    expect(proposal.draft.phone).toBe("690123456");
    expect(proposal.draft.email).toBe("elhaji@example.com");
    expect(proposal.draft.city).toBe("Maroua");
    expect(proposal.warnings.some((w) => w.code === "noChangesToSave")).toBe(false);
  });

  it("edit_supplier: warns noChangesToSave when nothing new was said", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    getPartyContact.mockResolvedValue({
      id: "party_elhaji",
      name: "Elhaji Adoum",
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "edit_supplier",
      supplier_name: "Elhaji Adoum",
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

  it("edit_supplier: unknown supplier name -> supplierNotFound, never 'not sure'", async () => {
    loadEntityCandidates.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "edit_supplier",
      supplier_name: "Zzqx Unknown",
      new_name: null,
      city: null,
      phone: null,
      whatsapp: null,
      email: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.warnings.some((w) => w.code === "supplierNotFound" && w.params?.name === "Zzqx Unknown")).toBe(
      true,
    );
    expect(proposal.warnings.some((w) => w.code === "lowConfidence")).toBe(false);
  });

  it("edit_supplier: ambiguous matches -> supplierAmbiguous with multiple options", async () => {
    // A typo'd query ("Musah") that fuzzy-matches two different suppliers
    // equally well (both land in the "medium" bucket) — neither is a
    // confident auto-select, so this must surface as ambiguous rather than
    // guessing which "Musa" the user meant.
    loadEntityCandidates.mockResolvedValue([
      { id: "p1", label: "Musa Ibrahim", text: "Musa Ibrahim" },
      { id: "p2", label: "Musa Adamou", text: "Musa Adamou" },
    ]);
    const action: ExtractedAction = {
      action: "edit_supplier",
      supplier_name: "Musah",
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
    expect(proposal.warnings.some((w) => w.code === "supplierAmbiguous")).toBe(true);
  });

  it("view_supplier: profile resolves a deep link target via partyId, not a guess", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    const action: ExtractedAction = {
      action: "view_supplier",
      supplier_name: "Elhaji Adoum",
      view: "profile",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_elhaji");
    expect(proposal.draft.view).toBe("profile");
  });

  it("view_supplier: list view never requires a party (bare 'search suppliers')", async () => {
    const action: ExtractedAction = {
      action: "view_supplier",
      supplier_name: null,
      view: "list",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.draft.view).toBe("list");
    expect(loadEntityCandidates).not.toHaveBeenCalled();
    expect(proposal.warnings.some((w) => w.code === "enterSupplierName")).toBe(false);
  });

  it("view_supplier: an unrecognized 'statement' guess falls back to 'profile' (no supplier statement page exists)", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    const action: ExtractedAction = {
      action: "view_supplier",
      // @ts-expect-error — exercising the zod .catch() fallback for an
      // invalid enum value a looser caller might send.
      view: "statement",
      supplier_name: "Elhaji Adoum",
      ...baseFields(),
    };
    // Re-parse through the schema exactly like the real extraction pipeline
    // would, so the .catch("profile") behavior is what's actually exercised.
    const { viewSupplierSchema } = await import("@/lib/ai/actions");
    const parsed = viewSupplierSchema.parse(action);
    expect(parsed.view).toBe("profile");

    const proposal = await resolveExtraction(ctx, parsed);
    expect(proposal.draft.view).toBe("profile");
  });

  it("supplier_balance: resolves the party for a balance lookup", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    const action: ExtractedAction = {
      action: "supplier_balance",
      supplier_name: "Elhaji Adoum",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_elhaji");
    expect(proposal.partyType).toBe("supplier");
  });

  it("add_supplier_note: warns when the note text is empty", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    const action: ExtractedAction = {
      action: "add_supplier_note",
      supplier_name: "Elhaji Adoum",
      note: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "enterNoteText")).toBe(true);
  });

  it("add_supplier_note: carries the note text through to the draft when present", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    const action: ExtractedAction = {
      action: "add_supplier_note",
      supplier_name: "Elhaji Adoum",
      note: "delivers on Tuesdays",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.note).toBe("delivers on Tuesdays");
    expect(proposal.warnings.some((w) => w.code === "enterNoteText")).toBe(false);
  });

  it("contact_supplier: call — missing phone warns supplierMissingPhone and never invents a number", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    getPartyContact.mockResolvedValue({
      id: "party_elhaji",
      name: "Elhaji Adoum",
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "contact_supplier",
      supplier_name: "Elhaji Adoum",
      method: "call",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.phone).toBe("");
    expect(proposal.warnings.some((w) => w.code === "supplierMissingPhone")).toBe(true);
  });

  it("contact_supplier: whatsapp — present number surfaces cleanly with no warning", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    getPartyContact.mockResolvedValue({
      id: "party_elhaji",
      name: "Elhaji Adoum",
      phone: null,
      whatsapp: "690123456",
      email: null,
      city: null,
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "contact_supplier",
      supplier_name: "Elhaji Adoum",
      method: "whatsapp",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.whatsapp).toBe("690123456");
    expect(proposal.warnings.some((w) => w.code === "supplierMissingWhatsapp")).toBe(false);
  });

  it("contact_supplier: email — missing email warns supplierMissingEmail", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    getPartyContact.mockResolvedValue({
      id: "party_elhaji",
      name: "Elhaji Adoum",
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      country: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "contact_supplier",
      supplier_name: "Elhaji Adoum",
      method: "email",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "supplierMissingEmail")).toBe(true);
  });

  it("supplier_query: resolves a period-scoped question about a specific supplier", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    const action: ExtractedAction = {
      action: "supplier_query",
      supplier_name: "Elhaji Adoum",
      question: "what did we buy from Elhaji last month",
      period_text: "last month",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_elhaji");
    expect(proposal.draft.dateFrom).toBeTruthy();
    expect(proposal.draft.dateTo).toBeTruthy();
  });

  it("unsupported_supplier_action: archive/reactivate/merge/upload never say 'not sure' and always warn notYetAvailable", async () => {
    for (const requested of ["archive", "reactivate", "merge", "upload_document"] as const) {
      const action: ExtractedAction = {
        action: "unsupported_supplier_action",
        supplier_name: "Elhaji Adoum",
        requested,
        ...baseFields(),
      };
      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.warnings.some((w) => w.code === "notYetAvailable")).toBe(true);
      expect(proposal.warnings.some((w) => w.code === "lowConfidence")).toBe(false);
      expect(proposal.action).toBe("unsupported_supplier_action");
    }
  });

  it("never leaks candidates across orgs: resolveParty is always called with the caller's ctx", async () => {
    loadEntityCandidates.mockResolvedValue([ELHAJI]);
    const action: ExtractedAction = {
      action: "supplier_balance",
      supplier_name: "Elhaji Adoum",
      ...baseFields(),
    };
    await resolveExtraction(ctx, action);
    for (const call of loadEntityCandidates.mock.calls) {
      expect(call[0]).toBe(ctx);
    }
  });
});
