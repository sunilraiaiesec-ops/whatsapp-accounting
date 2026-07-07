// ---------------------------------------------------------------------------
// QA Swarm Track 4 — Duplicate-Disambiguation Agent.
//
// Regression/verification suite for the create_customer duplicate-safety
// mechanism (resolve.ts's `possibleDuplicateCustomer` + `duplicateCandidate`,
// BantooCommand.tsx's radio choice, app/actions/bantoo.ts's
// `duplicateResolution`/`forceCreate` plumbing) across the scenarios required
// by the Track-4 test plan, plus a same-pattern check of create_supplier's
// (documented) lack of the equivalent mechanism.
//
// Follows the exact end-to-end pattern of
// app/actions/bantoo-create-customer.e2e.test.ts (read as the template): a
// minimal in-memory fake for `@/lib/prisma`, with the REAL
// lib/parties.ts + lib/bantoo/resolve.ts + app/actions/bantoo.ts running
// unmocked, so extraction -> resolve -> execute -> persisted-record
// read-back is exercised exactly like the production handleConfirm() call
// chain in components/BantooCommand.tsx.
//
// This file is ADDITIVE ONLY — per the swarm isolation rules, no existing
// source or test file is modified. Findings are written to
// launch-qa/swarm-04-duplicate-disambiguation.md.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentContext } from "@/lib/auth/current";
import type { ExtractedAction } from "@/lib/ai/actions";
import type { ExecuteBantooInput } from "@/lib/bantoo/types";

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

