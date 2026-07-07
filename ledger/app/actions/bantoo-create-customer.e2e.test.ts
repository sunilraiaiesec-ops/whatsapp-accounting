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
      const party: FakeParty = { id: `party_${nextPartyId++}`, email: null, notes: null, ...data };
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
    post_action: null,
    unsupported_requests: null,
    confidence: 0.92,
    summary: null,
    currency: "XAF",
    ...overrides,
  } as ExtractedAction;
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
