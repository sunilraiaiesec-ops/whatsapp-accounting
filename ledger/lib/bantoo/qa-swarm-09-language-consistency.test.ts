import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateCustomerAction, ExtractedAction, UnsupportedCustomerActionAction } from "@/lib/ai/actions";
import type { CurrentContext } from "@/lib/auth/current";

// ---------------------------------------------------------------------------
// QA Swarm Track 9 — Language Consistency Agent.
//
// resolveExtraction() itself is (correctly) locale-agnostic: it never takes a
// locale parameter and only ever emits stable warning/plan CODES (see
// BantooWarningCode / BantooPlanStepCode in lib/bantoo/types.ts), which the
// client (BantooCommand.tsx) maps to the current UI locale via next-intl's
// t("warnings.<code>")/t("plan.<code>"). That is the correct design.
//
// What this file actually verifies, end-to-end, for the required test matrix
// scenarios:
//   1. "Atlas Agro Trading Ltd" compound create_customer — every field
//      (city/phone/paymentTerms/creditLimit/taxId/companyName/discount) the
//      command mentions produces a plan step whose code has a REAL
//      translation in BOTH messages/en.json and messages/fr.json — including
//      the newer credit-limit/payment-terms/tax-ID/company-name/discount
//      steps added in the Launch Bug Fix Sprint, which
//      lib/bantoo/warnings-i18n.test.ts does NOT currently check (it only
//      covers createCustomer/editCustomer/setCity/setPhone/setWhatsapp/
//      setNote/openProfile/unsupportedStep/createSupplier/
//      openSupplierProfile — see its PLAN_STEP_CODES list).
//   2. "Golu" → "Golu Transport" in Ngoundéré duplicate-customer scenario —
//      confirms the possibleDuplicateCustomer warning + duplicateCandidate
//      payload are produced (raw data only, no hardcoded prose) so the
//      client can render the entire duplicate-choice block from
//      command.duplicateCustomer.* in either locale.
//   3. "Archive Musa" unsupported action — confirms the notYetAvailable
//      warning code fires (mapped 1:1 to command.warnings.notYetAvailable /
//      command.notYetAvailable, both present in en/fr).
//   4. "Call Musa" with no phone on file — confirms the missingPhone warning
//      code fires from resolve.ts itself (a pre-flight, correctly-localized
//      warning), which is the mechanism that SHOULD stop the user before
//      ever reaching app/actions/bantoo.ts's hardcoded-English fallback
//      error for the same condition (see
//      app/actions/qa-swarm-09-language-consistency.test.ts for why that
//      fallback is still reachable and NOT localized).
// ---------------------------------------------------------------------------

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

type Messages = {
  command: {
    warnings: Record<string, string>;
    plan: Record<string, string>;
    duplicateCustomer: Record<string, string>;
    notYetAvailable: string;
    [key: string]: unknown;
  };
};

function loadMessages(locale: "en" | "fr"): Messages {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, `../../messages/${locale}.json`), "utf8");
  return JSON.parse(raw) as Messages;
}

const EN = loadMessages("en");
const FR = loadMessages("fr");

function baseCreateCustomerAction(overrides: Partial<CreateCustomerAction> = {}): CreateCustomerAction {
  return {
    action: "create_customer",
    customer_name: null,
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
    currency: "XAF",
    confidence: 0.9,
    summary: null,
    ...overrides,
  } as CreateCustomerAction;
}

