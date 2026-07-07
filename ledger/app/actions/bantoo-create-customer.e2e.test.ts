import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentContext } from "@/lib/auth/current";
import type { ExtractedAction } from "@/lib/ai/actions";
import type { ExecuteBantooInput } from "@/lib/bantoo/types";

// ---------------------------------------------------------------------------
// Regression test for the live-user bug report: "I added the client again,
// it doesn't show in the customers list... it does identify all the fields,
// but when I go confirm and save, it doesn't do that."
//
// Every other test in this file/suite for create_customer either:
//   (a) mocks `createParty` outright and just asserts it was CALLED with the
//       right args (app/actions/bantoo.test.ts), or
//   (b) exercises resolve.ts's proposal-building in isolation with
//       loadEntityCandidates/getPartyContact mocked (resolve-customer.test.ts),
//       or
//   (c) exercises the duplicateResolution "use_existing"/"create_new" choice
//       specifically for a customer that DOES fuzzy-match an existing record
//       (the "Golu Transport" regression, app/actions/bantoo.test.ts).
//
// None of them run resolveExtraction and executeBantooAction back-to-back
// against a SHARED, real party store the way the actual app does, for the
// single most common real-world case: a brand-new customer name with ZERO
// existing parties to match against at all, so `duplicateResolution` is never
// set by the UI (no duplicate prompt is ever shown). This test closes that
// gap by using a minimal in-memory fake for `@/lib/prisma` and the REAL
// lib/parties.ts + lib/bantoo/resolve.ts + app/actions/bantoo.ts — the exact
// modules the UI's handleConfirm() call chain goes through — end to end.
// ---------------------------------------------------------------------------

type FakeParty = {
  id: string;
  orgId: string;
  name: string;
  type: string;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  email: string | null;
  notes: string | null;
  companyName?: string | null;
  taxId?: string | null;
  defaultCurrency?: string | null;
  paymentTermsDays?: number | null;
  creditLimit?: bigint | null;
  defaultDiscount?: string | null;
  preferredLanguage?: string | null;
  preferredPaymentMethod?: string | null;
};

let partyStore: FakeParty[] = [];
let nextPartyId = 1;

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === "object" && "in" in (cond as Record<string, unknown>)) {
      return ((cond as { in: unknown[] }).in).includes(value);
    }
    if (cond && typeof cond === "object" && "not" in (cond as Record<string, unknown>)) {
      return value !== (cond as { not: unknown }).not;
    }
    return value === cond;
  });
}

const fakePrisma = {
  party: {
    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      partyStore.filter((p) => matchesWhere(p, where)).sort((a, b) => a.name.localeCompare(b.name)),
    ),
    findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      partyStore.find((p) => matchesWhere(p, where)) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Omit<FakeParty, "id" | "email" | "notes"> }) => {
      const party: FakeParty = {
        id: `party_${nextPartyId++}`,
        email: null,
        notes: null,
        companyName: null,
        taxId: null,
        defaultCurrency: null,
        paymentTermsDays: null,
        creditLimit: null,
        defaultDiscount: null,
        preferredLanguage: null,
        preferredPaymentMethod: null,
        ...data,
      };
      partyStore.push(party);
      return party;
    }),
    // Mirrors real Prisma semantics: a key with value `undefined` means "not
    // provided, leave untouched" (only explicit `null` clears a field) — a
    // naive `{...row, ...data}` spread would incorrectly wipe every column
    // updateParty() didn't mention, since it always passes every key with
    // `undefined` for the ones it isn't changing.
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeParty> }) => {
      const idx = partyStore.findIndex((p) => p.id === where.id);
      if (idx === -1) return null;
      const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      partyStore[idx] = { ...partyStore[idx], ...defined };
      return partyStore[idx];
    }),
  },
  inventoryItem: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
  account: { findFirst: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: fakePrisma }));

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

// lib/parties.ts, lib/bantoo/entities.ts, and lib/bantoo/resolve.ts are all
// used UNMOCKED here — only the underlying `@/lib/prisma` client is a fake —
// so the real duplicate-matching, party-creation, and proposal-building logic
// all run exactly as they do in production.
const { resolveExtraction } = await import("@/lib/bantoo/resolve");
const { executeBantooAction } = await import("@/app/actions/bantoo");
const { listParties } = await import("@/lib/parties");

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

