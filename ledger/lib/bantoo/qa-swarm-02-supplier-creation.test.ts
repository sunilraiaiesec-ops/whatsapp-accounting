// QA Reliability Swarm — Track 2: Supplier Creation Agent.
//
// Originally a regression suite PINNING the hypothesis that create_supplier
// was built to mirror create_customer field-for-field but never received the
// "Fix Ask Bantoo create_customer field persistence" sprint's extra fields
// (email/companyName/taxId/paymentTermsDays/creditLimit/defaultDiscount/
// preferredLanguage/preferredPaymentMethod) at ANY pipeline stage, plus two
// incidentally-discovered regex bugs (a trailing period breaking name
// extraction, and unrecognized payment-terms/credit-limit clauses corrupting
// the city field for create_supplier).
//
// All three root causes are now fixed (see createSupplierSchema in
// lib/ai/actions.ts, the create_supplier branch in
// lib/command-parse.ts's parseCommandTextFull, stripTrailingClauses's
// SUPPLIER_ROLE_NOUN position-awareness, and buildPartyPlan's
// create_customer-or-create_supplier gate in lib/bantoo/resolve.ts) — this
// file now asserts the FIXED behavior and doubles as the permanent
// regression suite for all three bugs (see the sibling file
// app/actions/qa-swarm-02-supplier-persistence.test.ts for the execute()-
// layer proof, and lib/bantoo/create-supplier.test.ts for the original
// create_supplier-as-its-own-action launch-blocking bug this sprint built
// on top of).
//
// No AI provider is configured in this environment (see ledger/.env — only
// RESEND_API_KEY is set), so the rule-based fallback (ruleBasedExtract /
// parseBantooCommandText) is what ACTUALLY runs end-to-end today. That is
// exercised directly below rather than only theorized about.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractedActionSchema, parseExtractedAction, type ExtractedAction } from "@/lib/ai/actions";
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

beforeEach(() => {
  listInventoryItems.mockReset().mockResolvedValue([]);
  loadEntityCandidates.mockReset().mockResolvedValue([]);
  bankAndCashAccounts.mockReset().mockResolvedValue([]);
  getCommandPatternSuggestions.mockReset().mockResolvedValue({});
  getPartyContact.mockReset().mockResolvedValue(null);
});

// The 5 required swarm-brief test commands, verbatim.
const CMD_SIMPLE = "Add Olam as a supplier.";
const CMD_FULL_EN =
  'Create a supplier called Nile Packaging SARL in Douala. Phone +237 699 888 777, WhatsApp same, email sales@nilepackaging.cm, payment terms 21 days, note "Supplies rice bags and labels."';
const CMD_FULL_EN_MORE =
  "Create a supplier called Sahel Grain Traders in Maroua. Phone +237 655 222 333. WhatsApp same number. Email sourcing@sahelgrain.cm. Payment terms 60 days. Credit limit 3,000,000 XAF. Tax ID CM-MR-2026-0099. Note: Pays via bank transfer only.";
const CMD_FRENCH =
  "Créer un fournisseur nommé Sahel Grain Traders à Maroua. Téléphone +237 655 222 333. WhatsApp même numéro. Email sourcing@sahelgrain.cm. Conditions de paiement 60 jours. Limite de crédit 3 000 000 XAF. Numéro fiscal CM-MR-2026-0099.";
const CMD_TRAP =
  "Create a supplier called Test Non Default Supplier in Yaoundé. Payment terms 53 days. Credit limit 9,876,543 XAF. Phone +237 600 222 333.";

// ---------------------------------------------------------------------------
// Stage 1: parseBantooCommandText (lib/command-parse.ts) — rule-based intent
// + field parsing. This is what actually runs in this environment (no AI key
// configured), so it is the ground truth for "what happens today".
// ---------------------------------------------------------------------------