function createSupplierAction(overrides: Partial<ExtractedAction> = {}): ExtractedAction {
  return {
    action: "create_supplier",
    supplier_name: "Nile",
    city: null,
    phone: null,
    whatsapp: null,
    country: null,
    note: null,
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

// Mirrors BantooCommand.tsx's handleConfirm() exactly.
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

// ---------------------------------------------------------------------------
// Scenario 1 — Exact duplicate, no conflict: "Add Musa as a customer" against
// an existing bare "Musa" record. Per the fix design, an exact name match
// with no conflicting NEW field data is safe to auto-associate silently.
// ---------------------------------------------------------------------------
describe("Scenario 1: exact duplicate, no conflict", () => {
  it("auto-associates silently with no duplicate prompt", async () => {
    partyStore.push({
      id: "party_musa",
      orgId: "org_A",
      name: "Musa",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const proposal = await resolveExtraction(ctx, createCustomerAction({ customer_name: "Musa" }));

    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.createParty).toBe(false);
    expect(proposal.duplicateCandidate).toBeNull();
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(false);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    expect(await listParties("org_A", "customer")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Similar name: existing "Golu" (Garoua). Command creates
// "Golu Transport Ltd" in Ngoundéré with a phone — must trigger the
// duplicate prompt (fuzzy match, not exact).
// ---------------------------------------------------------------------------
describe("Scenario 2: similar (fuzzy, non-exact) name match", () => {
  it("triggers the duplicate-choice prompt instead of silently associating or creating", async () => {
    partyStore.push({
      id: "party_golu",
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

    const proposal = await resolveExtraction(
      ctx,
      createCustomerAction({
        customer_name: "Golu Transport Ltd",
        city: "Ngoundéré",
        phone: "+237699123456",
      }),
    );

    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(false);
    expect(proposal.duplicateCandidate?.id).toBe("party_golu");
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(true);

    // Attempting to execute with no explicit choice must never silently write.
    const blocked = await executeBantooAction(buildExecuteInput(proposal));
    expect(blocked.ok).toBe(false);
    expect(await listParties("org_A", "customer")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Same phone/near-identical name, different cities. Existing
// "Sunrise Foods" (Douala, phone +237611112222).
//   (a) new request also in Douala (same city) — should NOT be a forced
//       blind auto-merge; at minimum a confirm (duplicate prompt) is
//       acceptable, silent auto-association without any confirmation is not.
//   (b) new request in a DIFFERENT city — must show the duplicate-choice
//       prompt.
// ---------------------------------------------------------------------------
describe("Scenario 3: same near-identical name, phone on file — same city vs different city", () => {
  function seedSunrise(city: string | null) {
    partyStore.push({
      id: "party_sunrise",
      orgId: "org_A",
      name: "Sunrise Foods",
      type: "customer",
      phone: "+237611112222",
      whatsapp: null,
      country: null,
      city,
      email: null,
      notes: null,
    });
  }

  it("(a) existing is in the SAME city as the request — never a silent blind auto-merge", async () => {
    seedSunrise("Douala");

    const proposal = await resolveExtraction(
      ctx,
      createCustomerAction({ customer_name: "Sunrise Foods SARL", city: "Douala" }),
    );

    // The current implementation's safety rule is coarser than "same city is
    // safe": ANY non-exact name match always surfaces the duplicate prompt,
    // regardless of whether city matches or conflicts (see
    // isExactCustomerNameMatch in resolve.ts, which is checked independently
    // of customerConflictsWithExisting via the `||`). This is a STRICTER
    // outcome than "silently associate/update", which satisfies "not a
    // forced blind auto-merge" — but is worth flagging as a UX finding in
    // the report (the user is prompted even though nothing conflicts).
    expect(proposal.partyId).toBeNull();
    expect(proposal.duplicateCandidate?.id).toBe("party_sunrise");
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(true);

    // Whatever the UX nuance, the system must never have silently associated
    // or updated the existing record without an explicit confirmation.
    const blocked = await executeBantooAction(buildExecuteInput(proposal));
    expect(blocked.ok).toBe(false);
    const saved = findParty("party_sunrise");
    expect(saved?.name).toBe("Sunrise Foods"); // untouched
  });

  it("(b) existing is in a DIFFERENT city than the request — must prompt", async () => {
    seedSunrise("Yaoundé");

    const proposal = await resolveExtraction(
      ctx,
      createCustomerAction({ customer_name: "Sunrise Foods SARL", city: "Douala" }),
    );

    expect(proposal.partyId).toBeNull();
    expect(proposal.duplicateCandidate?.id).toBe("party_sunrise");
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(true);
  });

  // Additional finding: resolve.ts's create_customer duplicate detection is
  // NAME-based only (loadEntityCandidates -> resolveCandidates over
  // listParties' `name` field — see lib/bantoo/entities.ts). It never
  // cross-checks phone/email. When the name is genuinely dissimilar (so the
  // text matcher scores it low/no-match) but the PHONE is identical, no
  // duplicate signal is raised at all, and a true duplicate party is
  // silently created. This is a real gap distinct from scenarios 2/3 above
  // (which rely on name similarity to even trigger a match).
  it("GAP: same phone number but a dissimilar name is NOT detected as a possible duplicate at all", async () => {
    seedSunrise("Douala");

    const action = createCustomerAction({
      customer_name: "Boulangerie Etoile", // shares nothing textually with "Sunrise Foods"
      city: "Douala",
      phone: "+237611112222", // exact same phone as the existing "Sunrise Foods" record
    });
    const proposal = await resolveExtraction(ctx, action);

    // No name-based match at all, so no duplicate candidate is raised.
    expect(proposal.partyId).toBeNull();
    expect(proposal.duplicateCandidate).toBeNull();
    expect(proposal.createParty).toBe(true);
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(false);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);

    // A second party with the SAME phone number now silently exists —
    // demonstrating the phone-based dedup gap in resolve.ts's create_customer
    // duplicate-safety check (findPossiblePartyDuplicates DOES support exact
    // phone/whatsapp matching, but resolve.ts's resolveParty()/resolveCandidates
    // never calls it — only text-matches on name).
    const customers = await listParties("org_A", "customer");
    expect(customers).toHaveLength(2);
    const phones = customers.map((c) => c.phone);
    expect(phones.filter((p) => p === "+237611112222")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Person vs company: existing customer is an individual "Golu"
// (Garoua, no company name). Command creates "Golu Transport Ltd" (a company
// name, different city). Verify the system doesn't confuse them and forces
// the right disambiguation.
// ---------------------------------------------------------------------------
describe("Scenario 4: individual person record vs. an unrelated company name", () => {
  it("treats the company name as a conflicting fuzzy match requiring an explicit choice, never silently confuses them", async () => {
    partyStore.push({
      id: "party_golu_person",
      orgId: "org_A",
      name: "Golu",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: "Garoua",
      email: null,
      notes: null,
      // No companyName set — this is an individual, not a business record.
      companyName: null,
    });

    const proposal = await resolveExtraction(
      ctx,
      createCustomerAction({ customer_name: "Golu Transport Ltd", city: "Ngoundéré" }),
    );

    // The substring-containment matcher scores "Golu" vs "Golu Transport
    // Ltd" as a high-confidence match, auto-selecting the individual "Golu"
    // record — but the fix's isExactCustomerNameMatch check is not exact, so
    // it must surface the duplicate prompt rather than reuse the person
    // record for what is clearly a distinct company.
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(false);
    expect(proposal.duplicateCandidate).toEqual({
      id: "party_golu_person",
      name: "Golu",
      city: "Garoua",
      phone: null,
      whatsapp: null,
      country: null,
    });
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(true);

    // Nothing is silently written — the individual record is untouched and no
    // new party is created until the user explicitly chooses.
    const blocked = await executeBantooAction(buildExecuteInput(proposal));
    expect(blocked.ok).toBe(false);
    expect(findParty("party_golu_person")).toMatchObject({ name: "Golu", city: "Garoua" });
    expect(await listParties("org_A", "customer")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — User picks "Create as new": verify a NEW party id is created
// (never reused), with ALL submitted fields persisted.
// ---------------------------------------------------------------------------
describe("Scenario 5: 'create as new' choice", () => {
  it("creates a distinct new Party with every submitted field, leaving the pre-existing record untouched", async () => {
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
    expect(proposal.duplicateCandidate?.id).toBe("party_golu_garoua");

    const createNewInput: ExecuteBantooInput = {
      ...buildExecuteInput(proposal),
      partyId: null,
      createParty: true,
      duplicateResolution: "create_new",
    };
    const result = await executeBantooAction(createNewInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

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

    // Pre-existing record is completely untouched.
    expect(findParty("party_golu_garoua")).toMatchObject({
      name: "Golu",
      city: "Garoua",
      phone: null,
      whatsapp: null,
      email: null,
    });
    expect(await listParties("org_A", "customer")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — User picks "Use existing": verify the EXISTING party id is
// reused/updated, only fields present in THIS request change, and unrelated
// existing fields (e.g. a pre-existing email not mentioned this time) are
// never silently overwritten/blanked.
// ---------------------------------------------------------------------------
describe("Scenario 6: 'use existing' choice", () => {
  it("updates only the fields submitted this request; an unmentioned pre-existing email survives unchanged", async () => {
    partyStore.push({
      id: "party_golu_transport",
      orgId: "org_A",
      name: "Golu",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: "Garoua",
      email: "old-contact@golu.example",
      notes: null,
    });

    const action = createCustomerAction({
      customer_name: "Golu Transport Ltd",
      city: "Douala", // different city than the existing record — a conflicting field
      phone: "+237690000001",
      // email intentionally omitted — must NOT clear the existing email.
    });

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.duplicateCandidate?.id).toBe("party_golu_transport");

    const useExistingInput: ExecuteBantooInput = {
      ...buildExecuteInput(proposal),
      partyId: "party_golu_transport",
      createParty: false,
      duplicateResolution: "use_existing",
    };
    const result = await executeBantooAction(useExistingInput);
    expect(result.ok).toBe(true);
    expect(result.ok && result.href).toBe("/customers/party_golu_transport");

    const saved = findParty("party_golu_transport");
    // Fields actually submitted this request are applied...
    expect(saved?.name).toBe("Golu"); // "use existing" never renames the record
    expect(saved?.city).toBe("Douala");
    expect(saved?.phone).toBe("+237690000001");
    // ...but the pre-existing, unmentioned email is never silently blanked.
    expect(saved?.email).toBe("old-contact@golu.example");

    // No new party was created.
    expect(await listParties("org_A", "customer")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — Supplier side: repeat scenario 2's pattern for create_supplier.
// Documents whether ANY disambiguation occurs, or whether it silently
// auto-associates/misattaches like the customer bug did before its fix.
// ---------------------------------------------------------------------------
describe("Scenario 7: create_supplier — duplicate-safety parity check with create_customer", () => {
  it("FIXED: a fuzzy/substring supplier name match now surfaces a possibleDuplicateSupplier disambiguation prompt, exactly like create_customer", async () => {
    partyStore.push({
      id: "party_nile",
      orgId: "org_A",
      name: "Nile",
      type: "supplier",
      phone: null,
      whatsapp: null,
      country: null,
      city: "Douala",
      email: null,
      notes: null,
    });

    // Mirrors scenario 2's command pattern exactly, but for create_supplier:
    // "Create Nile Packaging SARL as a new supplier in Douala with phone
    // +237677889900." The existing "Nile" supplier is a different legal
    // entity than "Nile Packaging SARL" — resolve.ts's create_supplier case
    // now reuses the exact same isExactPartyNameMatch/
    // customerConflictsWithExisting guard as create_customer (see Scenario
    // 2), so this non-exact fuzzy name match must surface a
    // duplicateCandidate/possibleDuplicateSupplier prompt instead of
    // silently auto-associating.
    const action = createSupplierAction({
      supplier_name: "Nile Packaging SARL",
      city: "Douala",
      phone: "+237677889900",
    });

    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(false);
    expect(proposal.duplicateCandidate).toEqual({
      id: "party_nile",
      name: "Nile",
      city: "Douala",
      phone: null,
      whatsapp: null,
      country: null,
    });
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateSupplier")).toBe(true);

    // Confirm & Save stays blocked until the client records an explicit
    // "use existing" vs "create new" choice — nothing is silently written.
    const blocked = await executeBantooAction(buildExecuteInput(proposal));
    expect(blocked.ok).toBe(false);

    const suppliers = await listParties("org_A", "supplier");
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0]).toMatchObject({ id: "party_nile", name: "Nile", city: "Douala", phone: null });
  });

  it("for comparison: the exact same command pattern against create_customer correctly requires a choice (parity baseline)", async () => {
    partyStore.push({
      id: "party_nile_customer",
      orgId: "org_A",
      name: "Nile",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: "Douala",
      email: null,
      notes: null,
    });

    const action = createCustomerAction({
      customer_name: "Nile Packaging SARL",
      city: "Douala",
      phone: "+237677889900",
    });

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.duplicateCandidate?.id).toBe("party_nile_customer");
    expect(proposal.warnings.some((w) => w.code === "possibleDuplicateCustomer")).toBe(true);
  });
});
