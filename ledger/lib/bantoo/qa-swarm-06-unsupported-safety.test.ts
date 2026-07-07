// QA Reliability Swarm — Track 6: Unsupported-Action Safety Agent.
//
// Full findings write-up: launch-qa/swarm-06-unsupported-safety.md
//
// Scope: verifies that Ask Bantoo NEVER claims success for an action it did
// not actually perform, for the five known-unsupported customer/supplier/
// sales workflows (archive, reactivate, merge, upload_document, edit/void/
// email/apply_payment on a sales invoice) plus genuinely out-of-vocabulary
// commands (delete, weather, jokes). Exercises the REAL code paths:
//   - lib/command-parse.ts (parseBantooCommandText) + lib/bantoo/fallback.ts
//     (ruleBasedExtract) — the rule-based parser used whenever AI is not
//     configured/available (a live, common production path — see
//     app/api/bantoo/extract/route.ts).
//   - lib/bantoo/resolve.ts (resolveExtraction) — proposal building +
//     warning precedence (does "not available yet" ever get masked by a
//     "customer not found" warning, or vice versa).
//   - app/actions/bantoo.ts (executeBantooAction) — the actual write layer,
//     as defense-in-depth in case a client bug ever bypassed the UI's
//     hidden confirm button for an unsupported action.
//
// Per the swarm's isolation rules, this file only READS the shared
// lib/ai, lib/bantoo, lib/command-parse.ts, app/actions/bantoo.ts modules —
// nothing under test is modified here.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentContext } from "@/lib/auth/current";
import type { ExecuteBantooInput } from "@/lib/bantoo/types";
import type { ExtractedAction } from "@/lib/ai/actions";
import { parseBantooCommandText } from "@/lib/command-parse";
import { ruleBasedExtract } from "@/lib/bantoo/fallback";

// --- Shared mocks for resolve.ts + app/actions/bantoo.ts -------------------
// Mirrors the mocking style of lib/bantoo/resolve-customer.test.ts and
// app/actions/bantoo.test.ts so both modules can be exercised from one file
// without touching a real database.

const listInventoryItems = vi.fn();
const receiveGoods = vi.fn();
const createInventoryItem = vi.fn();
const loadEntityCandidates = vi.fn();
const bankAndCashAccounts = vi.fn();
const getCommandPatternSuggestions = vi.fn();
const getPartyContact = vi.fn();
const createPartySpy = vi.fn();
const updatePartySpy = vi.fn();
const updatePartyNotesSpy = vi.fn();
const getPartyBalanceSpy = vi.fn();
const getPartyPurchaseHistoryInRangeSpy = vi.fn();
const inventoryFindFirst = vi.fn();
const accountFindFirst = vi.fn();
const partyFindFirst = vi.fn();
const partyFindMany = vi.fn();
const createPayment = vi.fn();
const createSalesInvoice = vi.fn();
const createCreditNote = vi.fn();
const createRefundReceipt = vi.fn();
const createReceipt = vi.fn();
const createSalesReceipt = vi.fn();
const createPurchaseInvoice = vi.fn();

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inventoryItem: { findFirst: inventoryFindFirst },
    account: { findFirst: accountFindFirst },
    party: { findFirst: partyFindFirst, findMany: partyFindMany },
  },
}));

vi.mock("@/lib/inventory", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/inventory")>();
  return { ...actual, listInventoryItems, receiveGoods, createInventoryItem };
});

vi.mock("@/lib/bantoo/entities", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/bantoo/entities")>();
  return { ...actual, loadEntityCandidates: (...args: unknown[]) => loadEntityCandidates(...args) };
});

vi.mock("@/lib/accounts", () => ({
  bankAndCashAccounts: (...args: unknown[]) => bankAndCashAccounts(...args),
  paymentCounterpartAccounts: vi.fn().mockResolvedValue([]),
  receiptCounterpartAccounts: vi.fn().mockResolvedValue([]),
  receivableAccount: vi.fn().mockResolvedValue({ id: "acct_ar" }),
}));

vi.mock("@/lib/command-patterns", () => ({
  getCommandPatternSuggestions: (...args: unknown[]) => getCommandPatternSuggestions(...args),
  dueDateFromTerms: vi.fn(),
}));

vi.mock("@/lib/parties", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/parties")>();
  return {
    ...actual,
    getPartyContact: (...args: unknown[]) => getPartyContact(...args),
    createParty: createPartySpy,
    updateParty: updatePartySpy,
    updatePartyNotes: updatePartyNotesSpy,
  };
});

