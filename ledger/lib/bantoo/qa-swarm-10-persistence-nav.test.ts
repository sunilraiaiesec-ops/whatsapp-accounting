// ---------------------------------------------------------------------------
// QA Swarm Track 10 — Persistence/Navigation Agent.
//
// Cross-cutting invariant under test: "if the UI says saved, a real record
// MUST exist with the fields shown in the confirmation plan, and navigation
// MUST point at that real record." This file runs resolveExtraction and
// executeBantooAction back-to-back against a SHARED, real in-memory Party
// store (the same pattern as app/actions/bantoo-create-customer.e2e.test.ts)
// — i.e. the REAL lib/parties.ts + lib/bantoo/resolve.ts +
// app/actions/bantoo.ts modules run exactly as production does; only the
// underlying `@/lib/prisma` client is faked. Every assertion reads the
// PERSISTED record back out of the fake store — never just the returned
// proposal/result object — because the bug class this track hunts for is
// specifically proposal/message vs reality drift.
//
// As originally written by this QA swarm lane, this file was READ-ONLY with
// respect to production source (see launch-qa/swarm-10-persistence-navigation.md
// for the full original findings writeup). The QA Reliability Swarm
// reconciliation pass has since fixed the create_supplier field-persistence
// bug this file documents (both path (a) and path (b) in SECTION 2 below);
// this file's own assertions were updated in that same pass to assert the
// corrected behavior instead of merely pinning the original bug.
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

// Every module below is UNMOCKED — lib/parties.ts, lib/bantoo/entities.ts,
// lib/bantoo/resolve.ts, and app/actions/bantoo.ts all run their real
// production logic. Only @/lib/prisma is a fake, so the real fuzzy-matching,
// party-creation/update, and proposal-building code paths execute exactly as
// they do for a live user.
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

