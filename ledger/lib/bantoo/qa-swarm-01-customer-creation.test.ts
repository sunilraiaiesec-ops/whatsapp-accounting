import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentContext } from "@/lib/auth/current";
import type { ExtractedAction } from "@/lib/ai/actions";
import type { ExecuteBantooInput } from "@/lib/bantoo/types";

// ---------------------------------------------------------------------------
// Ask Bantoo Reliability Swarm — Track 1: Customer Creation Agent
//
// True end-to-end tests against the REAL resolveExtraction + executeBantooAction
// + persisted-record read-back pipeline, using the same minimal in-memory fake
// for `@/lib/prisma` that `app/actions/bantoo-create-customer.e2e.test.ts`
// (this file's template) uses. `lib/parties.ts` + `lib/bantoo/resolve.ts` +
// `app/actions/bantoo.ts` all run UNMOCKED — only the Prisma client itself is
// a fake — so the real duplicate-matching, party-creation, and
// proposal-building logic all run exactly as they do in production.
//
// This file intentionally bypasses `lib/ai/extract.ts` (no live AI calls
// possible in an offline test) and instead constructs the `ExtractedAction`
// the AI/rule-based extraction layer would produce for each quoted command,
// exactly like test A/B/C/D/E in the template file do — see this file's
// module doc comment there for why that's the correct boundary for these
// tests (extraction correctness itself needs a live AI call to verify).
//
// SWARM ISOLATION: this file only imports/exercises existing source files; it
// never modifies any of them. See launch-qa/swarm-01-customer-creation.md for
// the full findings report, including one confirmed real bug found while
// writing these tests (create_customer's `country` field is extracted by the
// AI schema but silently dropped before it ever reaches the Party record).
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
    // Real Prisma semantics: a key with value `undefined` means "not
    // provided, leave untouched" — only explicit `null` clears a field.
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
    confidence: 0.92,
    summary: null,
    currency: "XAF",
    ...overrides,
  } as ExtractedAction;
}

function findParty(id: string | null): FakeParty | undefined {
  return partyStore.find((p) => p.id === id);
}

// Mirrors BantooCommand.tsx's handleConfirm() exactly: builds the
// ExecuteBantooInput straight from the resolved proposal plus whatever the
// duplicate-choice radio holds.
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

function idFromHref(href: string): string | null {
  return href.split("/").pop() ?? null;
}

beforeEach(() => {
  partyStore = [];
  nextPartyId = 1;
  fakePrisma.party.findMany.mockClear();
  fakePrisma.party.findFirst.mockClear();
  fakePrisma.party.create.mockClear();
  fakePrisma.party.update.mockClear();
});

// ---------------------------------------------------------------------------
// Required command 1: "Add Musa as a customer."
// ---------------------------------------------------------------------------
describe('QA swarm 01 — command 1: "Add Musa as a customer." (simple, no extras)', () => {
  it("extraction/blend identifies create_customer with just a name; plan/preview shows only createCustomer; execute persists exactly that", async () => {
    const action = createCustomerAction({ customer_name: "Musa", city: null, phone: null, whatsapp: null });
    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.action).toBe("create_customer");
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);
    expect(proposal.duplicateCandidate).toBeNull();
    expect(proposal.draft.partyName).toBe("Musa");
    expect(proposal.plan.map((s) => s.code)).toEqual(["createCustomer"]);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.number).toBe("Musa");
    expect(result.href).toMatch(/^\/customers\/party_\d+$/);

    const saved = findParty(idFromHref(result.href));
    expect(saved).toMatchObject({
      name: "Musa",
      type: "customer",
      city: null,
      phone: null,
      whatsapp: null,
      // Company name still defaults to the customer's own name even for the
      // bare-minimum command — see execute()'s `companyName: draft.companyName.trim() || party.name`.
      companyName: "Musa",
      defaultCurrency: "XAF",
    });

    const customers = await listParties("org_A", "customer");
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe("Musa");
  });
});

// ---------------------------------------------------------------------------
// Required command 2: "Add Musa as a customer in Garoua."
// ---------------------------------------------------------------------------
describe('QA swarm 01 — command 2: "Add Musa as a customer in Garoua." (with city)', () => {
  it("city is extracted, shown in the plan as setCity, and persisted on the new Party", async () => {
    const action = createCustomerAction({ customer_name: "Musa", city: "Garoua" });
    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.draft.city).toBe("Garoua");
    expect(proposal.plan.map((s) => s.code)).toEqual(["createCustomer", "setCity"]);
    expect(proposal.plan.find((s) => s.code === "setCity")?.params).toEqual({ value: "Garoua" });

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saved = findParty(idFromHref(result.href));
    expect(saved).toMatchObject({ name: "Musa", city: "Garoua" });
  });
});

