import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Ask Bantoo Reliability Swarm — Track 8: Purchase Workflow Agent
//
// Scope: supplier purchases, supplier payments, receive stock / goods
// receipt, inventory item creation. This file is intentionally split into
// two halves:
//
//   PART A — "what a real user's typed message actually turns into today".
//   Since this sandbox has no OPENAI_API_KEY configured (see .env / the
//   isAiConfigured() check in lib/ai/provider.ts), every text-only Ask Bantoo
//   command in production ALSO degrades to this exact same rule-based path
//   whenever the AI is unconfigured, rate-limited, out of credits, or
//   momentarily down (see app/api/bantoo/extract/route.ts's fallback
//   branches) — so this is not a "no-AI-only" corner case, it is a live,
//   reachable production code path for every org. PART A calls
//   ruleBasedExtract()/parseBantooCommandText() directly — no DB required.
//
//   PART B — full-chain regression tests (resolveExtraction ->
//   executeBantooAction -> real Postgres via the project's existing
//   dev database) for every SUPPORTED purchase-side action, run inside a
//   single freshly-created, uniquely-named throwaway organization (the same
//   pattern scripts/verify-purchases.ts and scripts/verify-inventory.ts
//   already use for real end-to-end checks against this shared dev DB) so
//   this suite cannot collide with data from the other 9 parallel QA
//   agents. The organization (and everything cascade-scoped under it) is
//   deleted in afterAll.
//
// No source file, existing test file, or accounting/ledger/inventory logic
// is modified anywhere in this file — every bug found below is DOCUMENTED
// in launch-qa/swarm-08-purchase-workflow.md, never patched.
// ---------------------------------------------------------------------------

import { ruleBasedExtract } from "@/lib/bantoo/fallback";
import { parseBantooCommandText } from "@/lib/command-parse";

