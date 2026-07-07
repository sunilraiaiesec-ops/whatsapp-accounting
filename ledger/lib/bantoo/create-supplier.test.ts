// Regression suite for the launch-blocking bug: "save him as a supplier"
// showed "Create customer" in the suggested action/plan while the
// confirmation message said "supplier". Root cause was that create_supplier
// never existed as an action anywhere in the pipeline (schema, AI prompt,
// rule parser, resolve.ts) — see the postmortem comment above
// createSupplierSchema in lib/ai/actions.ts. These tests exercise every
// pipeline stage (rule parse -> ruleBasedExtract -> blendExtraction ->
// resolveExtraction) end-to-end for both create_supplier and its symmetric
// create_customer counterpart, in English and French, to guarantee the
// suggested action / plan / execute-time action never drift apart again.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractedAction } from "@/lib/ai/actions";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/ai/actions";
import type { CurrentContext } from "@/lib/auth/current";
import { blendExtraction, ruleBasedExtract } from "@/lib/bantoo/fallback";
import { parseBantooCommandText } from "@/lib/command-parse";

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

beforeEach(() => {
  listInventoryItems.mockReset().mockResolvedValue([]);
  loadEntityCandidates.mockReset().mockResolvedValue([]);
  bankAndCashAccounts.mockReset().mockResolvedValue([]);
  getCommandPatternSuggestions.mockReset().mockResolvedValue({});
  getPartyContact.mockReset().mockResolvedValue(null);
});

// --- Stage 1: rule-based intent/field parsing (lib/command-parse.ts) -------

describe("parseBantooCommandText — create_supplier intent (launch-blocking bug fix)", () => {
  it('simple "Add Olam as a supplier" -> create_supplier (regression guard from the bug report)', () => {
    const parsed = parseBantooCommandText("Add Olam as a supplier");
    expect(parsed.intent).toBe("create_supplier");
    expect(parsed.partyName).toBe("Olam");
  });

  it('symmetric simple "Add Musa as a customer" -> create_customer, never create_supplier', () => {
    const parsed = parseBantooCommandText("Add Musa as a customer");
    expect(parsed.intent).toBe("create_customer");
    expect(parsed.partyName).toBe("Musa");
  });

  it('compound "save ... as a supplier" sentence extracts name/city/phone/whatsapp/postAction as create_supplier', () => {
    const parsed = parseBantooCommandText(
      "Save Alhaji Ibrahim as a supplier in Garoua, his phone is 690123456, his WhatsApp is the same number, then open his profile.",
    );
    expect(parsed.intent).toBe("create_supplier");
    expect(parsed.partyName).toBe("Alhaji Ibrahim");
    expect(parsed.city).toBe("Garoua");
    expect(parsed.phone).toBe("690123456");
    expect(parsed.whatsapp).toBe("690123456");
    expect(parsed.postAction).toBe("open_profile");
  });

  it('symmetric compound "save ... as a customer" sentence -> create_customer throughout, never supplier', () => {
    const parsed = parseBantooCommandText(
      "Save Aisha Musa as a customer in Garoua, her phone is 690123456, her WhatsApp is the same number, then open her profile.",
    );
    expect(parsed.intent).toBe("create_customer");
    expect(parsed.partyName).toBe("Aisha Musa");
    expect(parsed.city).toBe("Garoua");
    expect(parsed.phone).toBe("690123456");
    expect(parsed.whatsapp).toBe("690123456");
    expect(parsed.postAction).toBe("open_profile");
  });

  it('French "Enregistrez Olam comme fournisseur à Garoua" -> create_supplier', () => {
    const parsed = parseBantooCommandText("Enregistrez Olam comme fournisseur à Garoua");
    expect(parsed.intent).toBe("create_supplier");
    expect(parsed.partyName).toBe("Olam");
    expect(parsed.city).toBe("Garoua");
  });

  it('French feminine "Enregistrez Aisha comme cliente à Garoua" -> create_customer', () => {
    const parsed = parseBantooCommandText("Enregistrez Aisha comme cliente à Garoua");
    expect(parsed.intent).toBe("create_customer");
    expect(parsed.partyName).toBe("Aisha");
    expect(parsed.city).toBe("Garoua");
  });

  it('"register"/"enregistrer" verb forms are recognized (previously only add/create/new were), fixing the launch-blocking bug\'s root phrasing', () => {
    expect(parseBantooCommandText("Register Olam as a supplier").intent).toBe("create_supplier");
    expect(parseBantooCommandText("Register Musa as a customer").intent).toBe("create_customer");
  });

  // --- Ambiguity precedence: the LAST explicit entity-type mention wins ----
  it('when both "as a customer" and "as a supplier" appear (self-correction), the LAST explicit mention wins -> create_supplier', () => {
    const parsed = parseBantooCommandText(
      "Add Musa as a customer, actually save Musa as a supplier instead.",
    );
    expect(parsed.intent).toBe("create_supplier");
  });

  it("the reverse ordering flips the winner -> create_customer (proves it's positional, not a hardcoded bias)", () => {
    const parsed = parseBantooCommandText(
      "Add Musa as a supplier, actually save Musa as a customer instead.",
    );
    expect(parsed.intent).toBe("create_customer");
  });
});