// ---------------------------------------------------------------------------
// Required command 3 & 4: full complex create_customer in English and French.
//
// "Create a new customer called Atlas Agro Trading Ltd in Bertoua, Cameroon.
// Phone +237 677 123 456, WhatsApp same number, email accounts@atlasagro.cm,
// payment terms 45 days, credit limit 8,500,000 XAF, tax ID CM-AT-2026-0187,
// and note "Release goods only after signed delivery note.""
//
// "Créer un nouveau client nommé Atlas Agro Trading Ltd à Bertoua, Cameroun.
// Téléphone +237 677 123 456. WhatsApp même numéro. Email
// accounts@atlasagro.cm. Conditions de paiement 45 jours. Limite de crédit
// 8 500 000 XAF. Numéro fiscal CM-AT-2026-0187. Note: Ne livrer qu'après bon
// de livraison signé."
//
// Every field EXCEPT country round-trips correctly through resolve ->
// execute -> persisted-record read-back (verified in the first test below).
// The dedicated second test isolates a confirmed, reproducible bug: `country`
// is part of createCustomerSchema (lib/ai/actions.ts), is documented in the
// extraction prompt (lib/ai/extract.ts) as an optional create_customer field,
// and the Party model (prisma/schema.prisma) + lib/parties.ts's
// createParty/updateParty already fully support a `country` column — but
// BantooDraft (lib/bantoo/types.ts) has no `country` field at all, so
// resolve.ts's create_customer case never carries `action.country` anywhere,
// and it is silently dropped before executeBantooAction ever sees it. See
// launch-qa/swarm-01-customer-creation.md for the precise fix.
// ---------------------------------------------------------------------------
describe("QA swarm 01 — commands 3 & 4: full complex create_customer (English + French)", () => {
  function atlasAction(overrides: Partial<ExtractedAction> = {}): ExtractedAction {
    return createCustomerAction({
      customer_name: "Atlas Agro Trading Ltd",
      city: "Bertoua",
      country: "Cameroon",
      phone: "+237 677 123 456",
      whatsapp: "+237 677 123 456",
      email: "accounts@atlasagro.cm",
      payment_terms_days: 45,
      credit_limit: 8500000,
      tax_id: "CM-AT-2026-0187",
      note: "Release goods only after signed delivery note.",
      ...overrides,
    });
  }

  it("English — every field the Party model supports (name, city, phone, whatsapp, email, taxId, paymentTermsDays, creditLimit, companyName, note) is proposed and persisted correctly", async () => {
    const action = atlasAction();
    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.action).toBe("create_customer");
    expect(proposal.createParty).toBe(true);
    expect(proposal.draft.email).toBe("accounts@atlasagro.cm");
    expect(proposal.draft.taxId).toBe("CM-AT-2026-0187");
    expect(proposal.draft.paymentTermsDays).toBe("45");
    expect(proposal.draft.creditLimit).toBe("8500000");

    const codes = proposal.plan.map((s) => s.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "createCustomer",
        "setCity",
        "setPhone",
        "setWhatsapp",
        "setEmail",
        "setTaxId",
        "setPaymentTerms",
        "setCreditLimit",
        "setNote",
      ]),
    );

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.number).toBe("Atlas Agro Trading Ltd");
    expect(result.href).toMatch(/^\/customers\/party_\d+$/);

    const saved = findParty(idFromHref(result.href));
    expect(saved).toBeDefined();
    expect(saved).toMatchObject({
      name: "Atlas Agro Trading Ltd",
      city: "Bertoua",
      phone: "+237 677 123 456",
      whatsapp: "+237 677 123 456",
      email: "accounts@atlasagro.cm",
      companyName: "Atlas Agro Trading Ltd",
      taxId: "CM-AT-2026-0187",
      paymentTermsDays: 45,
      creditLimit: 8500000n,
      defaultCurrency: "XAF",
    });
    expect(saved?.notes).toContain("Release goods only after signed delivery note.");
  });

  it("French — the same command in French produces the exact same persisted fields (the pipeline downstream of extraction is language-agnostic)", async () => {
    const action = atlasAction({
      country: "Cameroun",
      note: "Ne livrer qu'après bon de livraison signé.",
    });
    const proposal = await resolveExtraction(ctx, action);
    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saved = findParty(idFromHref(result.href));
    expect(saved).toMatchObject({
      name: "Atlas Agro Trading Ltd",
      city: "Bertoua",
      phone: "+237 677 123 456",
      whatsapp: "+237 677 123 456",
      email: "accounts@atlasagro.cm",
      companyName: "Atlas Agro Trading Ltd",
      taxId: "CM-AT-2026-0187",
      paymentTermsDays: 45,
      creditLimit: 8500000n,
      defaultCurrency: "XAF",
    });
    expect(saved?.notes).toContain("Ne livrer qu'après bon de livraison signé.");
  });

  // --- FIXED: country is now extracted, carried through, and persisted ---
  it("FIXED: `country` is accepted by createCustomerSchema, carried into BantooDraft, and persisted to the Party model (expected: 'Cameroon')", async () => {
    const action = atlasAction();
    const proposal = await resolveExtraction(ctx, action);

    // BantooDraft (lib/bantoo/types.ts) now has a `country` property, and
    // resolve.ts's create_customer case now sets
    // `draft.country = action.country ?? ""` exactly like
    // city/phone/whatsapp/email/taxId.
    expect(proposal.draft.country).toBe("Cameroon");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saved = findParty(idFromHref(result.href));
    // The persisted Party's `country` column (prisma/schema.prisma's Party
    // model, written to by the quick-add flow via lib/parties.ts's
    // createParty) is now correctly populated.
    expect(saved?.country).toBe("Cameroon");
  });

  it("FIXED: the plan/preview now correctly includes a 'setCountry' step whenever country is set, matching what actually gets persisted", async () => {
    const proposal = await resolveExtraction(ctx, atlasAction());
    const codes: string[] = proposal.plan.map((s) => s.code);
    expect(codes).toContain("setCountry");
  });
});