describe("PART A — rule-based (no-AI) text classification for purchase-side commands", () => {
  describe("1. Received 150 bags of rice from Adamou at 12,000 XAF each. (receive_stock)", () => {
    it("BUG: the literal currency word (XAF) makes the rule parser miss create_goods_receipt entirely and misfire as a customer receipt", () => {
      const text = "Received 150 bags of rice from Adamou at 12,000 XAF each.";
      const parsed = parseBantooCommandText(text);
      // Root cause: detectIntent()'s create_goods_receipt branch requires
      // `isStockReceipt && hasQuantity && !hasCurrency` (lib/command-parse.ts).
      // Any currency word (xaf/fcfa/francs/cfa) anywhere in the message —
      // even one only describing the UNIT COST, not a cash amount — disables
      // the whole goods-receipt branch, so it falls through to the generic
      // "isReceipt && !isPayment -> create_receipt" rule instead.
      expect(parsed.intent).not.toBe("create_goods_receipt");
      expect(parsed.intent).toBe("create_receipt");

      const action = ruleBasedExtract(text);
      // Silently becomes a bogus customer_payment instead of a goods receipt
      // — this misclassification itself is NOT fixed by the QA Reliability
      // Swarm reconciliation pass (it's a separate, still-open gap from the
      // one below; out of scope for categories A-H).
      expect(action.action).toBe("customer_payment");
      if (action.action === "customer_payment") {
        // The party name is also mangled ("Adamou at each") because FROM_PATTERN
        // has no stop-word for "at". FIXED as an incidental side effect of the
        // Track 7 extractAmount() fix (lib/command-parse.ts now scans past a
        // skipped quantity number — "150" in "150 bags" — via `matchAll`
        // instead of giving up after the first candidate): the unit cost
        // "12,000" is now found and returned instead of being lost, so this
        // malformed record at least carries a real amount into the
        // confirmation screen instead of silently defaulting to nothing —
        // it's still never offered to the user as an actual goods receipt,
        // which remains the real, unfixed bug this test documents.
        expect(action.amount).toBe(12000);
      }
    });

    it("control: the exact same command WITHOUT a currency word correctly classifies as receive_stock (proves the currency word is the trigger)", () => {
      const text = "Received 150 bags of rice from Adamou at 12,000 each.";
      const action = ruleBasedExtract(text);
      expect(action.action).toBe("receive_stock");
      if (action.action === "receive_stock") {
        expect(action.quantity).toBe(150);
        expect(action.unit).toBe("bags");
        expect(action.product_name).toBe("Rice");
        // GAP: even in the successfully-classified case, cost_price is
        // ALWAYS null — ruleBasedExtract's create_goods_receipt branch
        // (lib/bantoo/fallback.ts) never attempts to parse a unit cost at
        // all, unlike every other numeric field. The user must manually
        // type the unit cost into the confirmation form every single time
        // text-only Ask Bantoo is used for a goods receipt.
        expect(action.cost_price).toBeNull();
      }
    });
  });

  describe("2. Add a new inventory item: 50kg cement bags, cost 4,500 XAF each. (add_inventory_item)", () => {
    it("BUG: add_inventory_item has ZERO rule-based recognition — always 'unknown' without AI configured", () => {
      const text = "Add a new inventory item: 50kg cement bags, cost 4,500 XAF each.";
      const parsed = parseBantooCommandText(text);
      expect(parsed.intent).toBe("unknown");

      const action = ruleBasedExtract(text);
      // ruleBasedExtract() (lib/bantoo/fallback.ts) has branches for
      // create_goods_receipt / create_payment / create_receipt /
      // create_customer / create_supplier / customer_action /
      // supplier_action / sales_action — there is NO branch that ever
      // returns "add_inventory_item". Any org without an OpenAI key (or
      // hitting the AI-down/rate-limited/out-of-credits fallback in
      // app/api/bantoo/extract/route.ts) can NEVER register a new product
      // via typed text through Ask Bantoo — every attempt degrades to
      // "unknown" / "not sure", regardless of phrasing.
      expect(action.action).toBe("unknown");
      expect(action.confidence).toBe(0);
    });
  });

  describe("3. Paid Nile Packaging SARL 200,000 XAF. (supplier payment)", () => {
    it("BUG: correctly classifies as 'expense' but DROPS the supplier name entirely (natural 'Paid X amount' phrasing has no 'to')", () => {
      const text = "Paid Nile Packaging SARL 200,000 XAF.";
      const action = ruleBasedExtract(text);
      expect(action.action).toBe("expense");
      if (action.action === "expense") {
        expect(action.amount).toBe(200000);
        // Root cause: extractPartyName(text, "create_payment") in
        // lib/command-parse.ts only recognizes a supplier via TO_PARTY_PATTERN,
        // which requires the literal word "to"/"à"/"au"/"supplier"/
        // "fournisseur"/"vendor" immediately before the name. Natural
        // English "Paid <name> <amount>" (no "to") — exactly the app's own
        // requested test phrasing — never matches, so supplier_name is null.
        expect(action.supplier_name).toBeNull();
      }
    });

    it("the 'to'-qualified phrasing that the parser actually requires DOES capture the supplier (documents the real, narrow, working syntax)", () => {
      const action = ruleBasedExtract("Paid 200,000 XAF to Nile Packaging SARL.");
      expect(action.action).toBe("expense");
      if (action.action === "expense") {
        // Note: cleanLabel() preserves the original casing verbatim (it only
        // strips punctuation/stop-words) — it does NOT title-case "SARL" to
        // "Sarl". Documented here as observed behavior, not a bug.
        expect(action.supplier_name).toBe("Nile Packaging SARL");
        expect(action.amount).toBe(200000);
      }
    });
  });

  describe("4. Bought office supplies for 15,000 XAF from Douala Stationery. (supplier_purchase / expense)", () => {
    it("BUG: 'Bought ... from ...' phrasing is not recognized at all — always 'unknown'", () => {
      const text = "Bought office supplies for 15,000 XAF from Douala Stationery.";
      const parsed = parseBantooCommandText(text);
      // PAYMENT_PATTERNS / RECEIPT_PATTERNS / STOCK_RECEIPT_PATTERNS
      // (lib/command-parse.ts) only recognize "paid/pay/payé/décaissé/sent"
      // family verbs — "bought"/"buy"/"purchased" are absent from every
      // trigger-word list in the rule-based parser, for both supplier_purchase
      // and expense.
      expect(parsed.intent).toBe("unknown");
      const action = ruleBasedExtract(text);
      expect(action.action).toBe("unknown");
    });
  });

  describe("5. French equivalents of #1 and #3", () => {
    it("Reçu 150 sacs de riz de Adamou à 12 000 XAF chacun. — same currency-word misclassification bug reproduces in French", () => {
      const text = "Reçu 150 sacs de riz de Adamou à 12 000 XAF chacun.";
      const action = ruleBasedExtract(text);
      expect(action.action).not.toBe("receive_stock");
      expect(action.action).toBe("customer_payment");
    });

    it("Reçu 150 sacs de riz de Adamou à 12 000 chacun. (no currency word) — correctly classifies as receive_stock in French too", () => {
      const action = ruleBasedExtract("Reçu 150 sacs de riz de Adamou à 12 000 chacun.");
      expect(action.action).toBe("receive_stock");
      if (action.action === "receive_stock") {
        expect(action.quantity).toBe(150);
        expect(action.unit).toBe("sacs");
      }
    });

    it("Payé Nile Packaging SARL 200 000 XAF. — same missing-supplier-name bug reproduces in French", () => {
      const action = ruleBasedExtract("Payé Nile Packaging SARL 200 000 XAF.");
      expect(action.action).toBe("expense");
      if (action.action === "expense") {
        expect(action.amount).toBe(200000);
        expect(action.supplier_name).toBeNull();
      }
    });
  });

  describe("6. Received 100 bags of sugar from Brand New Supplier XYZ at 10,000 XAF each. (unknown supplier)", () => {
    it("BUG (compounding): the counterpart's own name containing the words 'New Supplier' hijacks classification into create_supplier, not receive_stock", () => {
      const text = "Received 100 bags of sugar from Brand New Supplier XYZ at 10,000 XAF each.";
      const parsed = parseBantooCommandText(text);
      // CREATE_SUPPLIER_PATTERNS includes /\b(?:add|create|new|save|register)\s+(?:a\s+)?suppliers?\b/i
      // which matches the substring "New Supplier" inside the counterpart's
      // OWN name — a name collision the detectIntent() ordering (create_*
      // checks run before anything else) cannot protect against.
      expect(parsed.intent).toBe("create_supplier");
      const action = ruleBasedExtract(text);
      expect(action.action).toBe("create_supplier");
      if (action.action === "create_supplier") {
        // And the "name" it extracts is garbage, not even the supplier's
        // actual name.
        expect(action.supplier_name).not.toBe("Brand New Supplier XYZ");
      }
    });

    it("with a supplier name that doesn't collide with a trigger word, the same currency-word bug (from case #1) still applies", () => {
      const text = "Received 100 bags of sugar from Zanzibar Trading Co at 10,000 XAF each.";
      const action = ruleBasedExtract(text);
      expect(action.action).not.toBe("receive_stock");
    });
  });

  describe("7. Quantity/unit variations", () => {
    it("'2 tons of maize ... at 500,000 XAF per ton' hits the same currency-word bug as case #1", () => {
      const action = ruleBasedExtract("Received 2 tons of maize from Adamou at 500,000 XAF per ton.");
      expect(action.action).not.toBe("receive_stock");
      expect(action.action).toBe("customer_payment");
    });

    it("'2 tons of maize' unit itself IS supported by QUANTITY_PATTERN once the currency word is removed", () => {
      const action = ruleBasedExtract("Received 2 tons of maize from Adamou at 500,000 per ton.");
      expect(action.action).toBe("receive_stock");
      if (action.action === "receive_stock") {
        expect(action.quantity).toBe(2);
        expect(action.unit).toBe("tons");
      }
    });

    it("BUG: 'a dozen crates of soap' — word-form quantities ('dozen') are never recognized, only digit quantities", () => {
      const text = "Received a dozen crates of soap from Adamou.";
      const parsed = parseBantooCommandText(text);
      // QUANTITY_PATTERN = /(\d[\d\s,.'']*(?:\.\d+)?)\s*(bags?|...|crates?|...)\b/i
      // requires a LEADING DIGIT. "a dozen crates" has no digit anywhere
      // near the unit word, so hasQuantity is false even though "crates" is
      // itself a perfectly recognized unit.
      expect(parsed.quantityText).toBeNull();
      const action = ruleBasedExtract(text);
      expect(action.action).not.toBe("receive_stock");
      expect(action.action).toBe("customer_payment");
    });

    it("control: 'received 12 crates of soap' (digit form of the same request) works correctly", () => {
      const action = ruleBasedExtract("Received 12 crates of soap from Adamou.");
      expect(action.action).toBe("receive_stock");
      if (action.action === "receive_stock") {
        expect(action.quantity).toBe(12);
        expect(action.unit).toBe("crates");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// PART B — full-chain (resolve -> execute -> real DB) regression tests for
// every SUPPORTED purchase-side action. These start from an ExtractedAction
// exactly as a correctly-configured AI extractor would produce it (i.e. with
// cost_price/supplier_name/etc. actually populated), bypassing the Part-A
// text-parsing bugs above on purpose, so this half isolates and verifies the
// DOWNSTREAM resolve/execute/ledger/inventory behavior on its own merits.
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth/current", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/current")>();
  return { ...actual, requireContext: vi.fn() };
});

const { prisma } = await import("@/lib/prisma");
const { createOrganizationWithOwner } = await import("@/lib/org");
const { payableAccount } = await import("@/lib/accounts");
const { listInventoryItems } = await import("@/lib/inventory");
const { listParties } = await import("@/lib/parties");
const { getPartyBalance } = await import("@/lib/party-ledger");
const { getPartyPurchaseHistoryInRange } = await import("@/lib/party-insights");
const { resolveExtraction } = await import("@/lib/bantoo/resolve");
const { executeBantooAction } = await import("@/app/actions/bantoo");
const { requireContext } = await import("@/lib/auth/current");
import type { CurrentContext } from "@/lib/auth/current";
import type { ExtractedAction } from "@/lib/ai/actions";
import type { ExecuteBantooInput } from "@/lib/bantoo/types";

const STAMP = Date.now();
let ctx: CurrentContext;
let orgId: string;

function buildExecuteInput(
  proposal: Awaited<ReturnType<typeof resolveExtraction>>,
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
    duplicateResolution: null,
  };
}

// Not generically typed against `Partial<ExtractedAction>` — with a
// discriminated union this wide, a generic `Partial<...>` param (never
// actually passed an argument anywhere below) makes every spread site's
// resulting object type infer as a union across MULTIPLE action variants
// instead of the one literal `action: "..."` value present at that call
// site, which TS then rejects as not assignable to the `ExtractedAction`
// annotation. Plain fields, no generic spread-through, is both simpler and
// type-checks correctly at every call site.
function baseFields() {
  return { confidence: 0.9, summary: null, currency: "XAF" };
}

beforeAll(async () => {
  const { org } = await createOrganizationWithOwner({
    name: "QA Swarm 08",
    email: `qa-swarm-08+${STAMP}@example.com`,
    password: "verify-12345",
    phone: "+237600000000",
    orgName: `QA Swarm 08 Purchase ${STAMP}`,
    baseCurrency: "XAF",
  });
  orgId = org.id;
  ctx = {
    orgId,
    userId: "qa_swarm_08_user",
    baseCurrency: "XAF",
    userName: "QA Swarm 08",
    userEmail: `qa-swarm-08+${STAMP}@example.com`,
    orgName: org.name,
    role: "owner",
    emailVerified: true,
    approvalWorkflowEnabled: false,
  };
  vi.mocked(requireContext).mockResolvedValue(ctx);
}, 30000);

afterAll(async () => {
  if (orgId) {
    // BUG FOUND HERE TOO (documented in the report, not fixed by this
    // reconciliation pass — see the final report's "documented but not
    // fixed" blockers): a plain `prisma.organization.delete()` FAILS with
    // Postgres FK-restrict errors ("update or delete on table
    // accounts/inventory_items violates RESTRICT setting of foreign key
    // constraint purchase_invoice_lines_accountId_fkey /
    // goods_receipt_lines_itemId_fkey / payment_lines_accountId_fkey") for
    // ANY org that has ever posted a purchase invoice, a goods receipt, or a
    // payment — i.e. every org this whole suite exercises (the "expense"
    // tests below now succeed post-fix and post real Payment/PaymentLine
    // rows, which surfaced the identical gap for payment_lines too). Root
    // cause: `PurchaseInvoiceLine.account`, `GoodsReceiptLine.item`, and
    // `PaymentLine.account` in prisma/schema.prisma have NO
    // `onDelete: Cascade` (unlike almost every other *Line -> resource
    // relation in the schema), so Organization -> Account/InventoryItem's
    // cascade races with PurchaseInvoice/GoodsReceipt/Payment -> *Line's
    // cascade and Postgres refuses. Worked around here by deleting those
    // lines ourselves first so this suite still leaves the shared dev DB
    // clean; a real user (or any admin/support tooling) hitting "delete
    // organization" on any org with purchase/payment history would get a
    // hard 500 instead.
    await prisma.purchaseInvoiceLine.deleteMany({ where: { invoice: { orgId } } }).catch(() => {});
    await prisma.goodsReceiptLine.deleteMany({ where: { receipt: { orgId } } }).catch(() => {});
    await prisma.paymentLine.deleteMany({ where: { payment: { orgId } } }).catch(() => {});
    // Organization cascade-deletes every remaining row scoped under it
    // (parties, inventory items, goods receipts, payments, journal entries,
    // ...) — see prisma/schema.prisma's onDelete: Cascade — so this leaves
    // the shared dev DB exactly as clean as it was before this suite ran,
    // with zero risk of colliding with the other 9 parallel QA agents' own
    // throwaway organizations.
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
}, 30000);

describe("PART B — receive_stock: full chain (new item + new supplier) actually moves inventory and creates a payable", () => {
  it("creates the item, the goods receipt, increases qtyOnHand/valueOnHand, and credits the supplier's payable balance", async () => {
    const action: ExtractedAction = {
      action: "receive_stock",
      product_name: "Rice 50kg",
      barcode: null,
      sku: null,
      unit: "bags",
      quantity: 150,
      cost_price: 12000,
      supplier_name: "Adamou Grains",
      date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.action).toBe("receive_stock");
    // Brand-new supplier and brand-new product: nothing to auto-select yet,
    // but both are OFFERED to be created — never silently dropped, never a
    // hard failure.
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);
    expect(proposal.itemId).toBeNull();
    expect(proposal.draft.quantity).toBe("150");
    expect(proposal.draft.costPrice).toBe("12000");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("receive_stock");
    expect(result.href).toMatch(/^\/goods-receipts\//);

    const items = await listInventoryItems(orgId);
    const item = items.find((i) => i.name === "Rice 50kg");
    expect(item).toBeDefined();
    expect(item?.qtyOnHand.toString()).toBe("150");
    expect(item?.valueOnHand).toBe(150n * 12000n);
    expect(item?.unit).toBe("bags");

    const suppliers = await listParties(orgId, "supplier");
    const supplier = suppliers.find((p) => p.name === "Adamou Grains");
    expect(supplier).toBeDefined();

    const payable = await getPartyBalance(orgId, supplier!.id, "supplier");
    expect(payable).toBe(150n * 12000n);

    // Shows up in the supplier's purchase history exactly like /suppliers/:id
    // and the supplier_query action would read it.
    const history = await getPartyPurchaseHistoryInRange(orgId, supplier!.id, "supplier", null, null);
    expect(history.items.some((i) => i.name === "Rice 50kg" && i.quantity === "150")).toBe(true);
  });

  it("a SECOND receipt for the SAME item/supplier from a different unit ('tons') correctly accumulates weighted-average stock", async () => {
    const items = await listInventoryItems(orgId);
    const rice = items.find((i) => i.name === "Rice 50kg")!;
    const suppliers = await listParties(orgId, "supplier");
    const adamou = suppliers.find((p) => p.name === "Adamou Grains")!;

    const action: ExtractedAction = {
      action: "receive_stock",
      product_name: "Rice 50kg",
      barcode: null,
      sku: null,
      unit: "tons",
      quantity: 2,
      cost_price: 500000,
      supplier_name: "Adamou Grains",
      date: null,
      ...baseFields(),
    };
    const proposal = await resolveExtraction(ctx, action);
    // High-confidence text match auto-selects the existing item & supplier —
    // no duplicates created for a repeat purchase.
    expect(proposal.itemId).toBe(rice.id);
    expect(proposal.partyId).toBe(adamou.id);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);

    const after = await listInventoryItems(orgId);
    const updated = after.find((i) => i.id === rice.id)!;
    // 150 @ 12,000 (1,800,000) + 2 @ 500,000 (1,000,000) = 152 units / 2,800,000
    expect(updated.qtyOnHand.toString()).toBe("152");
    expect(updated.valueOnHand).toBe(2_800_000n);

    const payable = await getPartyBalance(orgId, adamou.id, "supplier");
    expect(payable).toBe(2_800_000n);
  });
});

describe("PART B — receive_stock referencing a supplier that does not exist yet", () => {
  it("offers to create the new supplier as part of the SAME confirm-and-save action (never a silent malformed transaction, never a hard failure)", async () => {
    const action: ExtractedAction = {
      action: "receive_stock",
      product_name: "Sugar 1kg",
      barcode: null,
      sku: null,
      unit: "bags",
      quantity: 100,
      cost_price: 10000,
      supplier_name: "Zanzibar Trading Co",
      date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.createParty).toBe(true);
    expect(proposal.warnings.some((w) => w.code === "chooseSupplier")).toBe(false);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const suppliers = await listParties(orgId, "supplier");
    const created = suppliers.find((p) => p.name === "Zanzibar Trading Co");
    expect(created).toBeDefined();

    const payable = await getPartyBalance(orgId, created!.id, "supplier");
    expect(payable).toBe(1_000_000n);

    // The receipt is genuinely linked to the new supplier, not orphaned.
    expect(result.href).toMatch(/^\/goods-receipts\//);
  });

  it("without ANY supplier name at all, execute() fails clearly rather than posting an unlinked goods receipt", async () => {
    const action: ExtractedAction = {
      action: "receive_stock",
      product_name: "Cooking Oil 5L",
      barcode: null,
      sku: null,
      unit: "boxes",
      quantity: 10,
      cost_price: 8000,
      supplier_name: null,
      date: null,
      ...baseFields(),
    };
    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.warnings.some((w) => w.code === "chooseSupplier")).toBe(true);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/supplier/i);

    const items = await listInventoryItems(orgId);
    expect(items.some((i) => i.name === "Cooking Oil 5L")).toBe(false);
  });
});

describe("PART B — add_inventory_item: new product WITHOUT opening stock never touches a supplier/ledger", () => {
  it("creates the catalog item only — no goods receipt, no payable, matching the documented 'opening stock is optional' behavior", async () => {
    const action: ExtractedAction = {
      action: "add_inventory_item",
      product_name: "Cement 50kg Bag",
      barcode: null,
      sku: null,
      category: "Building Materials",
      unit: "bags",
      quantity: null,
      cost_price: 4500,
      sale_price: 5500,
      tax_rate: null,
      reorder_level: null,
      supplier_name: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("add_inventory_item");

    const items = await listInventoryItems(orgId);
    const item = items.find((i) => i.name === "Cement 50kg Bag");
    expect(item).toBeDefined();
    expect(item?.qtyOnHand.toString()).toBe("0");
    expect(item?.salePrice).toBe(5500n);
  });

  it("with an opening quantity AND a resolvable supplier, ALSO posts an opening-stock goods receipt (dual effect)", async () => {
    const action: ExtractedAction = {
      action: "add_inventory_item",
      product_name: "Cooking Gas 12kg",
      barcode: null,
      sku: null,
      category: "Gas",
      unit: "cylinders",
      quantity: 20,
      cost_price: 9000,
      sale_price: 11000,
      tax_rate: null,
      reorder_level: null,
      supplier_name: "Gas Depot Cameroon",
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.createParty).toBe(true);

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);

    const items = await listInventoryItems(orgId);
    const item = items.find((i) => i.name === "Cooking Gas 12kg");
    expect(item?.qtyOnHand.toString()).toBe("20");
    expect(item?.valueOnHand).toBe(180000n);

    const suppliers = await listParties(orgId, "supplier");
    const supplier = suppliers.find((p) => p.name === "Gas Depot Cameroon");
    expect(supplier).toBeDefined();
    const payable = await getPartyBalance(orgId, supplier!.id, "supplier");
    expect(payable).toBe(180000n);
  });
});

describe("PART B — supplier_purchase: bill posted on credit correctly increases Accounts Payable", () => {
  it("full chain: purchase invoice created, AP balance increases by the invoice total", async () => {
    const action: ExtractedAction = {
      action: "supplier_purchase",
      supplier_name: "Douala Stationery",
      amount: 15000,
      description: "Office supplies",
      payment_method: null,
      date: null,
      ...baseFields(),
    };

    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.createParty).toBe(true);
    expect(proposal.lineAccountId).not.toBeNull();
    // FIXED (QA Reliability Swarm reconciliation pass): this used to
    // document a SECONDARY BUG where the "line account" ended up being
    // "5000 — Cost of goods sold" instead of "6000 — General expenses" for
    // a non-inventory purchase like this one. Root cause was the exact same
    // paymentCounterpartAccounts() NULL-subtype `notIn` bug fixed in
    // lib/accounts.ts (see its doc comment) — every default EXPENSE account
    // except "5000 Cost of goods sold" has `subtype: null` in
    // DEFAULT_CHART_OF_ACCOUNTS, so General expenses/Salaries/Rent/
    // Transport/Bank charges were ALL silently dropped from the query,
    // leaving COGS as the only (wrong) fallback candidate. Now that the
    // query is NULL-safe, `pickExpenseAccount()` correctly finds "6000
    // General expenses" for a description with no more specific keyword
    // match, and COGS is reserved for purchases it can actually pattern-match
    // (see EXPENSE_HINTS in lib/command-accounts.ts).
    const lineAccount = await prisma.account.findUnique({ where: { id: proposal.lineAccountId! } });
    expect(lineAccount?.code).toBe("6000");
    expect(lineAccount?.subtype).toBeNull();

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.href).toMatch(/^\/purchase-invoices\//);

    const suppliers = await listParties(orgId, "supplier");
    const supplier = suppliers.find((p) => p.name === "Douala Stationery");
    expect(supplier).toBeDefined();
    const payable = await getPartyBalance(orgId, supplier!.id, "supplier");
    expect(payable).toBe(15000n);
  });
});

describe("FIXED — the 'expense' action, previously COMPLETELY NON-FUNCTIONAL on a fresh org ('noExpenseAccount' every time), now resolves a real expense account", () => {
  // ROOT CAUSE (same underlying bug for both tests below, now fixed):
  //
  // resolve.ts's "expense" branch does:
  //   const accounts = await paymentCounterpartAccounts(ctx.orgId);
  //   const expenses = accounts.filter(a => a.type === "EXPENSE" && a.subtype !== "cogs");
  //
  // paymentCounterpartAccounts(orgId) (lib/accounts.ts) used to query:
  //   where: { orgId, subtype: { notIn: ["bank", "cash"] }, OR: [{ type: "EXPENSE" }, { subtype: "payable", isControl: true }] }
  //
  // Under standard SQL three-valued logic, `<col> NOT IN (...)` evaluates to
  // UNKNOWN (not TRUE) whenever <col> IS NULL — so Prisma's `notIn` filter
  // silently EXCLUDED every row whose `subtype` column is NULL, regardless
  // of what the OR clause said. DEFAULT_CHART_OF_ACCOUNTS
  // (lib/chart-of-accounts.ts) gives every default EXPENSE account EXCEPT
  // "5000 Cost of goods sold" a `subtype` of `undefined` (-> NULL in the DB):
  // "6000 General expenses", "6100 Salaries & wages", "6200 Rent",
  // "6300 Transport & fuel", "6900 Bank charches" were ALL silently dropped
  // by paymentCounterpartAccounts(), on EVERY org, not just this test's.
  //
  // FIXED (QA Reliability Swarm reconciliation pass — see lib/accounts.ts's
  // doc comment on receiptCounterpartAccounts/paymentCounterpartAccounts):
  // the filter is now the NULL-safe `OR: [{ subtype: null }, { subtype: {
  // notIn: [...] } }]`, so every null-subtype EXPENSE account is correctly
  // included again. `expenses` is no longer empty, `pickExpenseAccount`
  // correctly falls back to "6000 General expenses" for a description/
  // category with no more specific keyword match, and app/actions/bantoo.ts's
  // `case "expense"` now succeeds for literally any plain-language expense
  // (rent, salaries, fuel, bank charges, a supplier payment, "bought office
  // supplies", anything) on any organization still using the seeded default
  // chart of accounts (i.e. every brand-new org). This was NOT a
  // supplier-payment-specific bug: it was a total, org-wide failure of the
  // single most common Ask Bantoo action for logging day-to-day spending.
  it("FIXED: a plain, non-supplier expense ('Bought office supplies for 15,000 XAF') now resolves the General expenses account and saves successfully", async () => {
    const action: ExtractedAction = {
      action: "expense",
      amount: 15000,
      description: "Office supplies",
      category: "Office",
      supplier_name: null,
      payment_method: null,
      date: null,
      ...baseFields(),
    };
    const proposal = await resolveExtraction(ctx, action);
    expect(proposal.partyId).toBeNull();
    expect(proposal.lineAccountOptions.length).toBeGreaterThan(0);
    expect(proposal.warnings.some((w) => w.code === "noExpenseAccount")).toBe(false);

    const lineAccount = await prisma.account.findFirst({ where: { id: proposal.lineAccountId ?? undefined } });
    expect(lineAccount?.code).toBe("6000");
    expect(lineAccount?.name).toBe("General expenses");

    const result = await executeBantooAction(buildExecuteInput(proposal));
    expect(result.ok).toBe(true);
  });

  it("FIXED (previously compounding blocker): a bill's payable balance can now be cleared via 'Paid <supplier> <amount>' since 'expense' resolves a real account", async () => {
    // Step 1: bill the supplier on credit via supplier_purchase (exactly like
    // a real "goods receipt on credit" or "supplier invoice" would) — this
    // is the ONLY way Ask Bantoo creates an Accounts Payable balance.
    const billAction: ExtractedAction = {
      action: "supplier_purchase",
      supplier_name: "Nile Packaging SARL",
      amount: 200000,
      description: "Packaging materials",
      payment_method: null,
      date: null,
      ...baseFields(),
    };
    const billProposal = await resolveExtraction(ctx, billAction);
    const billResult = await executeBantooAction(buildExecuteInput(billProposal));
    expect(billResult.ok).toBe(true);

    const suppliers = await listParties(orgId, "supplier");
    const nile = suppliers.find((p) => p.name === "Nile Packaging SARL")!;
    const payableBeforePayment = await getPartyBalance(orgId, nile.id, "supplier");
    expect(payableBeforePayment).toBe(200000n);

    // Step 2: "Paid Nile Packaging SARL 200,000 XAF." — the ONLY action type
    // Ask Bantoo has for a payment naming a supplier is "expense" (there is
    // no dedicated "supplier_payment"/"pay bill" action in BANTOO_ACTION_TYPES
    // at all — see lib/ai/actions.ts). The `noExpenseAccount` bug documented
    // above used to make this fail even before reaching that design gap; now
    // that it's fixed, the proposal DOES resolve a real expense account and
    // execute() DOES succeed — but a SEPARATE, still-open design gap remains:
    // "expense" was never designed to touch Accounts Payable at all
    // (resolve.ts only ever offers EXPENSE-type accounts as the line
    // account, never the payable control account), so the payment posts as
    // a brand-new cash expense (Dr Expense / Cr Bank) rather than clearing
    // the existing bill (which would need Dr Accounts Payable / Cr Bank).
    // The supplier's payable balance is therefore UNCHANGED by this "payment"
    // — not because it errors out anymore, but because it silently records
    // the wrong kind of transaction. See this reconciliation pass's final
    // report for this residual, still-open product gap (no dedicated
    // "pay this supplier's bill" action exists yet).
    const payAction: ExtractedAction = {
      action: "expense",
      amount: 200000,
      description: "Payment to Nile Packaging SARL",
      category: null,
      supplier_name: "Nile Packaging SARL",
      payment_method: null,
      date: null,
      ...baseFields(),
    };
    const payProposal = await resolveExtraction(ctx, payAction);
    expect(payProposal.partyId).toBe(nile.id); // the supplier DOES resolve correctly
    // FIXED: a real expense account is now offered, so the proposal CAN be
    // confirmed (contrast the pre-fix behavior, which hard-blocked here).
    expect(payProposal.lineAccountId).not.toBeNull();
    expect(payProposal.warnings.some((w) => w.code === "noExpenseAccount")).toBe(false);

    const payResult = await executeBantooAction(buildExecuteInput(payProposal));
    expect(payResult.ok).toBe(true);

    // RESIDUAL GAP (separate from the noExpenseAccount bug, not fixed by
    // this pass): the bill's payable balance is untouched — the "payment"
    // landed as a new cash expense, not a bill payment against AP.
    const payableAfterPayment = await getPartyBalance(orgId, nile.id, "supplier");
    expect(payableAfterPayment).toBe(200000n);
    const ap = await payableAccount(orgId);
    const paymentJournalLines = await prisma.journalLine.findMany({
      where: { orgId, partyId: nile.id, accountId: ap.id },
    });
    // Only the two lines from the ORIGINAL bill reference AP for this
    // supplier — the "expense" payment posted to a General expenses line
    // instead, so it never touches the AP account at all.
    expect(paymentJournalLines.length).toBe(1);
  });
});