// --- Stage 2: ruleBasedExtract (maps ParsedCommand -> ExtractedAction) ------

describe("ruleBasedExtract — create_supplier (launch-blocking bug fix)", () => {
  it('maps "Add Olam as a supplier" to create_supplier with confidence above the low-confidence threshold', () => {
    const action = ruleBasedExtract("Add Olam as a supplier");
    expect(action.action).toBe("create_supplier");
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    if (action.action === "create_supplier") {
      expect(action.supplier_name).toBe("Olam");
    }
  });

  it("mirrors create_customer's field-for-field shape (city/phone/whatsapp/post_action)", () => {
    const action = ruleBasedExtract(
      "Save Alhaji Ibrahim as a supplier in Garoua, his phone is 690123456, his WhatsApp is the same number, then open his profile.",
    );
    expect(action.action).toBe("create_supplier");
    if (action.action === "create_supplier") {
      expect(action.supplier_name).toBe("Alhaji Ibrahim");
      expect(action.city).toBe("Garoua");
      expect(action.phone).toBe("690123456");
      expect(action.whatsapp).toBe("690123456");
      expect(action.post_action).toBe("open_profile");
      // Notes require pronoun resolution / free-text understanding the rule
      // parser deliberately doesn't attempt — that's the AI path's job.
      expect(action.note).toBeNull();
    }
  });

  it('symmetric: "Add Musa as a customer" never becomes create_supplier', () => {
    const action = ruleBasedExtract("Add Musa as a customer");
    expect(action.action).toBe("create_customer");
  });
});

// --- Stage 3: blendExtraction (AI/rule reconciliation) ----------------------