vi.mock("@/lib/party-ledger", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/party-ledger")>();
  return { ...actual, getPartyBalance: getPartyBalanceSpy };
});

vi.mock("@/lib/party-insights", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/party-insights")>();
  return { ...actual, getPartyPurchaseHistoryInRange: getPartyPurchaseHistoryInRangeSpy };
});

vi.mock("@/lib/documents", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/documents")>();
  return {
    ...actual,
    createPayment,
    createSalesInvoice,
    createCreditNote,
    createRefundReceipt,
    createReceipt,
    createSalesReceipt,
    createPurchaseInvoice,
  };
});

const { resolveExtraction } = await import("@/lib/bantoo/resolve");
const { executeBantooAction } = await import("@/app/actions/bantoo");

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

function baseFields() {
  return { confidence: 0.9, summary: null, currency: "XAF" } as const;
}

function draft(overrides: Record<string, string> = {}) {
  return {
    productName: "",
    barcode: "",
    sku: "",
    category: "",
    unit: "",
    quantity: "",
    costPrice: "",
    salePrice: "",
    taxRate: "",
    reorderLevel: "",
    amount: "",
    partyName: "",
    city: "",
    country: "",
    paymentMethod: "",
    description: "",
    date: "2026-01-05",
    dueDate: "",
    currency: "XAF",
    newName: "",
    phone: "",
    whatsapp: "",
    email: "",
    companyName: "",
    taxId: "",
    paymentTermsDays: "",
    creditLimit: "",
    defaultDiscount: "",
    preferredLanguage: "",
    preferredPaymentMethod: "",
    note: "",
    view: "",
    periodText: "",
    dateFrom: "",
    dateTo: "",
    contactMethod: "",
    requestedAction: "",
    postAction: "",
    ...overrides,
  };
}

beforeEach(() => {
  listInventoryItems.mockReset().mockResolvedValue([]);
  receiveGoods.mockReset();
  createInventoryItem.mockReset();
  loadEntityCandidates.mockReset().mockResolvedValue([]);
  bankAndCashAccounts.mockReset().mockResolvedValue([]);
  getCommandPatternSuggestions.mockReset().mockResolvedValue({});
  getPartyContact.mockReset().mockResolvedValue(null);
  createPartySpy.mockReset();
  updatePartySpy.mockReset();
  updatePartyNotesSpy.mockReset();
  getPartyBalanceSpy.mockReset();
  getPartyPurchaseHistoryInRangeSpy.mockReset();
  inventoryFindFirst.mockReset();
  accountFindFirst.mockReset();
  partyFindFirst.mockReset();
  partyFindMany.mockReset().mockResolvedValue([]);
  createPayment.mockReset();
  createSalesInvoice.mockReset();
  createCreditNote.mockReset();
  createRefundReceipt.mockReset();
  createReceipt.mockReset();
  createSalesReceipt.mockReset();
  createPurchaseInvoice.mockReset();
});

// Every "write" spy that should NEVER fire for a genuinely unsupported
// action, regardless of what the client sends. Used as a single assertion
// helper so no write path is accidentally left unchecked.
function expectNoWritesHappened() {
  expect(createPartySpy).not.toHaveBeenCalled();
  expect(updatePartySpy).not.toHaveBeenCalled();
  expect(updatePartyNotesSpy).not.toHaveBeenCalled();
  expect(receiveGoods).not.toHaveBeenCalled();
  expect(createInventoryItem).not.toHaveBeenCalled();
  expect(createPayment).not.toHaveBeenCalled();
  expect(createSalesInvoice).not.toHaveBeenCalled();
  expect(createCreditNote).not.toHaveBeenCalled();
  expect(createRefundReceipt).not.toHaveBeenCalled();
  expect(createReceipt).not.toHaveBeenCalled();
  expect(createSalesReceipt).not.toHaveBeenCalled();
  expect(createPurchaseInvoice).not.toHaveBeenCalled();
}

// ===========================================================================
// PART 1 — resolveExtraction: warning precedence + no premature party
// resolution for genuinely unsupported actions.
// ===========================================================================