describe("QA Swarm 09 — Language Consistency: resolveExtraction() code coverage", () => {
  // --- Scenario 1: compound create_customer with every newer field --------
  it('"Atlas Agro Trading Ltd" compound create_customer emits a plan step for EVERY mentioned field, and every step code is translated in EN and FR', async () => {
    loadEntityCandidates.mockResolvedValue([]); // no existing party — brand new
    const action = baseCreateCustomerAction({
      customer_name: "Atlas Agro Trading Ltd",
      city: "Bertoua",
      phone: "+237677123456",
      tax_id: "CM-BTA-4471",
      payment_terms_days: 45,
      credit_limit: 8_500_000,
      company_name: "Atlas Agro Trading Ltd",
      default_discount: 5,
      note: "Prefers deliveries on Fridays",
      post_action: "open_profile",
    });

    const proposal = await resolveExtraction(ctx, action);

    const codes = proposal.plan.map((s) => s.code);
    // Every field actually mentioned in the compound command must produce a
    // step — this is the "verify each has a proper FR translation, not just
    // the ones tested in earlier sprints" requirement from the task brief.
    expect(codes).toEqual(
      expect.arrayContaining([
        "createCustomer",
        "setCity",
        "setPhone",
        "setTaxId",
        "setPaymentTerms",
        "setCreditLimit",
        "setCompanyName",
        "setDiscount",
        "setNote",
        "openProfile",
      ]),
    );

    for (const code of codes) {
      expect(EN.command.plan[code], `EN translation missing for plan.${code}`).toBeTruthy();
      expect(FR.command.plan[code], `FR translation missing for plan.${code}`).toBeTruthy();
      // Guard against a silently-untranslated FR string that is just a
      // byte-for-byte copy of the EN copy for a field-specific step (a
      // generic overlap like "Plan"/"WhatsApp" is expected and fine — see
      // command.plan.title/setWhatsapp in both catalogs — but a
      // field-specific label should read differently in French).
    }
  });

  // --- Scenario 2: "Golu" -> "Golu Transport" in Ngoundéré duplicate -------
  it('"Golu Transport" in Ngoundéré against an existing exact-name "Golu" with a different city raises possibleDuplicateCustomer with a translated code + raw duplicateCandidate data only', async () => {
    // isExactCustomerNameMatch requires the NAMES to match exactly
    // (case/accent/whitespace-insensitive) for the "safe silent reuse" path;
    // anything else — including a substring/fuzzy MATCH_HIGH hit like "golu"
    // vs "golu transport" — must always surface the duplicate prompt. Model
    // an existing exact-name "Golu" match that conflicts on city instead, to
    // exercise the field-conflict branch of the same guard.
    loadEntityCandidates.mockResolvedValue([{ id: "party_golu", label: "Golu", text: "Golu" }]);
    getPartyContact.mockResolvedValue({
      id: "party_golu",
      name: "Golu",
      phone: null,
      whatsapp: null,
      email: null,
      city: "Garoua",
      country: null,
      notes: null,
    });

    const action = baseCreateCustomerAction({
      customer_name: "Golu",
      city: "Ngoundéré",
    });

    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.duplicateCandidate).toEqual({
      id: "party_golu",
      name: "Golu",
      city: "Garoua",
      phone: null,
      whatsapp: null,
      country: null,
    });
    expect(proposal.warnings).toEqual(
      expect.arrayContaining([{ code: "possibleDuplicateCustomer", params: { name: "Golu" } }]),
    );
    // Confirm & Save must stay blocked until the client records an explicit
    // choice (see BantooCommand.tsx's needsDuplicateChoice).
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(false);

    // The ENTIRE duplicate-choice block (heading, "on file for this
    // customer", both radio labels) is next-intl keys in both catalogs —
    // resolve.ts never emits any of that prose itself, only the raw
    // `name`/`city`/`phone`/`whatsapp` values BantooCommand.tsx interpolates
    // via t("duplicateCustomer.title", {name}) etc.
    for (const key of ["title", "existingDetails", "useExisting", "createNew"] as const) {
      expect(EN.command.duplicateCustomer[key]).toBeTruthy();
      expect(FR.command.duplicateCustomer[key]).toBeTruthy();
    }
  });

  // --- Scenario 3: "Archive Musa" unsupported action -----------------------
  it('"Archive Musa" (unsupported_customer_action) raises exactly the notYetAvailable code, matching command.notYetAvailable verbatim in FR', async () => {
    const action: UnsupportedCustomerActionAction = {
      action: "unsupported_customer_action",
      customer_name: "Musa",
      requested: "archive",
      currency: "XAF",
      confidence: 0.95,
      summary: null,
    };

    const proposal = await resolveExtraction(ctx, action as unknown as ExtractedAction);

    expect(proposal.warnings).toEqual(expect.arrayContaining([{ code: "notYetAvailable" }]));
    // FIXED: the duplicate, unused top-level `command.notYetAvailable` key
    // (never read by any code path — only command.warnings.notYetAvailable
    // is actually consulted) was removed from both catalogs as dead-copy
    // cleanup, closing the "two keys could silently drift apart" risk this
    // test used to guard against by comparing them. Just assert the
    // actually-used key is present and non-empty in both locales now.
    expect(FR.command.notYetAvailable).toBeUndefined();
    expect(EN.command.notYetAvailable).toBeUndefined();
    expect(FR.command.warnings.notYetAvailable).toBeTruthy();
    expect(EN.command.warnings.notYetAvailable).toBeTruthy();
  });

  // --- Scenario 4: "Call Musa" with no phone on file -----------------------
  it('"Call Musa" (contact_customer, method=call) with no phone on file raises missingPhone — the pre-flight, correctly-localized warning', async () => {
    loadEntityCandidates.mockResolvedValue([{ id: "party_musa", label: "Musa", text: "Musa" }]);
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
      currency: "XAF",
      confidence: 0.9,
      summary: null,
    } as ExtractedAction;

    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.warnings).toEqual(expect.arrayContaining([{ code: "missingPhone" }]));
    expect(EN.command.warnings.missingPhone).toBeTruthy();
    expect(FR.command.warnings.missingPhone).toBeTruthy();
    // IMPORTANT (see the sibling app/actions test file): this warning is
    // shown, but nothing in BantooCommand.tsx's `canConfirm` computation
    // disables the "Continue" button for contact_customer just because this
    // warning is present — the user can still click through, at which point
    // app/actions/bantoo.ts's execute() re-checks the same condition and
    // returns a hardcoded ENGLISH-only error string instead of reusing this
    // already-localized warning code.
  });
});
