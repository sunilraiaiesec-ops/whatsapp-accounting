import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecuteBantooInput } from "@/lib/bantoo/types";

// ---------------------------------------------------------------------------
// QA Swarm Track 9 — Language Consistency Agent.
//
// ROOT CAUSE UNDER TEST: app/actions/bantoo.ts's executeBantooAction() never
// imports next-intl/server, never reads the request's locale, and returns
// every success `message` / failure `error` string as a HARDCODED ENGLISH
// LITERAL (e.g. "This customer has no phone number on file. Add one first.",
// "${name} was updated.", "This action is not available yet."). It is the
// only leg of the Ask Bantoo pipeline (extract → resolve → confirm-form →
// execute) that produces user-visible text outside the next-intl catalogs.
//
// This matters concretely because BantooCommand.tsx's successMessage()
// helper is:
//
//   function successMessage(): string {
//     if (!success) return "";
//     if (success.message) return success.message;   // <-- always wins
//     if (success.kind === "edit_customer") return t("successCustomerUpdated", ...);
//     ...
//   }
//
// `success.message` is exactly the hardcoded string this file proves
// executeBantooAction always sets for edit_customer/add_customer_note/
// customer_balance/customer_query/supplier equivalents — so the correctly
// translated `command.successCustomerUpdated` / `command.successNoteAdded`
// FR strings that DO exist in messages/fr.json are dead code: the server's
// English message always wins over them, in EVERY locale, every time.
//
// Failure `error` strings have no such fallback at all — they are rendered
// directly as `{error}` in BantooCommand.tsx with no t() call whatsoever, so
// every one of these (missing phone/whatsapp/email, "not found", "not
// available yet", validation messages, etc.) leaks English text into a
// French UI whenever that code path is reached.
//
// PROPOSED FIX (documented here since this swarm lane must not touch
// app/actions/bantoo.ts, lib/bantoo/*, or messages/*.json directly):
//   1. Give executeBantooAction() a `locale` parameter (or read it via
//      next-intl/server's getLocale()+getTranslations() inside the server
//      action, which already has access to cookies()).
//   2. Replace every literal string in BantooExecuteResult.error/.message
//      with a stable code (mirroring BantooWarningCode) + params, resolved
//      via getTranslations("command") server-side, OR return
//      { errorCode, params } and let BantooCommand.tsx's existing
//      warningText()-style t(`warnings.${code}`) machinery render it — most
//      of the needed catalog keys (missingPhone, missingWhatsapp,
//      missingEmail, notYetAvailable, enter*, choose*, no*Account, etc.)
//      ALREADY EXIST in both en.json and fr.json; only the plumbing from
//      execute() is missing.
//   3. Remove the `if (success.message) return success.message;` shortcut
//      in BantooCommand.tsx's successMessage() (or make the server return a
//      code instead of prose) so the already-correct
//      successCustomerUpdated/successNoteAdded FR translations actually get
//      used.
//
// STATUS (QA Reliability Swarm reconciliation pass): executeBantooAction now
// resolves a `locale` once via lib/bantoo/locale.ts's resolveUiLocale() and
// routes customer_balance/add_customer_note/customer_query/edit_supplier/
// supplier_balance/add_supplier_note/supplier_query through tCommand() —
// those tests below now assert the FIXED (localized) behavior. contact_*
// errors, edit_customer's success message, the unsupported-action fallback
// error, and generic per-field validation errors were OUT OF SCOPE for this
// pass and remain hardcoded English, as their still-failing-the-old-way
// assertions below document.
// ---------------------------------------------------------------------------

const inventoryFindFirst = vi.fn();
const accountFindFirst = vi.fn();
const partyFindFirst = vi.fn();
const partyFindMany = vi.fn();
const updatePartySpy = vi.fn();
const updatePartyNotesSpy = vi.fn();
const getPartyBalanceSpy = vi.fn();
const getPartyPurchaseHistoryInRangeSpy = vi.fn();

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

vi.mock("@/lib/parties", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/parties")>();
  return {
    ...actual,
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

const { executeBantooAction } = await import("@/app/actions/bantoo");

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

function loadFrCommandStrings(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "../../messages/fr.json"), "utf8");
  const messages = JSON.parse(raw) as { command: Record<string, unknown> };
  const strings: string[] = [];
  (function walk(node: unknown) {
    if (typeof node === "string") strings.push(node);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  })(messages.command);
  return strings;
}

const FR_COMMAND_STRINGS = loadFrCommandStrings();

beforeEach(() => {
  inventoryFindFirst.mockReset();
  accountFindFirst.mockReset();
  partyFindFirst.mockReset();
  partyFindMany.mockReset().mockResolvedValue([]);
  updatePartySpy.mockReset();
  updatePartyNotesSpy.mockReset();
  getPartyBalanceSpy.mockReset();
  getPartyPurchaseHistoryInRangeSpy.mockReset();
});