describe("QA-06: unsupported actions never resolve a party or leak customerNotFound/supplierNotFound", () => {
  it("unsupported_customer_action (merge) with a NONEXISTENT customer name: warns notYetAvailable only, never customerNotFound (command #10 precedence check)", async () => {
    // loadEntityCandidates stays [] (mocked default) — "Nonexistent Corp"/
    // "Musa" would both fail to resolve if the code path ever tried.
    const action: ExtractedAction = {
      action: "unsupported_customer_action",
      customer_name: "Nonexistent Corp",
      requested: "merge",
      ...baseFields(),
    };
    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.warnings).toEqual([{ code: "notYetAvailable" }]);
    expect(proposal.warnings.some((w) => w.code === "customerNotFound")).toBe(false);
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(false);
    expect(proposal.partyOptions).toEqual([]);
    // The resolver never even queries for candidates for this action kind —
    // proof that "not available yet" can never be preceded/masked by a
    // confusing "customer not found" state.
    expect(loadEntityCandidates).not.toHaveBeenCalled();
  });

  it("unsupported_supplier_action (archive) with a NONEXISTENT supplier name: warns notYetAvailable only, never supplierNotFound", async () => {
    const action: ExtractedAction = {
      action: "unsupported_supplier_action",
      supplier_name: "Ghost Supplier Ltd",
      requested: "archive",
      ...baseFields(),
    };
    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.warnings).toEqual([{ code: "notYetAvailable" }]);
    expect(proposal.warnings.some((w) => w.code === "supplierNotFound")).toBe(false);
    expect(loadEntityCandidates).not.toHaveBeenCalled();
  });

  it("unsupported_sales_action (void) never resolves a customer/party even when a name is present", async () => {
    const action: ExtractedAction = {
      action: "unsupported_sales_action",
      customer_name: "Musa",
      requested: "void",
      ...baseFields(),
    };
    const proposal = await resolveExtraction(ctx, action);

    expect(proposal.warnings).toEqual([{ code: "notYetAvailable" }]);
    expect(proposal.partyId).toBeNull();
    expect(loadEntityCandidates).not.toHaveBeenCalled();
  });

  it("all three unsupported_* actions report action verbatim + never mark lowConfidence as the reason (high-confidence classification, per the module's design intent)", async () => {
    const cases: ExtractedAction[] = [
      { action: "unsupported_customer_action", customer_name: "Musa", requested: "archive", ...baseFields() },
      { action: "unsupported_supplier_action", supplier_name: "Musa", requested: "reactivate", ...baseFields() },
      { action: "unsupported_sales_action", customer_name: "Musa", requested: "apply_payment", ...baseFields() },
    ];
    for (const action of cases) {
      const proposal = await resolveExtraction(ctx, action);
      expect(proposal.action).toBe(action.action);
      expect(proposal.warnings.some((w) => w.code === "lowConfidence")).toBe(false);
    }
  });
});

// ===========================================================================
// PART 2 — executeBantooAction: defense-in-depth. Even if a client bug ever
// bypassed the UI's hidden confirm button (BantooCommand.tsx's canConfirm
// excludes these three actions), the server must still refuse to write
// anything and must never return ok:true.
// ===========================================================================