// ---------------------------------------------------------------------------
// Required command 5: default-value / persistence trap.
//
// "Create Test Non Default Customer in Douala. Payment terms 53 days.
// Credit limit 9,876,543 XAF. Default discount 11%. Phone +237 600 111 222.
// WhatsApp same. Email test.nondefault@example.com."
//
// Every number here is deliberately far from any plausible app default (30
// days / 0 credit limit / 0% discount), so a silent default-fallback bug
// cannot hide behind a coincidental match.
// ---------------------------------------------------------------------------
describe("QA swarm 01 — command 5: persistence trap (no silent default-fallback)", () => {
  it("every submitted numeric/contact field is the exact value read back from the persisted Party record — never a default", async () => {
    const action = createCustomerAction({
      customer_name: "Test Non Default Customer",
      city: "Douala",
      phone: "+237 600 111 222",
      whatsapp: "+237 600 111 222",
      email: "test.nondefault@example.com",
      payment_terms_days: 53,
      credit_limit: 9876543,
      default_discount: 11,
    });

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.draft.paymentTermsDays).toBe("53");
    expect(proposal.draft.creditLimit).toBe("9876543");
    expect(proposal.draft.defaultDiscount).toBe("11");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saved = findParty(idFromHref(result.href));
    expect(saved).toBeDefined();

    expect(saved?.city).toBe("Douala");
    expect(saved?.phone).toBe("+237 600 111 222");
    expect(saved?.whatsapp).toBe("+237 600 111 222");
    expect(saved?.email).toBe("test.nondefault@example.com");
    expect(saved?.paymentTermsDays).toBe(53);
    expect(saved?.creditLimit).toBe(9876543n);
    expect(saved?.defaultDiscount).toBe("11");

    // Explicit, loud regression guards against a silent default-fallback —
    // these fail even if the direct assertions above coincidentally looked
    // plausible.
    expect(saved?.paymentTermsDays).not.toBe(30);
    expect(saved?.creditLimit).not.toBe(0n);
    expect(saved?.defaultDiscount).not.toBe("0");
    expect(saved?.defaultDiscount).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Additional coverage beyond the required commands: company name field for a
// genuinely distinct business customer, and confirming the navigation
// target references the correct new party id.
// ---------------------------------------------------------------------------
describe("QA swarm 01 — additional coverage: distinct company_name, and confirmation href/id correctness", () => {
  it("a personal customer name with a genuinely DIFFERENT company_name persists companyName as the distinct value, not the personal name", async () => {
    // "Add John as a customer, he works at Acme Corp." — company_name is
    // distinct from customer_name, per createCustomerSchema's own doc
    // comment example in lib/ai/actions.ts.
    const action = createCustomerAction({
      customer_name: "John",
      company_name: "Acme Corp",
    });
    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.plan.map((s) => s.code)).toEqual(
      expect.arrayContaining(["createCustomer", "setCompanyName"]),
    );

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saved = findParty(idFromHref(result.href));
    expect(saved).toMatchObject({ name: "John", companyName: "Acme Corp" });
  });

  it("confirmation result references the exact new party id actually created, not a stale/reused one, across two distinct creates in the same session", async () => {
    const first = await resolveExtraction(ctx, createCustomerAction({ customer_name: "Halima Souleymane" }));
    const firstResult = await executeBantooAction(buildExecuteInput(first));
    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    const firstId = idFromHref(firstResult.href);

    const second = await resolveExtraction(ctx, createCustomerAction({ customer_name: "Adamou Bello" }));
    const secondResult = await executeBantooAction(buildExecuteInput(second));
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;
    const secondId = idFromHref(secondResult.href);

    expect(secondId).not.toBe(firstId);
    expect(secondResult.href).toBe(`/customers/${secondId}`);
    expect(secondResult.number).toBe("Adamou Bello");

    const customers = await listParties("org_A", "customer");
    expect(customers.map((c) => c.name).sort()).toEqual(["Adamou Bello", "Halima Souleymane"]);
  });
});