function createCustomerAction(overrides: Partial<ExtractedAction> = {}): ExtractedAction {
  return {
    action: "create_customer",
    customer_name: "Aïcha Boukar",
    city: "Maroua",
    phone: "690112233",
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
    confidence: 0.92,
    summary: null,
    currency: "XAF",
    ...overrides,
  } as ExtractedAction;
}

// Look up a party in the fake store the same way a "read the persisted
// record back" assertion would in production — by id, ignoring orgId scoping
// noise since every test here only ever uses one org.
function findParty(id: string | null): FakeParty | undefined {
  return partyStore.find((p) => p.id === id);
}

// Mirrors BantooCommand.tsx's handleConfirm() exactly: builds the
// ExecuteBantooInput straight from the resolved proposal plus whatever the
// duplicate-choice radio holds (unset/"" here, since no duplicate prompt is
// ever shown for a brand-new name — matching the plain "no duplicate" flow).
function buildExecuteInput(
  proposal: Awaited<ReturnType<typeof resolveExtraction>>,
  duplicateChoice: "" | "new" | "existing" = "",
): ExecuteBantooInput {
  return {
    action: proposal.action,
    draft: proposal.draft,
    partyId: proposal.partyId,
    createParty: proposal.createParty && !proposal.partyId,
    partyType: proposal.partyType,
    itemId: proposal.itemId,
    bankAccountId: proposal.bankAccountId,
    lineAccountId: proposal.lineAccountId,
    duplicateResolution:
      duplicateChoice === "new" ? "create_new" : duplicateChoice === "existing" ? "use_existing" : null,
  };
}

beforeEach(() => {
  partyStore = [];
  nextPartyId = 1;
  fakePrisma.party.findMany.mockClear();
  fakePrisma.party.findFirst.mockClear();
  fakePrisma.party.create.mockClear();
  fakePrisma.party.update.mockClear();
});

describe("create_customer end-to-end: brand-new customer, zero existing parties (no duplicate machinery involved)", () => {
  it("resolveExtraction proposes a complete, ready-to-save create_customer draft", async () => {
    const proposal = await resolveExtraction(ctx, createCustomerAction());

    expect(proposal.action).toBe("create_customer");
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);
    expect(proposal.duplicateCandidate).toBeNull();
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(false);
    expect(proposal.draft.partyName).toBe("Aïcha Boukar");
    expect(proposal.draft.city).toBe("Maroua");
    expect(proposal.draft.phone).toBe("690112233");
  });

  it("executeBantooAction with duplicateResolution omitted/undefined creates exactly one Party with every submitted field, and it is listable afterward", async () => {
    const proposal = await resolveExtraction(ctx, createCustomerAction());
    const input = buildExecuteInput(proposal);

    // The UI never sets this field for a brand-new name — no duplicate
    // prompt was ever shown, so it is genuinely absent, not just "".
    expect(input.duplicateResolution).toBeNull();

    const result = await executeBantooAction(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.number).toBe("Aïcha Boukar");
      expect(result.kind).toBe("create_customer");
      expect(result.href).toMatch(/^\/customers\/party_\d+$/);
    }

    // Exactly one new party was created — never zero (silent no-op) and
    // never merged into some pre-existing record.
    expect(fakePrisma.party.create).toHaveBeenCalledTimes(1);
    expect(partyStore).toHaveLength(1);
    expect(partyStore[0]).toMatchObject({
      orgId: "org_A",
      name: "Aïcha Boukar",
      type: "customer",
      city: "Maroua",
      phone: "690112233",
      whatsapp: null,
    });

    // Queryable/listable afterward, exactly like the real /customers page
    // does via listParties(ctx.orgId, "customer").
    const customers = await listParties("org_A", "customer");
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe("Aïcha Boukar");
  });

  it("also works with a note: the party is created AND the note is appended, with no duplicate machinery touched", async () => {
    const proposal = await resolveExtraction(
      ctx,
      createCustomerAction({ note: "Pays cash on delivery", post_action: "open_profile" }),
    );
    const input = buildExecuteInput(proposal);

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);

    const customers = await listParties("org_A", "customer");
    expect(customers).toHaveLength(1);
    expect(customers[0].notes).toContain("Pays cash on delivery");
  });

  it("a second, genuinely different customer created afterward does not collide with the first", async () => {
    const first = await resolveExtraction(ctx, createCustomerAction({ customer_name: "Musa Adamou" }));
    await executeBantooAction(buildExecuteInput(first));

    const second = await resolveExtraction(ctx, createCustomerAction({ customer_name: "Halima Souleymane" }));
    const secondInput = buildExecuteInput(second);
    expect(secondInput.duplicateResolution).toBeNull();
    const secondResult = await executeBantooAction(secondInput);

    expect(secondResult.ok).toBe(true);
    const customers = await listParties("org_A", "customer");
    expect(customers.map((c) => c.name).sort()).toEqual(["Halima Souleymane", "Musa Adamou"]);
  });
});