describe("QA Swarm 09 — Language Consistency: executeBantooAction() ignores locale entirely", () => {
  it("contact_customer 'call' with no phone on file returns a hardcoded ENGLISH error with no locale awareness, even though warnings.missingPhone is already fully translated in FR", async () => {
    partyFindFirst.mockResolvedValue({
      id: "party_musa",
      name: "Musa",
      phone: null,
      whatsapp: null,
      email: null,
    });

    const input: ExecuteBantooInput = {
      action: "contact_customer",
      draft: draft({ contactMethod: "call" }),
      partyId: "party_musa",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // This is the exact hardcoded literal — proves there is no i18n call
      // anywhere in this path.
      expect(result.error).toBe("This customer has no phone number on file. Add one first.");
      // And it is NOT the (already correctly translated) FR string a French
      // user should see instead.
      expect(FR_COMMAND_STRINGS).not.toContain(result.error);
    }
  });

  it("edit_customer success sets `message` to a hardcoded English sentence that PERMANENTLY SHADOWS the correctly-translated command.successCustomerUpdated key", async () => {
    partyFindFirst.mockResolvedValue({ id: "party_musa", notes: null });
    updatePartySpy.mockResolvedValue({ id: "party_musa", name: "Musa Ibrahim" });

    const input: ExecuteBantooInput = {
      action: "edit_customer",
      draft: draft({ newName: "Musa Ibrahim" }),
      partyId: "party_musa",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // BantooCommand.tsx's successMessage() does
      // `if (success.message) return success.message;` BEFORE ever trying
      // `t("successCustomerUpdated", { number })` — so this hardcoded English
      // sentence is what a French-locale user actually sees, in both
      // locales, unconditionally.
      expect(result.message).toBe("Musa Ibrahim was updated.");
      expect(FR_COMMAND_STRINGS).not.toContain(result.message);
    }
  });

  it("FIXED: add_customer_note success now resolves command.successNoteAdded via tCommand (defaults to FR, the app's routing.defaultLocale, when no request-scoped locale cookie/header is available)", async () => {
    partyFindFirst.mockResolvedValue({ id: "party_musa", name: "Musa", notes: null });
    updatePartyNotesSpy.mockResolvedValue({ id: "party_musa" });

    const input: ExecuteBantooInput = {
      action: "add_customer_note",
      draft: draft({ note: "Prefers Friday deliveries" }),
      partyId: "party_musa",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // resolveUiLocale() falls back to routing.defaultLocale ("fr") when
      // called outside a real Next.js request scope (as here) — this IS the
      // correctly-translated command.successNoteAdded FR string now, not a
      // hardcoded English literal that happens to shadow it.
      expect(result.message).toBe("Note ajoutée pour Musa.");
      // The raw (un-interpolated) FR catalog template — not `result.message`
      // itself, which has "{number}" already replaced with "Musa" — is what
      // actually lives in messages/fr.json; FR_COMMAND_STRINGS is a flat list
      // of those raw leaf strings, so it is checked directly here rather than
      // against the interpolated runtime value.
      expect(FR_COMMAND_STRINGS).toContain("Note ajoutée pour {number}.");
    }
  });

  it("FIXED: customer_balance success message is now resolved via tCommand's command.balanceCustomerOwes (FR by default in this request-less test context)", async () => {
    partyFindFirst.mockResolvedValue({ id: "party_musa", name: "Musa" });
    getPartyBalanceSpy.mockResolvedValue(5000n);

    const input: ExecuteBantooInput = {
      action: "customer_balance",
      draft: draft(),
      partyId: "party_musa",
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("Musa vous doit 5,000 XAF.");
    }
  });

  it("unsupported_customer_action's execute()-side fallback error ('This action is not available yet.') is hardcoded English — unreachable from the current UI (canConfirm hides the button) but not localized as defense-in-depth", async () => {
    const input: ExecuteBantooInput = {
      action: "unsupported_customer_action",
      draft: draft({ requestedAction: "archive" }),
      partyId: null,
      createParty: false,
      partyType: "customer",
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("This action is not available yet.");
      // The already-existing, correctly-localized code for the exact same
      // condition (see lib/bantoo/resolve.ts's `warn("notYetAvailable")` and
      // messages/{en,fr}.json's command.warnings.notYetAvailable) is never
      // reused here.
    }
  });

  it("generic validation errors (e.g. missing product name) are hardcoded English across every action branch, not just the customer/supplier ones", async () => {
    const input: ExecuteBantooInput = {
      action: "add_inventory_item",
      draft: draft({ productName: "" }),
      partyId: null,
      createParty: false,
      partyType: null,
      itemId: null,
      bankAccountId: null,
      lineAccountId: null,
    };

    const result = await executeBantooAction(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Enter the product name.");
      expect(FR_COMMAND_STRINGS).not.toContain(result.error);
    }
  });
});
