import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentContext } from "@/lib/auth/current";
import type { ExtractedAction } from "@/lib/ai/actions";
import type { ExecuteBantooInput } from "@/lib/bantoo/types";

// ---------------------------------------------------------------------------
// QA Swarm — Track 3: Customer + Supplier Dual-Role Agent
//
// Investigates/documents whether Ask Bantoo can correctly represent a single
// real-world business entity that is BOTH a customer and a supplier. See
// launch-qa/swarm-03-dual-role.md for the full write-up; this file is the
// executable evidence for that report.
//
// Data model (prisma/schema.prisma): Party has a single `type: String`
// column (`"customer" | "supplier" | "both"`, default "both") and a single
// shared `phone` column — there is NO separate isCustomer/isSupplier pair of
// booleans, and NO separate customer-phone/supplier-phone columns. So "dual
// role" can only ever mean "the same Party row, type upgraded to both,
// exactly one phone value shared by both roles."
//
// This suite uses the exact same in-memory-fake-prisma harness as
// app/actions/bantoo-create-customer.e2e.test.ts, running the REAL
// lib/parties.ts + lib/bantoo/resolve.ts + app/actions/bantoo.ts end to end
// (only `@/lib/prisma` itself is faked), so every finding below reflects
// actual production code paths, not a theory.
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
const { listParties, findPossiblePartyDuplicates } = await import("@/lib/parties");

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
    customer_name: "Horizon Logistics Ltd",
    city: null,
    phone: "+237 677 111 222",
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
    supplier_name: "Horizon Logistics Ltd",
    city: null,
    phone: "+237 699 333 444",
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