describe("parseBantooCommandText — create_supplier field extraction (Track 2 primary hypothesis, now fixed)", () => {
  it('FIXED: "Add Olam as a supplier." (trailing period, exact swarm-brief command #1) now extracts the name correctly', () => {
    const parsed = parseBantooCommandText(CMD_SIMPLE);
    expect(parsed.intent).toBe("create_supplier");
    // stripTrailingClauses now strips trailing sentence punctuation before
    // the name/city regexes (which anchor to end-of-string) ever run — see
    // its doc comment in lib/command-parse.ts.
    expect(parsed.partyName).toBe("Olam");
  });

  it("confirms the trailing-period fix is symmetric with create_customer (shared regex, not a supplier-only fix)", () => {
    const supplier = parseBantooCommandText("Add Olam as a supplier.");
    const customer = parseBantooCommandText("Add Musa as a customer.");
    expect(supplier.partyName).toBe("Olam");
    expect(customer.partyName).toBe("Musa");
    // Without the trailing period both still work fine — isolates the
    // period-handling as shared, not a regression on the no-period path.
    expect(parseBantooCommandText("Add Olam as a supplier").partyName).toBe("Olam");
    expect(parseBantooCommandText("Add Musa as a customer").partyName).toBe("Musa");
  });

  it("FIXED: full English complex command (#2): name/city/phone/whatsapp/email/payment-terms all extracted for suppliers now", () => {
    const parsed = parseBantooCommandText(CMD_FULL_EN);
    expect(parsed.intent).toBe("create_supplier");
    expect(parsed.partyName).toBe("Nile Packaging SARL");
    expect(parsed.city).toBe("Douala");
    expect(parsed.phone).toBe("+237699888777");
    expect(parsed.whatsapp).toBe("+237699888777"); // "WhatsApp same" correctly repeats the phone
    // FIXED: create_supplier's branch in parseCommandTextFull() now calls
    // the same extractCreateCustomerEmail/TaxId/PaymentTermsDays/CreditLimit
    // helpers create_customer uses (see lib/command-parse.ts around
    // "else if (intent === 'create_supplier')") — these extractors were
    // always party-type-agnostic, create_supplier just never called them.
    expect(parsed.email).toBe("sales@nilepackaging.cm");
    expect(parsed.paymentTermsDays).toBe(21);
  });

  it("the exact same phrasing extracts identically for create_customer (proves the fix reached true parity, not a general parser quirk)", () => {
    const customerPhrasing = CMD_FULL_EN.replace(/supplier/gi, "customer");
    const parsed = parseBantooCommandText(customerPhrasing);
    expect(parsed.intent).toBe("create_customer");
    expect(parsed.email).toBe("sales@nilepackaging.cm");
    expect(parsed.paymentTermsDays).toBe(21);
  });

  it("FIXED: full English complex command with credit limit + tax ID (#3): those fields are now extracted for suppliers too", () => {
    const parsed = parseBantooCommandText(CMD_FULL_EN_MORE);
    expect(parsed.intent).toBe("create_supplier");
    expect(parsed.partyName).toBe("Sahel Grain Traders");
    expect(parsed.city).toBe("Maroua");
    expect(parsed.phone).toBe("+237655222333");
    expect(parsed.whatsapp).toBe("+237655222333");
    expect(parsed.email).toBe("sourcing@sahelgrain.cm");
    expect(parsed.creditLimit).toBe("3000000");
    expect(parsed.taxId).toBe("CM-MR-2026-0099");
    expect(parsed.paymentTermsDays).toBe(60);
  });

  it("French complex command (#4): name/city/phone/whatsapp/email extraction works in French too", () => {
    const parsed = parseBantooCommandText(CMD_FRENCH);
    expect(parsed.intent).toBe("create_supplier");
    expect(parsed.partyName).toBe("Sahel Grain Traders");
    expect(parsed.city).toBe("Maroua");
    expect(parsed.phone).toBe("+237655222333");
    expect(parsed.whatsapp).toBe("+237655222333");
    expect(parsed.email).toBe("sourcing@sahelgrain.cm");
    // KNOWN GAP (documented, not part of Track 2's create_supplier-vs-
    // create_customer parity fix — confirmed symmetric with create_customer
    // below): the tax_id/payment_terms_days/credit_limit extractors only
    // recognize English phrasing ("tax id", "payment terms", "credit
    // limit"), not the French equivalents used here ("Numéro fiscal",
    // "Conditions de paiement", "Limite de crédit"). This is a pre-existing
    // French-language coverage gap, not a create_supplier-specific bug.
    expect(parsed.creditLimit).toBeNull();
    expect(parsed.taxId).toBeNull();
    expect(parsed.paymentTermsDays).toBeNull();
  });

  it("confirms the French tax/payment-terms/credit-limit gap is shared with create_customer (pre-existing, not a create_supplier regression)", () => {
    const customerPhrasing = CMD_FRENCH.replace(/fournisseur/gi, "client");
    const parsed = parseBantooCommandText(customerPhrasing);
    expect(parsed.intent).toBe("create_customer");
    expect(parsed.partyName).toBe("Sahel Grain Traders");
    expect(parsed.city).toBe("Maroua");
    expect(parsed.email).toBe("sourcing@sahelgrain.cm");
    expect(parsed.creditLimit).toBeNull();
    expect(parsed.taxId).toBeNull();
    expect(parsed.paymentTermsDays).toBeNull();
  });

  it('FIXED: "payment terms"/"credit limit" clauses no longer corrupt the extracted CITY field (#5)', () => {
    const parsed = parseBantooCommandText(CMD_TRAP);
    expect(parsed.intent).toBe("create_supplier");
    expect(parsed.partyName).toBe("Test Non Default Supplier");
    // FIXED: create_supplier now pulls payment_terms_days/credit_limit out
    // via the shared extractors BEFORE city extraction effectively matters
    // for this phrasing (the trap city clause is well-formed — "in
    // Yaoundé." — city extraction was never the ACTUAL culprit; the fields
    // themselves simply weren't being read for suppliers at all).
    expect(parsed.city).toBe("Yaoundé");
    expect(parsed.phone).toBe("+237600222333");
    expect(parsed.paymentTermsDays).toBe(53);
    expect(parsed.creditLimit).toBe("9876543");
  });
});