// ---------------------------------------------------------------------------
// Root-cause regression: the actual live-user bug. It was NOT the
// duplicateResolution/forceCreate plumbing from the most recent commit (the
// suite above proves that path is solid) — it was an older, unrelated gap in
// resolve.ts's create_customer duplicate-safety check, which only ever
// treated a match as needing confirmation when a submitted field actively
// CONFLICTED with the existing record. When there is no conflicting field at
// all (the single most common real case — a customer added with just a name,
// or with fields that happen not to clash), a mere fuzzy/substring name match
// (lib/bantoo/match.ts scores "golu" vs "golu transport" at 90, which clears
// the >= MATCH_HIGH auto-select bar) was silently treated as "this is the
// same contact" with zero confirmation and zero new party ever created —
// exactly reproducing "I added the client again and it doesn't show in the
// customers list."
// ---------------------------------------------------------------------------
describe("create_customer end-to-end: fuzzy-match false positive against an unrelated existing customer (the live-user bug)", () => {
  it("BEFORE the fix this would have silently attached to the wrong party; now it requires an explicit duplicate-choice instead of silently doing nothing", async () => {
    partyStore.push({
      id: "party_golu",
      orgId: "org_A",
      name: "golu",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    // No city/phone/whatsapp at all — the "field conflict" check alone can
    // never catch this, since there is nothing on either side to conflict.
    const proposal = await resolveExtraction(ctx, createCustomerAction({ customer_name: "Golu Transport", city: null, phone: null, whatsapp: null }));

    // The fix: a same-bucket substring match is never auto-associated
    // silently — it must surface exactly like a field conflict does.
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(false);
    expect(proposal.duplicateCandidate).toEqual({
      id: "party_golu",
      name: "golu",
      city: null,
      phone: null,
      whatsapp: null,
    });
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(true);

    // The UI disables Confirm & Save until a choice is made (see
    // needsDuplicateChoice in BantooCommand.tsx) — attempting to execute
    // with no choice made must never silently write anything.
    const blockedInput = buildExecuteInput(proposal);
    const blockedResult = await executeBantooAction(blockedInput);
    expect(blockedResult.ok).toBe(false);
    expect(await listParties("org_A", "customer")).toHaveLength(1); // unchanged

    // Once the user explicitly picks "create as a new customer with the same
    // name" (exactly like the Golu Transport regression test in
    // app/actions/bantoo.test.ts), a genuinely distinct party is created and
    // the pre-existing "golu" record is left completely untouched.
    const createNewInput: ExecuteBantooInput = {
      ...blockedInput,
      partyId: null,
      createParty: true,
      duplicateResolution: "create_new",
    };
    const result = await executeBantooAction(createNewInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.number).toBe("Golu Transport");
    }

    const customers = await listParties("org_A", "customer");
    expect(customers.map((c) => c.name).sort()).toEqual(["Golu Transport", "golu"]);
  });

  it("exact name match (no conflicting fields) still auto-associates silently, with no prompt — the legitimate 're-add the same contact' case is unaffected", async () => {
    partyStore.push({
      id: "party_musa",
      orgId: "org_A",
      name: "Musa Adamou",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const proposal = await resolveExtraction(
      ctx,
      createCustomerAction({ customer_name: "Musa Adamou", city: null, phone: null, whatsapp: null }),
    );

    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.createParty).toBe(false);
    expect(proposal.duplicateCandidate).toBeNull();
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(false);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    // No new party — the exact-match contact was reused, as intended.
    expect(await listParties("org_A", "customer")).toHaveLength(1);
  });

  it("'use existing' choice for a fuzzy (non-exact) match enriches the existing party's empty fields and creates no new row", async () => {
    partyStore.push({
      id: "party_golu",
      orgId: "org_A",
      name: "golu",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const proposal = await resolveExtraction(
      ctx,
      createCustomerAction({ customer_name: "Golu Transport", city: "Douala", phone: "690000001", whatsapp: null }),
    );
    expect(proposal.duplicateCandidate?.id).toBe("party_golu");

    const useExistingInput: ExecuteBantooInput = {
      ...buildExecuteInput(proposal),
      partyId: "party_golu",
      createParty: false,
      duplicateResolution: "use_existing",
    };
    const result = await executeBantooAction(useExistingInput);
    expect(result.ok).toBe(true);

    const customers = await listParties("org_A", "customer");
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ id: "party_golu", name: "golu", city: "Douala", phone: "690000001" });
  });
});

// ---------------------------------------------------------------------------
// Launch Bug Fix Sprint regression tests (A-E) — closes the live bug report
// that credit limit / payment terms / email / tax ID / company name / note
// were silently dropped somewhere in the create_customer pipeline even
// though they were extracted. Each test below starts from an
// ExtractedAction exactly as the (schema-updated) AI extraction layer would
// return it for the quoted command — see lib/ai/actions.ts's
// createCustomerSchema and lib/ai/extract.ts's system prompt for the
// extraction-side half of this fix, which is not independently testable
// here without a live AI call — and runs the REAL resolveExtraction +
// executeBantooAction + persisted-record read-back, exactly like the rest of
// this file, to prove nothing is dropped downstream of extraction.
// ---------------------------------------------------------------------------
describe("Launch Bug Fix Sprint regression tests: create_customer field persistence (A-E)", () => {
  it("A. full create customer (English) — every extracted field survives resolve -> execute -> persisted-record read-back", async () => {
    // "Create Golu Logistics Ltd as a new customer in Ngoundéré, Cameroon.
    // Phone +237 699 123 456. WhatsApp same. Email accounts@golulogistics.cm.
    // Payment terms 47 days. Credit limit 12,345,678 XAF. Default discount
    // 7%. Tax ID CM-NGA-99821. Note: Only release goods after signed
    // delivery note."
    const action = createCustomerAction({
      customer_name: "Golu Logistics Ltd",
      city: "Ngoundéré",
      country: "Cameroon",
      phone: "+237 699 123 456",
      whatsapp: "+237 699 123 456",
      email: "accounts@golulogistics.cm",
      payment_terms_days: 47,
      credit_limit: 12345678,
      default_discount: 7,
      tax_id: "CM-NGA-99821",
      note: "Only release goods after signed delivery note.",
    });

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.action).toBe("create_customer");
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);
    // Draft must carry every new field forward (Requirement: the draft/proposal
    // type must carry these fields, not just city/phone/whatsapp/note).
    expect(proposal.draft.email).toBe("accounts@golulogistics.cm");
    expect(proposal.draft.taxId).toBe("CM-NGA-99821");
    expect(proposal.draft.paymentTermsDays).toBe("47");
    expect(proposal.draft.creditLimit).toBe("12345678");
    expect(proposal.draft.defaultDiscount).toBe("7");
    // The confirmation checklist must show EVERY field Bantoo intends to
    // save — not just city/phone/whatsapp/note (Requirement #9).
    const codes = proposal.plan.map((step) => step.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "setCity",
        "setPhone",
        "setWhatsapp",
        "setEmail",
        "setTaxId",
        "setPaymentTerms",
        "setCreditLimit",
        "setDiscount",
        "setNote",
      ]),
    );

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.number).toBe("Golu Logistics Ltd");
    expect(result.href).toMatch(/^\/customers\/party_\d+$/);

    const saved = findParty(result.href.split("/").pop() ?? null);
    expect(saved).toBeDefined();
    // Every extracted field, persisted — the exact bug report's checklist:
    // credit limit, payment terms, email, tax ID, company name, and note.
    expect(saved).toMatchObject({
      name: "Golu Logistics Ltd",
      city: "Ngoundéré",
      phone: "+237 699 123 456",
      whatsapp: "+237 699 123 456",
      email: "accounts@golulogistics.cm",
      // Company name defaults to the customer's own name for a brand-new
      // business customer when no DISTINCT company name was extracted —
      // closes "Company name field appears blank".
      companyName: "Golu Logistics Ltd",
      taxId: "CM-NGA-99821",
      paymentTermsDays: 47,
      creditLimit: 12345678n,
      defaultDiscount: "7",
      defaultCurrency: "XAF",
    });
    expect(saved?.notes).toContain("Only release goods after signed delivery note.");
  });

  it("B. full create customer (French) — same command in French produces the exact same persisted fields", async () => {
    // "Créer un nouveau client nommé Golu Logistics Ltd à Ngoundéré,
    // Cameroun. Téléphone +237 699 123 456. WhatsApp même numéro. Email
    // accounts@golulogistics.cm. Conditions de paiement 47 jours. Limite de
    // crédit 12 345 678 XAF. Remise par défaut 7 %. Numéro fiscal
    // CM-NGA-99821. Note: Ne livrer qu'après bon de livraison signé."
    //
    // The rule-based (no-AI) fallback's new field extractors are
    // deliberately English-only (see extractCreateCustomerEmail's doc
    // comment in lib/command-parse.ts) — French phrasing for these fields
    // is handled by the AI extraction prompt (lib/ai/extract.ts), which is
    // not independently callable in this offline test suite. This test
    // therefore starts from the ExtractedAction the AI layer produces for
    // this French command (per the updated prompt) and proves the SAME
    // resolve -> execute -> persisted-record pipeline as test A never
    // depends on the source language.
    const action = createCustomerAction({
      customer_name: "Golu Logistics Ltd",
      city: "Ngoundéré",
      country: "Cameroun",
      phone: "+237 699 123 456",
      whatsapp: "+237 699 123 456",
      email: "accounts@golulogistics.cm",
      payment_terms_days: 47,
      credit_limit: 12345678,
      default_discount: 7,
      tax_id: "CM-NGA-99821",
      note: "Ne livrer qu'après bon de livraison signé.",
    });

    const proposal = await resolveExtraction(ctx, action);
    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saved = findParty(result.href.split("/").pop() ?? null);
    expect(saved).toMatchObject({
      name: "Golu Logistics Ltd",
      city: "Ngoundéré",
      phone: "+237 699 123 456",
      whatsapp: "+237 699 123 456",
      email: "accounts@golulogistics.cm",
      companyName: "Golu Logistics Ltd",
      taxId: "CM-NGA-99821",
      paymentTermsDays: 47,
      creditLimit: 12345678n,
      defaultDiscount: "7",
      defaultCurrency: "XAF",
    });
    expect(saved?.notes).toContain("Ne livrer qu'après bon de livraison signé.");
  });

  it("C. duplicate 'create as new' path — a distinct new Party ID is created with every extracted field persisted, the unrelated existing record is untouched", async () => {
    partyStore.push({
      id: "party_golu_garoua",
      orgId: "org_A",
      name: "Golu",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: "Garoua",
      email: null,
      notes: null,
    });

    // "Create Golu Transport Ltd as a new customer in Ngoundéré with phone
    // +237699123456, WhatsApp same, email accounts@golutransport.cm,
    // payment terms 47 days, credit limit 12345678 XAF, note: prefers
    // WhatsApp." User chooses "Create as a new customer with the
    // same/similar name."
    const action = createCustomerAction({
      customer_name: "Golu Transport Ltd",
      city: "Ngoundéré",
      phone: "+237699123456",
      whatsapp: "+237699123456",
      email: "accounts@golutransport.cm",
      payment_terms_days: 47,
      credit_limit: 12345678,
      note: "prefers WhatsApp",
    });

    const proposal = await resolveExtraction(ctx, action);
    // A fuzzy/substring name match against the unrelated "Golu"/Garoua
    // record, PLUS a conflicting city, must surface the duplicate prompt
    // rather than silently reusing or silently creating.
    expect(proposal.duplicateCandidate?.id).toBe("party_golu_garoua");
    expect(proposal.partyId).toBeNull();

    // The user's explicit "create as new" choice, mirroring exactly how
    // BantooCommand.tsx builds the execute input once that radio is picked.
    const createNewInput: ExecuteBantooInput = {
      ...buildExecuteInput(proposal),
      partyId: null,
      createParty: true,
      duplicateResolution: "create_new",
    };
    const result = await executeBantooAction(createNewInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.number).toBe("Golu Transport Ltd");
    // Distinct from the existing Golu/Garoua party — never reattached.
    expect(result.href).not.toBe("/customers/party_golu_garoua");

    const newId = result.href.split("/").pop() ?? null;
    expect(newId).not.toBe("party_golu_garoua");

    const saved = findParty(newId);
    expect(saved).toMatchObject({
      name: "Golu Transport Ltd",
      city: "Ngoundéré",
      phone: "+237699123456",
      whatsapp: "+237699123456",
      email: "accounts@golutransport.cm",
      companyName: "Golu Transport Ltd",
      paymentTermsDays: 47,
      creditLimit: 12345678n,
    });
    expect(saved?.notes).toContain("prefers WhatsApp");

    // The pre-existing, unrelated "Golu"/Garoua record is completely
    // untouched — no fields bled across from the new request.
    const untouched = findParty("party_golu_garoua");
    expect(untouched).toMatchObject({ name: "Golu", city: "Garoua", phone: null, email: null });

    const customers = await listParties("org_A", "customer");
    expect(customers.map((c) => c.name).sort()).toEqual(["Golu", "Golu Transport Ltd"]);
  });

  it("D. duplicate 'use existing' path — only the intentionally-submitted fields are updated, an unrelated pre-existing field (email) is never silently blanked", async () => {
    partyStore.push({
      id: "party_golu_transport",
      orgId: "org_A",
      name: "Golu Transport Ltd",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: "Ngoundéré",
      email: "existing-office@golutransport.cm",
      notes: null,
    });

    // "Add Golu Transport Ltd as a customer with phone +237699123456 and
    // payment terms 47 days." The name is an EXACT match against the
    // existing record, so resolve.ts's isExactCustomerNameMatch auto-selects
    // it with no duplicate prompt at all (see resolve.ts's doc comment on
    // that function) — confirming & saving here IS the "use existing
    // customer" outcome the sprint's test D describes.
    const action = createCustomerAction({
      customer_name: "Golu Transport Ltd",
      city: null,
      phone: "+237699123456",
      whatsapp: null,
      email: null,
      payment_terms_days: 47,
      credit_limit: null,
      note: null,
    });

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_golu_transport");
    expect(proposal.createParty).toBe(false);
    expect(proposal.duplicateCandidate).toBeNull();

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/customers/party_golu_transport");

    const saved = findParty("party_golu_transport");
    // Only the fields actually submitted this request (phone, payment
    // terms) were updated.
    expect(saved?.phone).toBe("+237699123456");
    expect(saved?.paymentTermsDays).toBe(47);
    // The pre-existing email, never mentioned in this request, survives
    // untouched — the exact "silent overwrite" this requirement guards
    // against.
    expect(saved?.email).toBe("existing-office@golutransport.cm");
    // No new party was created — exactly one customer named "Golu
    // Transport Ltd" exists before and after.
    const customers = await listParties("org_A", "customer");
    expect(customers).toHaveLength(1);
  });

  it("E. default-value trap — persisted values are the SUBMITTED numbers, not silently the app's defaults (30 days / 0 credit limit / 0% discount)", async () => {
    // "Create Test Non Default Customer in Douala. Payment terms 53 days.
    // Credit limit 9876543 XAF. Default discount 11%." None of these three
    // numbers may collide with a plausible default, so a silent
    // default-fallback bug cannot hide behind a coincidental match.
    const action = createCustomerAction({
      customer_name: "Test Non Default Customer",
      city: "Douala",
      phone: null,
      whatsapp: null,
      email: null,
      payment_terms_days: 53,
      credit_limit: 9876543,
      default_discount: 11,
      note: null,
    });

    const proposal = await resolveExtraction(ctx, action);
    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saved = findParty(result.href.split("/").pop() ?? null);
    expect(saved).toBeDefined();

    // The actual assertions the bug report demands:
    expect(saved?.paymentTermsDays).toBe(53);
    expect(saved?.creditLimit).toBe(9876543n);
    expect(saved?.defaultDiscount).toBe("11");

    // Explicit, loud regression guards: if execute() ever silently fell
    // back to the app's defaults instead of the submitted values (the
    // exact bug reported — "shows 30, but that's also the default"), THESE
    // assertions fail even though the ones above might coincidentally
    // still look plausible.
    expect(saved?.paymentTermsDays).not.toBe(30);
    expect(saved?.creditLimit).not.toBe(0n);
    expect(saved?.defaultDiscount).not.toBe("0");
    expect(saved?.defaultDiscount).not.toBeNull();
  });
});