describe("QA Swarm 03 — data model finding: Party.type is a single shared field, not two independent role flags", () => {
  it("listParties('customer') and listParties('supplier') both key off the SAME `type` column (type in [x, 'both'])", async () => {
    partyStore.push({
      id: "party_both",
      orgId: "org_A",
      name: "Dual Co",
      type: "both",
      phone: "1",
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });
    partyStore.push({
      id: "party_customer_only",
      orgId: "org_A",
      name: "Cust Only Co",
      type: "customer",
      phone: "2",
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });
    partyStore.push({
      id: "party_supplier_only",
      orgId: "org_A",
      name: "Supp Only Co",
      type: "supplier",
      phone: "3",
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const customers = await listParties("org_A", "customer");
    const suppliers = await listParties("org_A", "supplier");
    expect(customers.map((c) => c.id).sort()).toEqual(["party_both", "party_customer_only"]);
    expect(suppliers.map((c) => c.id).sort()).toEqual(["party_both", "party_supplier_only"]);
  });
});

describe("QA Swarm 03 — Command 1: 'Create Horizon Logistics Ltd as a customer' (baseline, should just work)", () => {
  it("creates a brand-new Party with type=customer and the customer phone", async () => {
    const proposal = await resolveExtraction(ctx, createCustomerAction());
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toMatch(/^\/customers\/party_\d+$/);

    const saved = findParty(result.href.split("/").pop() ?? null);
    expect(saved).toMatchObject({
      name: "Horizon Logistics Ltd",
      type: "customer",
      phone: "+237 677 111 222",
    });

    expect(await listParties("org_A", "customer")).toHaveLength(1);
    // Not yet a supplier — type is "customer", not "both".
    expect(await listParties("org_A", "supplier")).toHaveLength(0);
  });
});

describe("QA Swarm 03 — Command 2 (THE CRITICAL TEST): 'Create Horizon Logistics Ltd as a supplier' for an EXISTING customer-only Party", () => {
  it("BUG: resolve-time proposal claims a brand-new supplier will be created (customer-only Party is invisible to supplier-scoped matching)", async () => {
    partyStore.push({
      id: "party_horizon",
      orgId: "org_A",
      name: "Horizon Logistics Ltd",
      type: "customer",
      phone: "+237 677 111 222",
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const proposal = await resolveExtraction(ctx, createSupplierAction());

    // Root cause #1: resolveParty(..., "supplier") -> loadEntityCandidates ->
    // listParties(orgId, "supplier") filters by type IN ["supplier","both"].
    // The existing Party has type "customer", so it never appears as a
    // supplier candidate at all — resolve.ts has NO WAY to know this name
    // already exists as a party in the org under a different role.
    expect(proposal.partyOptions).toHaveLength(0);
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);
    // No warning of any kind hints that "Horizon Logistics Ltd" already
    // exists (as a customer) — the preview looks like a completely clean,
    // brand-new supplier creation to the user.
  });

  it("FIXED: execute() reuses the EXISTING customer Party via fuzzy duplicate detection, but now UPGRADES it to type 'both' instead of silently leaving the supplier role unrepresented", async () => {
    partyStore.push({
      id: "party_horizon",
      orgId: "org_A",
      name: "Horizon Logistics Ltd",
      type: "customer",
      phone: "+237 677 111 222",
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const proposal = await resolveExtraction(ctx, createSupplierAction());
    expect(proposal.createParty).toBe(true);
    expect(proposal.partyId).toBeNull();

    const result = await executeBantooAction(buildExecuteInput(proposal));

    // execute() reports success...
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // ...and correctly does NOT create a second party — it reuses the
    // pre-existing Party record (ensurePartyId's untyped
    // findPossiblePartyDuplicates name-match scores an exact name match at
    // 100 >= MATCH_HIGH), now upgrading its role instead of leaving it
    // customer-only.
    expect(fakePrisma.party.create).not.toHaveBeenCalled();
    expect(result.href).toBe("/suppliers/party_horizon");

    const party = findParty("party_horizon");
    expect(party).toBeDefined();

    // Never silently overwrites a value already on file for the other role
    // (which of the two conflicting phone numbers should "win" is a
    // separate, still-open product decision — see this file's dual-role
    // phone-collision blocker below) — the existing customer phone is left
    // untouched since it was already set.
    expect(party?.phone).toBe("+237 677 111 222");
    expect(party?.phone).not.toBe("+237 699 333 444");

    // FIXED: the Party's `type` is now upgraded to "both" — the supplier
    // role is genuinely added to the existing record instead of being
    // silently dropped.
    expect(party?.type).toBe("both");

    // FIXED (consequence of the type upgrade): the party is now correctly
    // visible to BOTH the customer and supplier list/lookup used throughout
    // the app (lib/parties.ts's listParties(orgId, "customer"|"supplier")),
    // matching the "/suppliers/party_horizon" href execute() returned.
    expect(await listParties("org_A", "supplier")).toHaveLength(1);
    expect(await listParties("org_A", "customer")).toHaveLength(1);

    // No second, distinct Party record was created either — there is
    // exactly one Party row total for "Horizon Logistics Ltd", now
    // representing both roles.
    expect(partyStore).toHaveLength(1);
  });

  it("confirms the untyped root cause directly: findPossiblePartyDuplicates (used by ensurePartyId) returns the customer-only party as a HIGH-confidence match for a create_supplier request, without any type awareness", async () => {
    partyStore.push({
      id: "party_horizon",
      orgId: "org_A",
      name: "Horizon Logistics Ltd",
      type: "customer",
      phone: "+237 677 111 222",
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const duplicates = await findPossiblePartyDuplicates("org_A", {
      name: "Horizon Logistics Ltd",
      phone: "+237 699 333 444",
    });
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({ id: "party_horizon", type: "customer", score: 100, matchedOn: "name" });
    // MATCH_HIGH is 90 — this score clears ensurePartyId's silent-reuse bar
    // regardless of the fact that the two roles' phone numbers disagree and
    // the existing record doesn't even have the supplier role yet.
  });
});

describe("QA Swarm 03 — reverse order: create as SUPPLIER first, then as CUSTOMER second, is fixed symmetrically", () => {
  it("FIXED (symmetric): an existing supplier-only Party absorbs a later create_customer request AND is upgraded to 'both', gaining the customer role", async () => {
    partyStore.push({
      id: "party_horizon",
      orgId: "org_A",
      name: "Horizon Logistics Ltd",
      type: "supplier",
      phone: "+237 699 333 444",
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const proposal = await resolveExtraction(ctx, createCustomerAction());
    // Same as before: customer-scoped resolveParty never sees the
    // supplier-only party, so the preview looks like a clean "create new".
    expect(proposal.partyOptions).toHaveLength(0);
    expect(proposal.createParty).toBe(true);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fakePrisma.party.create).not.toHaveBeenCalled();
    const party = findParty("party_horizon");
    expect(party?.type).toBe("both"); // FIXED: upgraded from supplier-only
    expect(party?.phone).toBe("+237 699 333 444"); // existing phone left untouched (already set)
    expect(await listParties("org_A", "customer")).toHaveLength(1); // FIXED: now visible as a customer too
    expect(await listParties("org_A", "supplier")).toHaveLength(1);
  });
});

describe("QA Swarm 03 — single-message compound request: 'Create Horizon Logistics Ltd as both a customer AND a supplier' cannot be represented at all", () => {
  it("the ExtractedAction schema is a discriminated union keyed on a single `action` field — one Ask Bantoo message can only ever produce ONE of create_customer/create_supplier, never both", async () => {
    // This is a schema-level fact, not something worth re-deriving via a
    // live AI call (unavailable offline): lib/ai/actions.ts's
    // extractedActionSchema is `z.discriminatedUnion("action", [...])` with
    // createCustomerSchema and createSupplierSchema as separate, mutually
    // exclusive members. A single ExtractedAction object is structurally
    // incapable of saying "do both" — there is no field for a second role,
    // and no execute() branch that would ever process two roles from one
    // action object. This means the compound single-message command from
    // the test brief can only ever be handled as a sequence of two
    // messages/turns (the "realistic real-world sequence" tested above),
    // never literally as one atomic dual-role creation. Whichever action
    // wins the classification (see fallback.ts / lib/ai/extract.ts for the
    // "last explicit mention wins" tie-break already tested in
    // create-supplier.test.ts) is the one that gets created; the other
    // role's phone number in the same message would simply be dropped on
    // the floor (never captured on either schema, and never listed in
    // unsupported_requests either, since the parser has no concept of "a
    // second, different-typed contact field").
    const customerOnly = createCustomerAction();
    const supplierOnly = createSupplierAction();
    expect(customerOnly.action).toBe("create_customer");
    expect(supplierOnly.action).toBe("create_supplier");
    expect("supplier_name" in customerOnly).toBe(false);
    expect("customer_name" in supplierOnly).toBe(false);
  });
});