// ---------------------------------------------------------------------------
// Stage 2: ruleBasedExtract (lib/bantoo/fallback.ts) — maps ParsedCommand to
// the ExtractedAction the rest of the pipeline consumes.
// ---------------------------------------------------------------------------

describe("ruleBasedExtract — create_supplier now carries the extended profile fields at parity with create_customer", () => {
  it("action shape for create_supplier has the same email/companyName/taxId/paymentTermsDays/creditLimit keys as create_customer", () => {
    const supplierAction = ruleBasedExtract(CMD_FULL_EN_MORE);
    expect(supplierAction.action).toBe("create_supplier");
    // createSupplierSchema (lib/ai/actions.ts) now mirrors
    // createCustomerSchema's extended fields field-for-field — verified
    // below at the zod layer. Runtime object keys confirm it too.
    expect(Object.keys(supplierAction)).toContain("email");
    expect(Object.keys(supplierAction)).toContain("company_name");
    expect(Object.keys(supplierAction)).toContain("tax_id");
    expect(Object.keys(supplierAction)).toContain("payment_terms_days");
    expect(Object.keys(supplierAction)).toContain("credit_limit");
    if (supplierAction.action === "create_supplier") {
      expect(supplierAction.email).toBe("sourcing@sahelgrain.cm");
      expect(supplierAction.tax_id).toBe("CM-MR-2026-0099");
      expect(supplierAction.payment_terms_days).toBe(60);
      expect(supplierAction.credit_limit).toBe(3000000);
    }

    const customerAction = ruleBasedExtract(CMD_FULL_EN_MORE.replace(/supplier/gi, "customer"));
    expect(customerAction.action).toBe("create_customer");
    expect(Object.keys(customerAction)).toContain("email");
    expect(Object.keys(customerAction)).toContain("tax_id");
    expect(Object.keys(customerAction)).toContain("payment_terms_days");
    expect(Object.keys(customerAction)).toContain("credit_limit");
  });

  it("blendExtraction preserves the create_supplier action/name across AI+rule reconciliation, carrying the extended fields too", () => {
    const blended = blendExtraction(CMD_FULL_EN_MORE, {
      action: "unknown",
      confidence: 0,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_supplier");
    if (blended.action === "create_supplier") {
      expect(blended.supplier_name).toBe("Sahel Grain Traders");
      expect(blended.credit_limit).toBe(3000000);
      expect(blended.tax_id).toBe("CM-MR-2026-0099");
    }
  });
});

// ---------------------------------------------------------------------------
// Stage 2b: the zod schema itself (lib/ai/actions.ts). Proves the fix holds
// in a WORLD WHERE AI IS CONFIGURED and the model correctly identifies and
// returns email/tax_id/payment_terms_days/credit_limit/company_name for a
// create_supplier action — createSupplierSchema now declares these fields
// explicitly (mirroring createCustomerSchema), so zod preserves them instead
// of silently stripping them as unknown keys.
// ---------------------------------------------------------------------------

describe("createSupplierSchema (via parseExtractedAction) — preserves the extended fields at parity with createCustomerSchema", () => {
  it("a perfect AI response for create_supplier now keeps email/company_name/tax_id/payment_terms_days/credit_limit/default_discount after parsing", () => {
    const hypotheticalAiResponse = {
      action: "create_supplier",
      supplier_name: "Sahel Grain Traders",
      city: "Maroua",
      phone: "+237655222333",
      whatsapp: "+237655222333",
      country: null,
      note: "Pays via bank transfer only.",
      post_action: null,
      unsupported_requests: null,
      currency: "XAF",
      confidence: 0.95,
      summary: null,
      // Everything below is exactly what create_customer's schema captures,
      // and what createSupplierSchema now ALSO declares at parity.
      email: "sourcing@sahelgrain.cm",
      company_name: "Sahel Grain Traders",
      tax_id: "CM-MR-2026-0099",
      payment_terms_days: 60,
      credit_limit: 3000000,
      default_discount: null,
      preferred_language: null,
      preferred_payment_method: null,
    };

    const result = parseExtractedAction(hypotheticalAiResponse);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action.action).toBe("create_supplier");
      // FIXED: createSupplierSchema now declares these fields explicitly, so
      // zod preserves them instead of stripping them as unknown keys.
      expect((result.action as unknown as Record<string, unknown>).email).toBe("sourcing@sahelgrain.cm");
      expect((result.action as unknown as Record<string, unknown>).tax_id).toBe("CM-MR-2026-0099");
      expect((result.action as unknown as Record<string, unknown>).payment_terms_days).toBe(60);
      expect((result.action as unknown as Record<string, unknown>).credit_limit).toBe(3000000);
      expect((result.action as unknown as Record<string, unknown>).company_name).toBe("Sahel Grain Traders");
    }
  });

  it("the SAME hypothetical fields on a create_customer response are preserved (control case proving zod strip-vs-keep is schema-specific, not a general zod quirk)", () => {
    const result = parseExtractedAction({
      action: "create_customer",
      customer_name: "Sahel Grain Traders",
      city: "Maroua",
      phone: "+237655222333",
      whatsapp: "+237655222333",
      country: null,
      note: null,
      post_action: null,
      unsupported_requests: null,
      currency: "XAF",
      confidence: 0.95,
      summary: null,
      email: "sourcing@sahelgrain.cm",
      company_name: "Sahel Grain Traders",
      tax_id: "CM-MR-2026-0099",
      payment_terms_days: 60,
      credit_limit: 3000000,
      default_discount: null,
      preferred_language: null,
      preferred_payment_method: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.action.action === "create_customer") {
      expect(result.action.email).toBe("sourcing@sahelgrain.cm");
      expect(result.action.tax_id).toBe("CM-MR-2026-0099");
      expect(result.action.payment_terms_days).toBe(60);
      expect(result.action.credit_limit).toBe(3000000);
    }
  });

  it("extractedActionSchema's create_supplier branch NOW has email/tax_id/payment_terms_days/credit_limit at the shape level", () => {
    // Belt-and-suspenders static check: parsing garbage-typed data with the
    // discriminated union and inspecting the resolved branch's shape key set.
    const shape = extractedActionSchema.options.find(
      (o) => (o.shape as { action: { value: string } }).action.value === "create_supplier",
    );
    expect(shape).toBeDefined();
    const keys = Object.keys((shape as unknown as { shape: Record<string, unknown> }).shape);
    for (const present of ["email", "company_name", "tax_id", "payment_terms_days", "credit_limit", "default_discount"]) {
      expect(keys).toContain(present);
    }
  });
});

// ---------------------------------------------------------------------------
// Stage 3: resolveExtraction (lib/bantoo/resolve.ts) — the plan/draft the
// confirmation UI actually renders before Confirm & Save.
// ---------------------------------------------------------------------------

describe("resolveExtraction — create_supplier plan/draft now surfaces the extended profile fields at parity with create_customer", () => {
  it("buildPartyPlan's create_customer-OR-create_supplier fields gate means create_supplier's plan now shows setEmail/setCompanyName/setTaxId/setPaymentTerms/setCreditLimit too", async () => {
    loadEntityCandidates.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "create_supplier",
      supplier_name: "Sahel Grain Traders",
      city: "Maroua",
      phone: "+237655222333",
      whatsapp: "+237655222333",
      country: null,
      note: "Pays via bank transfer only.",
      email: "sourcing@sahelgrain.cm",
      company_name: null,
      tax_id: "CM-MR-2026-0099",
      payment_terms_days: 60,
      credit_limit: 3000000,
      default_discount: null,
      preferred_language: null,
      preferred_payment_method: null,
      post_action: null,
      unsupported_requests: null,
      confidence: 0.92,
      currency: "XAF",
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.action).toBe("create_supplier");
    expect(proposal.partyType).toBe("supplier");
    // FIXED: resolve.ts's "create_supplier" case now reads
    // action.email/tax_id/etc (createSupplierSchema carries them now) and
    // buildPartyPlan's extra-fields block is gated on
    // `action.action === "create_customer" || action.action ===
    // "create_supplier"` — see lib/bantoo/resolve.ts.
    expect(proposal.plan.map((s) => s.code)).toEqual([
      "createSupplier",
      "setCity",
      "setPhone",
      "setWhatsapp",
      "setEmail",
      "setTaxId",
      "setPaymentTerms",
      "setCreditLimit",
      "setNote",
    ]);
    expect(proposal.draft.email).toBe("sourcing@sahelgrain.cm");
    expect(proposal.draft.taxId).toBe("CM-MR-2026-0099");
    expect(proposal.draft.paymentTermsDays).toBe("60");
    expect(proposal.draft.creditLimit).toBe("3000000");
  });

  it("control case: the IDENTICAL scenario for create_customer shows the same extended-field plan steps (proves true parity, not a supplier-only special case)", async () => {
    loadEntityCandidates.mockResolvedValue([]);
    const action: ExtractedAction = {
      action: "create_customer",
      customer_name: "Sahel Grain Traders",
      city: "Maroua",
      phone: "+237655222333",
      whatsapp: "+237655222333",
      country: null,
      note: "Pays via bank transfer only.",
      email: "sourcing@sahelgrain.cm",
      company_name: null,
      tax_id: "CM-MR-2026-0099",
      payment_terms_days: 60,
      credit_limit: 3000000,
      default_discount: null,
      preferred_language: null,
      preferred_payment_method: null,
      post_action: null,
      unsupported_requests: null,
      confidence: 0.92,
      currency: "XAF",
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.plan.map((s) => s.code)).toEqual([
      "createCustomer",
      "setCity",
      "setPhone",
      "setWhatsapp",
      "setEmail",
      "setTaxId",
      "setPaymentTerms",
      "setCreditLimit",
      "setNote",
    ]);
    expect(proposal.draft.email).toBe("sourcing@sahelgrain.cm");
    expect(proposal.draft.taxId).toBe("CM-MR-2026-0099");
    expect(proposal.draft.paymentTermsDays).toBe("60");
    expect(proposal.draft.creditLimit).toBe("3000000");
  });

  it("FIXED (Track 4): create_supplier now raises a possibleDuplicateSupplier prompt instead of silently auto-attaching on a conflicting-details match", async () => {
    // A HIGH-confidence name match against an EXISTING supplier whose phone
    // conflicts with the new request's phone. Before Track 4's fix,
    // create_supplier had no possible-duplicate safety check at all (see
    // create_customer's identical, pre-existing possibleDuplicateCustomer
    // flow that this mirrors) and would silently auto-attach to the
    // existing party. resolve.ts's "create_supplier" case now runs the same
    // isExactPartyNameMatch/customerConflictsWithExisting check as
    // create_customer.
    loadEntityCandidates.mockResolvedValue([
      { id: "party_sahel", label: "Sahel Grain Traders", text: "Sahel Grain Traders" },
    ]);
    getPartyContact.mockResolvedValue({
      id: "party_sahel",
      name: "Sahel Grain Traders",
      phone: "+237699000000", // conflicts with the new request's phone below
      whatsapp: null,
      email: null,
      city: "Maroua",
      country: null,
    });
    const action: ExtractedAction = {
      action: "create_supplier",
      supplier_name: "Sahel Grain Traders",
      city: "Maroua",
      phone: "+237655222333", // conflicts with the existing record's stored phone above
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
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateSupplier")).toBe(true);
    expect(proposal.duplicateCandidate).toEqual({
      id: "party_sahel",
      name: "Sahel Grain Traders",
      city: "Maroua",
      phone: "+237699000000",
      whatsapp: null,
      country: null,
    });
    // Forces the user to explicitly choose "use existing" vs "create new"
    // instead of silently auto-attaching with the conflicting phone.
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(false);
  });

  it("an EXACT name match with no conflicting details still auto-selects the existing supplier (never a spurious duplicate prompt)", async () => {
    loadEntityCandidates.mockResolvedValue([
      { id: "party_sahel", label: "Sahel Grain Traders", text: "Sahel Grain Traders" },
    ]);
    getPartyContact.mockResolvedValue({
      id: "party_sahel",
      name: "Sahel Grain Traders",
      phone: null,
      whatsapp: null,
      email: null,
      city: null,
      country: null,
    });
    const action: ExtractedAction = {
      action: "create_supplier",
      supplier_name: "Sahel Grain Traders",
      city: "Maroua",
      phone: "+237655222333",
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
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateSupplier")).toBe(false);
    expect(proposal.duplicateCandidate).toBeNull();
    expect(proposal.partyId).toBe("party_sahel");
    expect(proposal.createParty).toBe(false);
  });
});