describe("QA-06: executeBantooAction defense-in-depth — no false success, no writes, even with a maximally adversarial payload", () => {
  it("unsupported_customer_action: refuses even when the payload claims createParty:true with a full profile (would-be false success if ever executed)", async () => {
    const input: ExecuteBantooInput = {
      action: "unsupported_customer_action",
      draft: draft({
        partyName: "Musa Trading",
        requestedAction: "merge",
        city: "Douala",
        phone: "690000000",
      }),
      partyId: null,
      createParty: true,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };
    const result = await executeBantooAction(input);

    expect(result).toEqual({ ok: false, error: "This action is not available yet." });
    expect(result.ok).toBe(false);
    expectNoWritesHappened();
    expect(partyFindFirst).not.toHaveBeenCalled();
  });

  it("unsupported_supplier_action: refuses even with an existing partyId attached", async () => {
    const input: ExecuteBantooInput = {
      action: "unsupported_supplier_action",
      draft: draft({ partyName: "Ghost Supplier Ltd", requestedAction: "archive" }),
      partyId: "sup_real_1",
      createParty: false,
      partyType: "supplier",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };
    const result = await executeBantooAction(input);

    expect(result).toEqual({ ok: false, error: "This action is not available yet." });
    expectNoWritesHappened();
    expect(partyFindFirst).not.toHaveBeenCalled();
  });

  it("unsupported_sales_action: refuses even with an amount + line account attached (would-be false invoice/void/refund)", async () => {
    const input: ExecuteBantooInput = {
      action: "unsupported_sales_action",
      draft: draft({ partyName: "Musa", amount: "50000", requestedAction: "void" }),
      partyId: "cust_1",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: "bank_1",
      lineAccountId: "acct_income_1",
    };
    const result = await executeBantooAction(input);

    expect(result).toEqual({ ok: false, error: "This action is not available yet." });
    expectNoWritesHappened();
  });

  it("result.ok is always false for all three unsupported kinds (never a truthy href a client could navigate to as if it succeeded)", async () => {
    const kinds = ["unsupported_customer_action", "unsupported_supplier_action", "unsupported_sales_action"] as const;
    for (const action of kinds) {
      const result = await executeBantooAction({
        action,
        draft: draft(),
        partyId: null,
        createParty: false,
        partyType: null,
        itemId: null,
        bankAccountId: null,
        lineAccountId: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeTruthy();
      }
    }
    expectNoWritesHappened();
  });
});

// ===========================================================================
// PART 3 — Rule-based parser (lib/command-parse.ts / lib/bantoo/fallback.ts):
// the code path actually exercised for text commands whenever AI is not
// configured, or the AI call fails/is rate-limited/out of credits (see
// app/api/bantoo/extract/route.ts — all real, common production states, not
// just a hypothetical). Captures BOTH the swarm's required test commands
// that correctly classify AND the ones that regress to "unknown" instead of
// the designed notYetAvailable messaging — see the report for severity/fix
// proposals on each documented gap.
// ===========================================================================

describe("QA-06: rule-based fallback parser — required swarm test commands (EN + FR)", () => {
  it("control group: commands that DO include the literal customer/client/invoice keyword classify correctly as unsupported", () => {
    const cases: Array<{ text: string; action: string; requested: string }> = [
      { text: "Merge customer Musa Trading and Musa Ltd.", action: "unsupported_customer_action", requested: "merge" },
      { text: "Archive customer Musa.", action: "unsupported_customer_action", requested: "archive" },
      { text: "Archiver le client Musa.", action: "unsupported_customer_action", requested: "archive" },
      { text: "Email the invoice to Musa.", action: "unsupported_sales_action", requested: "email" },
      { text: "Envoyer la facture par email à Musa.", action: "unsupported_sales_action", requested: "email" },
      { text: "Void invoice INV-00042.", action: "unsupported_sales_action", requested: "void" },
      { text: "Annuler la facture INV-00042.", action: "unsupported_sales_action", requested: "void" },
    ];
    for (const { text, action, requested } of cases) {
      const extracted = ruleBasedExtract(text);
      expect(extracted.action, `"${text}" should classify as ${action}`).toBe(action);
      if ("requested" in extracted) {
        expect(extracted.requested, `"${text}" should carry requested="${requested}"`).toBe(requested);
      }
    }
  });

  it("genuinely out-of-vocabulary commands never get misrouted to ANY action (no false success, no confusing wrong-action substitution) — swarm commands #3, #8, #9", () => {
    const cases = [
      "Delete Musa.",
      "Supprimer Musa.",
      "What's the weather in Douala?",
      "Tell me a joke.",
      "Delete the note I added for Musa",
    ];
    for (const text of cases) {
      const extracted = ruleBasedExtract(text);
      expect(extracted.action, `"${text}" should be "unknown", not silently mapped to a real action`).toBe("unknown");
    }
  });

  it("FIXED: naturally-phrased merge/archive/upload commands WITHOUT the literal customer/client keyword now correctly classify as unsupported_customer_action — swarm commands #1, #2, #4 (EN)", () => {
    // These are the swarm's own required EN test phrasings, taken verbatim.
    // FIXED: CUSTOMER_UNSUPPORTED_MERGE/ARCHIVE/UPLOAD/REACTIVATE in
    // lib/command-parse.ts no longer require the literal word
    // "customer(s)"/"client(s)" right after the verb — a natural
    // "Merge X and Y." / "Archive X." / "Upload this document for X's
    // profile." now correctly reaches unsupported_customer_action instead
    // of falling through to "unknown".
    const gapCases = [
      "Merge Musa Trading and Musa Ltd.",
      "Archive Musa.",
      "Upload this document for Musa's profile.",
    ];
    for (const text of gapCases) {
      const extracted = ruleBasedExtract(text);
      expect(extracted.action, `"${text}" should now be unsupported_customer_action`).toBe(
        "unsupported_customer_action",
      );
    }
  });

  it("FIXED: the FR equivalents of the same commands also now classify correctly — swarm commands #1, #2, #4 (FR)", () => {
    const gapCases = ["Fusionner Musa Trading et Musa Ltd.", "Archiver Musa.", "Téléverser ce document pour Musa."];
    for (const text of gapCases) {
      const extracted = ruleBasedExtract(text);
      expect(extracted.action, `"${text}" should now be unsupported_customer_action`).toBe(
        "unsupported_customer_action",
      );
    }
  });

  it("FIXED: FR merge pattern is now consistent with FR archive/reactivate — 'le client' (singular definite article) is accepted by all three", () => {
    // FIXED: CUSTOMER_UNSUPPORTED_MERGE's French pattern was simplified from
    // an "only les (plural)" article match to `(?:les?\s+)?`, covering both
    // "le client" (singular) and "les clients" (plural) consistently with
    // ARCHIVE/REACTIVATE.
    const archiveResult = ruleBasedExtract("Archiver le client Musa.");
    const merge = ruleBasedExtract("Fusionner le client Musa Trading et Musa Ltd.");

    expect(archiveResult.action).toBe("unsupported_customer_action");
    expect(merge.action, "FR merge/archive article handling is now consistent").toBe("unsupported_customer_action");
  });

  it("KNOWN GAP (unchanged, out of scope): 'apply payment' unsupported pattern still only matches an explicit invoice NUMBER, not a natural reference like \"Musa's oldest invoice\" — swarm command #7 — but it safely falls back to 'unknown' rather than being misclassified as a real transaction", () => {
    // By design (see lib/command-parse.ts's SalesActionKind doc comment)
    // unsupported_apply_payment is scoped to "one specific invoice NUMBER" —
    // this natural phrasing still isn't recognized as that specific
    // unsupported action. A regression guard was added alongside Fix G's
    // PAYMENT_PATTERNS noun-form additions (see detectIntent's "apply ...
    // payment ... invoice" check in lib/command-parse.ts) specifically so
    // this case keeps safely falling back to "unknown" instead of being
    // silently misclassified as a real expense/customer_payment transaction
    // — which the noun-form addition would otherwise have caused.
    const cases = [
      "Apply a partial payment allocation of 5000 XAF to Musa's oldest invoice.",
      "Appliquer une allocation de paiement partielle de 5000 XAF à la facture la plus ancienne de Musa.",
    ];
    for (const text of cases) {
      const extracted = ruleBasedExtract(text);
      expect(extracted.action).toBe("unknown");
    }
  });

  it("'unknown' from the rule parser never carries an action-specific payload that could be misread as a resolved action", () => {
    const extracted = ruleBasedExtract("Delete Musa.");
    expect(extracted).toEqual({ action: "unknown", currency: "XAF", confidence: 0, summary: null });
  });

  it("parseBantooCommandText now returns a customerAction payload for the merge/archive/upload commands (confirms detectIntent correctly resolves to customer_action, not a fallthrough to unknown)", () => {
    const nowFixedCases = ["Merge Musa Trading and Musa Ltd.", "Archive Musa.", "Upload this document for Musa's profile."];
    for (const text of nowFixedCases) {
      const parsed = parseBantooCommandText(text);
      expect(parsed.intent).toBe("customer_action");
      expect(parsed.customerAction).not.toBeNull();
      expect(parsed.supplierAction).toBeNull();
      expect(parsed.salesAction).toBeNull();
    }
  });
});

// ===========================================================================
// PART 4 — i18n copy-drift guard for notYetAvailable.
// ===========================================================================

describe("QA-06: notYetAvailable i18n copy-drift guard", () => {
  it("FIXED: the (unused, dead-copy) top-level command.notYetAvailable key was removed from both locales; only command.warnings.notYetAvailable remains, so there's nothing left to drift", async () => {
    // BantooCommand.tsx's warningText() only ever reads
    // `command.warnings.notYetAvailable` (via t(`warnings.${code}`)) — the
    // top-level `command.notYetAvailable` key in messages/en.json and
    // messages/fr.json was confirmed dead/duplicated copy and removed
    // outright, closing the "the two could silently drift apart" risk this
    // guard used to check for.
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    for (const locale of ["en", "fr"] as const) {
      const messages = JSON.parse(readFileSync(join(here, `../../messages/${locale}.json`), "utf8")) as {
        command: { notYetAvailable?: string; warnings: { notYetAvailable: string } };
      };
      expect(messages.command.notYetAvailable).toBeUndefined();
      expect(messages.command.warnings.notYetAvailable).toBeTruthy();
    }
  });
});