describe("blendExtraction — create_supplier (launch-blocking bug fix)", () => {
  it("promotes rule-parser create_supplier when AI returns unknown", () => {
    const blended = blendExtraction("Add Olam as a supplier", {
      action: "unknown",
      confidence: 0,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_supplier");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it("promotes French create_supplier when AI returns unknown", () => {
    const blended = blendExtraction("Enregistrez Olam comme fournisseur à Garoua", {
      action: "unknown",
      confidence: 0.2,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_supplier");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it("boosts low-confidence AI create_supplier when the rule parser agrees (never falls back to create_customer)", () => {
    const blended = blendExtraction("Add Olam as a supplier in Garoua", {
      action: "create_supplier",
      supplier_name: "Olam",
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
      confidence: 0.3,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_supplier");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it("fills a missing supplier_name on low-confidence AI create_supplier from the rule parser", () => {
    const blended = blendExtraction("Add Olam as a supplier", {
      action: "create_supplier",
      supplier_name: null,
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
      confidence: 0.35,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_supplier");
    if (blended.action === "create_supplier") {
      expect(blended.supplier_name).toBe("Olam");
      expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    }
  });

  it("never lets a correct high-confidence AI create_supplier get overridden back to create_customer by the rule parser — no customer-bias override exists", () => {
    // The rule parser sees "customer" nowhere in this text, so it can't
    // possibly disagree — this test documents that blendExtraction's
    // create_supplier branch is keyed on action.action alone, never a
    // generic "party creation" bucket that could get relabeled.
    const blended = blendExtraction("Alhaji Ibrahim, city Garoua, save him as a supplier", {
      action: "create_supplier",
      supplier_name: "Alhaji Ibrahim",
      city: "Garoua",
      phone: null,
      whatsapp: null,
      country: null,
      note: "I'll be buying sesame from him every month",
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
      confidence: 0.95,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_supplier");
    if (blended.action === "create_supplier") {
      expect(blended.supplier_name).toBe("Alhaji Ibrahim");
      expect(blended.note).toBe("I'll be buying sesame from him every month");
      expect(blended.post_action).toBe("open_profile");
    }
  });

  it("symmetric: a correct high-confidence AI create_customer is never overridden to create_supplier", () => {
    const blended = blendExtraction("Aisha Musa, city Garoua, save her as a customer", {
      action: "create_customer",
      customer_name: "Aisha Musa",
      city: "Garoua",
      phone: null,
      whatsapp: null,
      country: null,
      note: "Regular buyer",
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
      confidence: 0.95,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_customer");
    if (blended.action === "create_customer") {
      expect(blended.customer_name).toBe("Aisha Musa");
    }
  });
});

// --- Stage 4: resolveExtraction (proposal + multi-step plan) ---------------

describe("resolveExtraction — create_supplier plan/label consistency (launch-blocking bug fix)", () => {
  it("simple 'add Olam as a supplier' -> plan has just [createSupplier], action stays create_supplier", async () => {
    loadEntityCandidates.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "create_supplier",
      supplier_name: "Olam",
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
      confidence: 0.9,
      currency: "XAF",
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.action).toBe("create_supplier");
    expect(proposal.partyType).toBe("supplier");
    expect(proposal.plan).toEqual([{ code: "createSupplier", status: "ready", params: { name: "Olam" } }]);
  });

  it("the exact bug scenario: full compound supplier details resolve to a create_supplier plan/proposal, never create_customer", async () => {
    loadEntityCandidates.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "create_supplier",
      supplier_name: "Alhaji Ibrahim",
      city: "Garoua",
      phone: "+237690123456",
      whatsapp: "+237690123456",
      country: null,
      note: "I'll be buying sesame from him every month",
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
      confidence: 0.92,
      currency: "XAF",
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.action).toBe("create_supplier");
    expect(proposal.partyType).toBe("supplier");
    expect(proposal.draft.city).toBe("Garoua");
    expect(proposal.draft.phone).toBe("+237690123456");
    expect(proposal.draft.whatsapp).toBe("+237690123456");
    expect(proposal.draft.note).toBe("I'll be buying sesame from him every month");
    expect(proposal.draft.postAction).toBe("open_profile");
    expect(proposal.plan).toEqual([
      { code: "createSupplier", status: "ready", params: { name: "Alhaji Ibrahim" } },
      { code: "setCity", status: "ready", params: { value: "Garoua" } },
      { code: "setPhone", status: "ready", params: { value: "+237690123456" } },
      { code: "setWhatsapp", status: "ready", params: { value: "+237690123456" } },
      { code: "setNote", status: "ready", params: { value: "I'll be buying sesame from him every month" } },
      { code: "openSupplierProfile", status: "ready" },
    ]);
    // Never mislabeled as the customer plan step — this was the exact
    // launch-blocking contradiction reported (plan said "Create customer").
    expect(proposal.plan.some((step) => step.code === "createCustomer")).toBe(false);
    expect(proposal.plan.some((step) => step.code === "openProfile")).toBe(false);
  });

  it("symmetric bug scenario: full compound CUSTOMER details resolve to a create_customer plan/proposal, never create_supplier", async () => {
    loadEntityCandidates.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "create_customer",
      customer_name: "Aisha Musa",
      city: "Garoua",
      phone: "+237690123456",
      whatsapp: "+237690123456",
      country: null,
      note: "Regular customer, buys every month",
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
      confidence: 0.92,
      currency: "XAF",
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.action).toBe("create_customer");
    expect(proposal.partyType).toBe("customer");
    expect(proposal.plan).toEqual([
      { code: "createCustomer", status: "ready", params: { name: "Aisha Musa" } },
      { code: "setCity", status: "ready", params: { value: "Garoua" } },
      { code: "setPhone", status: "ready", params: { value: "+237690123456" } },
      { code: "setWhatsapp", status: "ready", params: { value: "+237690123456" } },
      { code: "setNote", status: "ready", params: { value: "Regular customer, buys every month" } },
      { code: "openProfile", status: "ready" },
    ]);
    expect(proposal.plan.some((step) => step.code === "createSupplier")).toBe(false);
    expect(proposal.plan.some((step) => step.code === "openSupplierProfile")).toBe(false);
  });

  it("missing supplier name warns enterSupplierName (mirrors create_customer's enterCustomerName)", async () => {
    const action: ExtractedAction = {
      action: "create_supplier",
      supplier_name: null,
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
      confidence: 0.9,
      currency: "XAF",
      summary: null,
    };
    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "enterSupplierName")).toBe(true);
  });

  it("a HIGH-confidence existing-supplier name match auto-selects the party instead of creating a near-duplicate", async () => {
    loadEntityCandidates.mockResolvedValue([
      { id: "party_olam", label: "Olam", text: "Olam" },
    ]);
    const action: ExtractedAction = {
      action: "create_supplier",
      supplier_name: "Olam",
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
      confidence: 0.9,
      currency: "XAF",
      summary: null,
    };
    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_olam");
    expect(proposal.createParty).toBe(false);
  });
});