function createSupplierAction(overrides: Partial<ExtractedAction> = {}): ExtractedAction {
  return {
    action: "create_supplier",
    supplier_name: "Alhaji Ibrahim",
    city: "Garoua",
    phone: "690123456",
    whatsapp: "690123456",
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

function createCustomerAction(overrides: Partial<ExtractedAction> = {}): ExtractedAction {
  return {
    action: "create_customer",
    customer_name: "Aisha Musa",
    city: "Garoua",
    phone: "690123456",
    whatsapp: "690123456",
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

// ===========================================================================
// SECTION 1 — Sanity baselines (should PASS): a brand-new party, zero
// existing records to match against, for both create_customer and
// create_supplier. Confirms the happy path is not broken before we chase the
// asymmetry bug below.
// ===========================================================================
describe("SANITY — create_supplier / create_customer brand-new party: message, nav target, and persisted record all agree", () => {
  it("create_supplier: a real Party row exists at the href id, with every plan-confirmed field actually persisted", async () => {
    const proposal = await resolveExtraction(ctx, createSupplierAction());
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);
    // Plan promises these fields will be set.
    expect(proposal.plan.map((s) => s.code)).toEqual(
      expect.arrayContaining(["createSupplier", "setCity", "setPhone", "setWhatsapp"]),
    );

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toMatch(/^\/suppliers\/party_\d+$/);

    const id = result.href.split("/").pop() ?? null;
    const saved = findParty(id);
    expect(saved).toBeDefined();
    expect(saved).toMatchObject({
      orgId: "org_A",
      name: "Alhaji Ibrahim",
      type: "supplier",
      city: "Garoua",
      phone: "690123456",
      whatsapp: "690123456",
    });

    const suppliers = await listParties("org_A", "supplier");
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0].id).toBe(id);
  });
});

// ===========================================================================
// SECTION 2 — ORIGINAL CRITICAL FINDING (now fixed, both paths): create_supplier
// "auto-attach to an existing supplier" used to silently drop every
// plan-confirmed profile field.
//
// Root cause: app/actions/bantoo.ts's `create_supplier` execute() case has
// TWO code paths that can end up acting on a pre-existing Party row instead
// of creating a new one:
//   (a) resolve.ts's own resolveParty() auto-selects an existing supplier by
//       a HIGH-confidence (>=90) name match, which sets `proposal.partyId`
//       — the client then submits that partyId, so execute() takes the
//       `if (input.partyId)` branch. FIXED: this branch now builds a full
//       `enrichment` object and calls `updateParty`, mirroring
//       create_customer's identical branch (QA Reliability Swarm Track 2/10).
//   (b) resolve.ts does NOT auto-select (createParty=true, partyId=null),
//       but by the time Confirm & Save runs, ensurePartyId()'s OWN internal
//       duplicate-safety-net (name/phone/whatsapp fuzzy match) finds a
//       HIGH-confidence match and silently returns that existing party's id
//       — WITHOUT ever calling createParty(). FIXED: ensurePartyId's
//       safety net now always fills in any city/phone/whatsapp/country the
//       existing record is missing, whether or not the match's role
//       (`type`) differs from the request's — the "both"-role upgrade
//       (QA Reliability Swarm Track 3) and this same-role enrichment share
//       the identical "never overwrite a value already on file" logic.
//
// Compare this to create_customer's mirror, which builds a full
// `enrichment` object and calls `updateParty` in the exact same situation —
// see SECTION 3 below for the side-by-side proof both party types now agree.
//
// User-facing impact (before the fix): the confirmation plan showed
// "✓ Set city: Garoua", "✓ Set phone: 690123456", "✓ Set WhatsApp:
// 690123456" as all "ready", the save succeeded with no error and no
// warning, navigation went to a REAL supplier profile — but that profile's
// city/phone/whatsapp stayed unchanged (still blank, or worse, silently
// stale from whatever they were before). Both paths below now persist
// exactly what the plan promised.
// ===========================================================================
describe("FIXED — create_supplier no longer drops city/phone/whatsapp/enrichment when it attaches to an EXISTING supplier", () => {
  it("(path a) resolve.ts auto-selects an EXACT-name-match existing supplier: plan promises setCity/setPhone/setWhatsapp as ready, and execute() now applies them", async () => {
    partyStore.push({
      id: "party_olam",
      orgId: "org_A",
      name: "Alhaji Ibrahim",
      type: "supplier",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    // Compound request: same name (exact match -> auto-selected by
    // resolve.ts), PLUS new city/phone/whatsapp the user clearly wants
    // saved on the record.
    const proposal = await resolveExtraction(ctx, createSupplierAction());

    // Confirms this test is exercising path (a): resolve.ts itself resolved
    // the existing party, not the create-new branch.
    expect(proposal.partyId).toBe("party_olam");
    expect(proposal.createParty).toBe(false);

    // The confirmation checklist the user actually sees promises these
    // fields will be saved.
    const planCodes = proposal.plan.map((s) => s.code);
    expect(planCodes).toEqual(expect.arrayContaining(["setCity", "setPhone", "setWhatsapp"]));

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/suppliers/party_olam");

    const saved = findParty("party_olam");
    expect(saved).toBeDefined();

    // The plan said these would be set, and now they are.
    expect(saved?.city).toBe("Garoua");
    expect(saved?.phone).toBe("690123456");
    expect(saved?.whatsapp).toBe("690123456");
  });

  it("(path b) execute-time-only match (resolve.ts saw zero candidates, ensurePartyId's own dup-safety-net finds one at save time): fields are now enriched, not silently dropped", async () => {
    // Resolve-time: genuinely no existing suppliers yet, so the proposal is
    // a plain "create new" (createParty=true, partyId=null) — this is
    // exactly what the client would submit.
    const proposal = await resolveExtraction(ctx, createSupplierAction());
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);
    const input = buildExecuteInput(proposal);

    // Between resolve and confirm, an identically-named supplier appears
    // (e.g. created in another tab/session, or the org's supplier list
    // changed) — a realistic race that resolve.ts's earlier snapshot can't
    // see, but ensurePartyId()'s OWN fresh duplicate check (bantoo.ts) runs
    // again right before writing.
    partyStore.push({
      id: "party_race",
      orgId: "org_A",
      name: "Alhaji Ibrahim",
      type: "supplier",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No second, duplicate "Alhaji Ibrahim" supplier was created — good,
    // ensurePartyId's safety net did its job of preventing a near-duplicate.
    const suppliers = await listParties("org_A", "supplier");
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0].id).toBe("party_race");
    expect(result.href).toBe("/suppliers/party_race");

    const saved = findParty("party_race");
    // Same fix as path (a): city/phone/whatsapp from the request are now
    // applied to the already-existing record via ensurePartyId's enrichment.
    expect(saved?.city).toBe("Garoua");
    expect(saved?.phone).toBe("690123456");
    expect(saved?.whatsapp).toBe("690123456");
  });

  it("FIXED: note AND city/phone/whatsapp are all persisted together for an exact-name-match existing supplier", async () => {
    partyStore.push({
      id: "party_olam2",
      orgId: "org_A",
      name: "Alhaji Ibrahim",
      type: "supplier",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const proposal = await resolveExtraction(
      ctx,
      createSupplierAction({ note: "Buys sesame every month" }),
    );
    expect(proposal.partyId).toBe("party_olam2");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);

    const saved = findParty("party_olam2");
    // The note is applied (appendPartyNote runs unconditionally in this
    // branch)...
    expect(saved?.notes).toContain("Buys sesame every month");
    // ...and — now that the create_supplier "use existing" branch builds a
    // full `enrichment` object mirroring create_customer's (see this file's
    // SECTION 3 control test) — city/phone/whatsapp are no longer silently
    // dropped alongside it. Previously this documented the reverse (a
    // "partial persistence" bug where the note landed but the contact
    // fields quietly didn't); both now save together.
    expect(saved?.city).toBe("Garoua");
    expect(saved?.phone).toBe("690123456");
  });
});

// ===========================================================================
// SECTION 3 — Control: create_customer's mirror of the exact same scenario
// works correctly. This proves the bug is a create_supplier-specific
// regression (missing enrichment logic), not a general fuzzy-match/party
// limitation — see bantoo.ts's `enrichment` object in the create_customer
// case vs. its total absence in create_supplier.
// ===========================================================================
describe("CONTROL — create_customer's identical scenario correctly enriches the existing record (proves the bug is supplier-specific)", () => {
  it("exact-name-match existing customer: city/phone/whatsapp ARE applied via updateParty, unlike create_supplier", async () => {
    partyStore.push({
      id: "party_musa",
      orgId: "org_A",
      name: "Aisha Musa",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const proposal = await resolveExtraction(ctx, createCustomerAction());
    expect(proposal.partyId).toBe("party_musa");
    expect(proposal.createParty).toBe(false);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    expect(result.ok && result.href).toBe("/customers/party_musa");

    const saved = findParty("party_musa");
    expect(saved?.city).toBe("Garoua");
    expect(saved?.phone).toBe("690123456");
    expect(saved?.whatsapp).toBe("690123456");
  });
});

// ===========================================================================
// SECTION 4 — edit_customer / edit_supplier: confirm an EDIT updates the
// EXISTING row's id (never creates a new one), and the persisted fields
// match exactly what was submitted. Also checks the "no second row created"
// invariant explicitly.
// ===========================================================================
describe("edit_customer / edit_supplier: updates the existing party's id in place, never creates a second row", () => {
  it("edit_customer updates the same id, persists new phone/city, and does not create a duplicate row", async () => {
    partyStore.push({
      id: "party_target",
      orgId: "org_A",
      name: "Musa Adamou",
      type: "customer",
      phone: "690000000",
      whatsapp: null,
      country: null,
      city: "Douala",
      email: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "edit_customer",
      customer_name: "Musa Adamou",
      new_name: null,
      city: "Maroua",
      phone: "690111111",
      whatsapp: null,
      email: null,
      note: null,
      post_action: null,
      unsupported_requests: null,
      confidence: 0.9,
      summary: null,
      currency: "XAF",
    } as ExtractedAction;

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_target");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The href's id must be the SAME id that was resolved/edited — never a
    // stale or different id.
    expect(result.href).toBe("/customers/party_target");

    const all = await listParties("org_A", "customer");
    expect(all).toHaveLength(1); // no new row created by an "edit"
    expect(all[0].id).toBe("party_target");
    expect(all[0].city).toBe("Maroua");
    expect(all[0].phone).toBe("690111111");
  });

  it("edit_supplier updates the same id, persists new phone/city, and does not create a duplicate row", async () => {
    partyStore.push({
      id: "party_sup_target",
      orgId: "org_A",
      name: "Olam",
      type: "supplier",
      phone: "690000000",
      whatsapp: null,
      country: null,
      city: "Douala",
      email: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "edit_supplier",
      supplier_name: "Olam",
      new_name: null,
      city: "Maroua",
      phone: "690222222",
      whatsapp: null,
      email: null,
      confidence: 0.9,
      summary: null,
      currency: "XAF",
    } as ExtractedAction;

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_sup_target");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/suppliers/party_sup_target");

    const all = await listParties("org_A", "supplier");
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("party_sup_target");
    expect(all[0].city).toBe("Maroua");
    expect(all[0].phone).toBe("690222222");
  });
});

// ===========================================================================
// SECTION 5 — add_customer_note / add_supplier_note: the note actually lands
// on the resolved party's real record, and navigation points at it.
// ===========================================================================
describe("add_customer_note / add_supplier_note: note is actually persisted on the resolved party, nav id matches", () => {
  it("add_customer_note appends to the real party's notes and hrefs to that same id", async () => {
    partyStore.push({
      id: "party_note_target",
      orgId: "org_A",
      name: "Halima Souleymane",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: "Existing note.",
    });

    const action: ExtractedAction = {
      action: "add_customer_note",
      customer_name: "Halima Souleymane",
      note: "Pays every Friday",
      confidence: 0.9,
      summary: null,
      currency: "XAF",
    } as ExtractedAction;

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_note_target");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/customers/party_note_target?tab=notes");

    const saved = findParty("party_note_target");
    expect(saved?.notes).toContain("Existing note.");
    expect(saved?.notes).toContain("Pays every Friday");
  });

  it("add_supplier_note appends to the real party's notes and hrefs to that same id", async () => {
    partyStore.push({
      id: "party_sup_note_target",
      orgId: "org_A",
      name: "Elhaji Adamou",
      type: "supplier",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "add_supplier_note",
      supplier_name: "Elhaji Adamou",
      note: "Delivers on Tuesdays",
      confidence: 0.9,
      summary: null,
      currency: "XAF",
    } as ExtractedAction;

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_sup_note_target");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toBe("/suppliers/party_sup_note_target?tab=notes");

    const saved = findParty("party_sup_note_target");
    expect(saved?.notes).toContain("Delivers on Tuesdays");
  });
});

// ===========================================================================
// SECTION 6 — view_customer / view_supplier: navigation-only actions must
// resolve to the REAL party's id, never a stale/placeholder route, even
// though nothing is written.
// ===========================================================================
describe("view_customer / view_supplier: navigation target always resolves to the real, currently-existing party id", () => {
  it("view_customer profile view hrefs to the actually-resolved customer id", async () => {
    partyStore.push({
      id: "party_view_target",
      orgId: "org_A",
      name: "Bello Hamadou",
      type: "customer",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "view_customer",
      customer_name: "Bello Hamadou",
      view: "profile",
      period_text: null,
      confidence: 0.9,
      summary: null,
      currency: "XAF",
    } as ExtractedAction;

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_view_target");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    expect(result.ok && result.href).toBe("/customers/party_view_target");
  });

  it("view_supplier ledger view hrefs to the actually-resolved supplier id with the right tab", async () => {
    partyStore.push({
      id: "party_sup_view_target",
      orgId: "org_A",
      name: "SOTRACO",
      type: "supplier",
      phone: null,
      whatsapp: null,
      country: null,
      city: null,
      email: null,
      notes: null,
    });

    const action: ExtractedAction = {
      action: "view_supplier",
      supplier_name: "SOTRACO",
      view: "ledger",
      confidence: 0.9,
      summary: null,
      currency: "XAF",
    } as ExtractedAction;

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBe("party_sup_view_target");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    expect(result.ok && result.href).toBe("/suppliers/party_sup_view_target?tab=transactions");
  });
});

// ===========================================================================
// SECTION 7 — Duplicate-resolution ID consistency (customer only — see
// report for why supplier has no equivalent duplicate-choice flow at all).
// Both the "use existing" and "create new" branches must end up with the
// href id pointing at the record that ACTUALLY reflects the choice made.
// ===========================================================================
describe("create_customer duplicateResolution: href id always matches the branch actually taken", () => {
  it("'use_existing' choice: href points at the pre-existing id, and exactly one customer named as such exists afterward", async () => {
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
    expect(result.ok && result.href).toBe("/customers/party_golu");

    const customers = await listParties("org_A", "customer");
    expect(customers).toHaveLength(1);
    expect(customers[0].id).toBe("party_golu");
  });

  it("'create_new' choice: href points at a BRAND NEW id, distinct from the pre-existing fuzzy-matched record, which remains untouched", async () => {
    partyStore.push({
      id: "party_golu2",
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
    expect(proposal.duplicateCandidate?.id).toBe("party_golu2");

    const createNewInput: ExecuteBantooInput = {
      ...buildExecuteInput(proposal),
      partyId: null,
      createParty: true,
      duplicateResolution: "create_new",
    };
    const result = await executeBantooAction(createNewInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).not.toBe("/customers/party_golu2");

    const newId = result.href.split("/").pop();
    const saved = findParty(newId ?? null);
    expect(saved).toMatchObject({ name: "Golu Transport", city: "Douala", phone: "690000001" });

    // Pre-existing record completely untouched.
    const untouched = findParty("party_golu2");
    expect(untouched).toMatchObject({ name: "golu", city: null, phone: null });
  });
});
