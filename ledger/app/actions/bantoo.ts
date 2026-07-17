"use server";

import { z } from "zod";

import { requireContext, type CurrentContext } from "@/lib/auth/current";
import { receivableAccount } from "@/lib/accounts";
import {
  createCreditNote,
  createPayment,
  createPurchaseInvoice,
  createReceipt,
  createRefundReceipt,
  createSalesInvoice,
  createSalesReceipt,
  DocumentError,
} from "@/lib/documents";
import { createInventoryItem, receiveGoods } from "@/lib/inventory";
import { MATCH_HIGH } from "@/lib/bantoo/match";
import { resolveUiLocale, tCommand } from "@/lib/bantoo/locale";
import { formatAmount, parseAmount } from "@/lib/money";
import { createParty, findPossiblePartyDuplicates, updateParty, updatePartyNotes } from "@/lib/parties";
import { getPartyBalance } from "@/lib/party-ledger";
import { getPartyPurchaseHistoryInRange } from "@/lib/party-insights";
import { prisma } from "@/lib/prisma";
import { BANTOO_ACTION_TYPES } from "@/lib/ai/actions";
import { isAiConfigured } from "@/lib/ai/provider";
import {
  productDefaultsFromItem,
  searchEntities,
} from "@/lib/bantoo/entities";
import { listInventoryItems } from "@/lib/inventory";
import type {
  BantooDraft,
  BantooExecuteResult,
  EntitySearchType,
  ExecuteBantooInput,
  MatchCandidate,
  ProductDefaults,
} from "@/lib/bantoo/types";

// Lets the client know whether AI photo/voice capture is available WITHOUT ever
// exposing the key itself — only a boolean crosses the wire. Text still works
// via the rule-based fallback when this is false.
export async function getBantooAiStatus(): Promise<{ configured: boolean }> {
  await requireContext();
  return { configured: isAiConfigured() };
}

const ENTITY_TYPES: readonly EntitySearchType[] = [
  "supplier",
  "customer",
  "product",
  "unit",
  "expense_category",
  "income_account",
  "bank_account",
];

// Org-scoped, authenticated search the confirmation dropdowns call as the user
// types (debounced). Returns ranked candidates for the requested entity type.
// Never leaks another org's records — everything is loaded via ctx.orgId.
export async function searchBantooEntities(
  type: string,
  query: string,
): Promise<{ candidates: MatchCandidate[] }> {
  const ctx = await requireContext();
  if (!ENTITY_TYPES.includes(type as EntitySearchType)) {
    return { candidates: [] };
  }
  const candidates = await searchEntities(
    ctx,
    type as EntitySearchType,
    String(query ?? "").slice(0, 200),
  );
  return { candidates };
}

// Fetch an existing product's defaults so dependent fields (unit, tax, cost,
// sale price, reorder level) auto-populate when it is selected. The id is
// validated against the org before anything is returned.
export async function getBantooProductDefaults(
  itemId: string,
): Promise<{ ok: true; defaults: ProductDefaults } | { ok: false }> {
  const ctx = await requireContext();
  const items = await listInventoryItems(ctx.orgId);
  const item = items.find((it) => it.id === itemId);
  if (!item) return { ok: false };
  return { ok: true, defaults: productDefaultsFromItem(item, ctx.baseCurrency) };
}

const draftSchema = z.object({
  productName: z.string().max(200).default(""),
  barcode: z.string().max(100).default(""),
  sku: z.string().max(100).default(""),
  category: z.string().max(200).default(""),
  unit: z.string().max(50).default(""),
  quantity: z.string().max(50).default(""),
  costPrice: z.string().max(50).default(""),
  salePrice: z.string().max(50).default(""),
  taxRate: z.string().max(20).default(""),
  reorderLevel: z.string().max(50).default(""),
  amount: z.string().max(50).default(""),
  unitPrice: z.string().max(50).default(""),
  partyName: z.string().max(200).default(""),
  city: z.string().max(200).default(""),
  // QA Reliability Swarm (Track 1): see the doc comment on BantooDraft.country
  // in lib/bantoo/types.ts for why this was silently dropped before.
  country: z.string().max(200).default(""),
  paymentMethod: z.string().max(100).default(""),
  description: z.string().max(500).default(""),
  date: z.string().max(40).default(""),
  dueDate: z.string().max(40).default(""),
  currency: z.string().max(8).default("XAF"),
  newName: z.string().max(200).default(""),
  phone: z.string().max(50).default(""),
  whatsapp: z.string().max(50).default(""),
  email: z.string().max(200).default(""),
  companyName: z.string().max(200).default(""),
  taxId: z.string().max(100).default(""),
  paymentTermsDays: z.string().max(10).default(""),
  creditLimit: z.string().max(30).default(""),
  defaultDiscount: z.string().max(20).default(""),
  preferredLanguage: z.string().max(20).default(""),
  preferredPaymentMethod: z.string().max(100).default(""),
  note: z.string().max(2000).default(""),
  view: z.string().max(20).default(""),
  periodText: z.string().max(100).default(""),
  dateFrom: z.string().max(40).default(""),
  dateTo: z.string().max(40).default(""),
  contactMethod: z.string().max(20).default(""),
  requestedAction: z.string().max(40).default(""),
  postAction: z.string().max(20).default(""),
});

const inputSchema = z.object({
  action: z.enum(BANTOO_ACTION_TYPES),
  draft: draftSchema,
  partyId: z.string().nullable().default(null),
  createParty: z.boolean().default(false),
  partyType: z.enum(["customer", "supplier"]).nullable().default(null),
  itemId: z.string().nullable().default(null),
  bankAccountId: z.string().nullable().default(null),
  lineAccountId: z.string().nullable().default(null),
  // Authoritative record of the user's explicit "use existing" vs "create
  // new" choice from the possible-duplicate-customer prompt — see the doc
  // comment on ExecuteBantooInput. Absent/null for every action that never
  // showed that prompt.
  duplicateResolution: z.enum(["use_existing", "create_new"]).nullable().default(null),
});

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  const d = trimmed ? new Date(trimmed) : new Date();
  return Number.isNaN(d.getTime()) ? null : d;
}

// Allocate a unique inventory code (SKU) for AI-created items when the user did
// not provide one. Scans existing codes and picks the first free BAN-#### slot.
async function nextItemCode(orgId: string): Promise<string> {
  const existing = await prisma.inventoryItem.findMany({
    where: { orgId },
    select: { code: true },
  });
  const used = new Set(existing.map((e) => e.code));
  let n = existing.length + 1;
  let code = `BAN-${String(n).padStart(4, "0")}`;
  while (used.has(code)) {
    n += 1;
    code = `BAN-${String(n).padStart(4, "0")}`;
  }
  return code;
}

// Create the named party when the user asked to, otherwise return the chosen id.
async function ensurePartyId(
  ctx: CurrentContext,
  input: {
    partyId: string | null;
    createParty: boolean;
    partyName: string;
    type: "customer" | "supplier";
    city?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    country?: string | null;
    // Skips the fuzzy-match safety net below and always creates a brand-new
    // party. ONLY set this when the user has already been shown the
    // possible-duplicate-customer prompt (resolve.ts's duplicateCandidate)
    // and EXPLICITLY chose "create as a new customer with the same name" —
    // i.e. `duplicateResolution === "create_new"` at the call site. Without
    // this escape hatch, the safety net below would re-run the exact same
    // name match that produced the duplicate prompt and silently reuse the
    // existing party anyway, discarding the user's explicit choice (and
    // every new field value they just entered) — see the "Golu Transport"
    // bug postmortem in app/actions/bantoo.test.ts for the concrete repro.
    forceCreate?: boolean;
  },
): Promise<string | null> {
  if (input.partyId) {
    // Never trust a client-supplied id: confirm it belongs to this org so a
    // crafted request can't attach another tenant's contact.
    const found = await prisma.party.findFirst({
      where: { id: input.partyId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!found) throw new DocumentError("That contact was not found.");
    return found.id;
  }
  if (input.createParty && input.partyName.trim()) {
    // Duplicate-prevention safety net: the text-matching dropdown (resolve.ts)
    // already surfaces alternatives at medium+ confidence before the user
    // confirms, but re-check here with the shared matcher (which also covers
    // exact phone/WhatsApp — not just name) right before writing. Only a
    // HIGH-confidence hit auto-reuses the existing contact instead of
    // creating a near-duplicate; anything less ambiguous is left to the
    // dropdown the user already saw, so this never silently blocks a
    // legitimate "create new" the user explicitly chose.
    //
    // Skipped entirely when forceCreate is set — the user has already made
    // an explicit, informed "create new" choice in response to a dedicated
    // duplicate-review prompt, so re-litigating that decision here would
    // just silently overturn it.
    if (!input.forceCreate) {
      const duplicates = await findPossiblePartyDuplicates(ctx.orgId, {
        name: input.partyName,
      });
      const highConfidence = duplicates.find((d) => d.score >= MATCH_HIGH);
      if (highConfidence) {
        // QA Reliability Swarm (Track 3/10) fix: this safety net is
        // type-UNAWARE by design (it matches on phone/WhatsApp too, which
        // don't carry a role), so e.g. a create_supplier request can
        // silently reuse an existing CUSTOMER-only party. Before this fix,
        // the id was returned as-is: `type` was never upgraded to "both",
        // so the party stayed invisible to the new role's own lists/lookups
        // forever, and — because this early return skips createParty()
        // below entirely — city/phone/whatsapp/country from THIS request
        // were silently discarded even though execute() reported success.
        // This isn't limited to the dual-role case: a SAME-type high-
        // confidence match (e.g. a supplier fuzzy-matching another supplier
        // by phone) hits this exact same early return and had the identical
        // silent-drop bug — see qa-swarm-10-persistence-nav.test.ts's "path
        // (b)" case. The enrichment below always runs; only the `type: "both"`
        // upgrade is conditional on the roles actually differing.
        const upgrade: { type?: string; city?: string; phone?: string; whatsapp?: string; country?: string } = {};
        if (highConfidence.type !== input.type && highConfidence.type !== "both") {
          upgrade.type = "both";
        }
        // Never silently overwrite a value already on file — which of two
        // conflicting values should "win" is a genuine, still-open product
        // decision (see this file's module doc comment); only fill in
        // fields the existing record doesn't have yet, so the common
        // (non-conflicting) case is fixed without silently guessing an
        // answer to that open question.
        if (input.city?.trim() && !highConfidence.city) upgrade.city = input.city.trim();
        if (input.phone?.trim() && !highConfidence.phone) upgrade.phone = input.phone.trim();
        if (input.whatsapp?.trim() && !highConfidence.whatsapp) upgrade.whatsapp = input.whatsapp.trim();
        if (input.country?.trim() && !highConfidence.country) upgrade.country = input.country.trim();
        if (Object.keys(upgrade).length > 0) {
          await updateParty(ctx.orgId, highConfidence.id, upgrade);
        }
        return highConfidence.id;
      }
    }

    const created = await createParty(ctx.orgId, {
      name: input.partyName.trim(),
      type: input.type,
      city: input.city?.trim() || null,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      country: input.country?.trim() || null,
    });
    return created.id;
  }
  return null;
}

// Shared by create_customer/edit_customer: appends a timestamped line to a
// party's existing notes, mirroring add_customer_note's inline logic exactly
// (same stamp format) so a note captured as part of a create/edit plan step
// looks identical to one added via the dedicated add_customer_note command.
async function appendPartyNote(
  orgId: string,
  partyId: string,
  existingNotes: string | null | undefined,
  noteText: string,
  date: Date,
): Promise<void> {
  const stamp = date.toISOString().slice(0, 10);
  const existing = existingNotes?.trim();
  const appended = existing ? `${existing}\n[${stamp}] ${noteText}` : `[${stamp}] ${noteText}`;
  await updatePartyNotes(orgId, partyId, appended);
}

// Sales-side single-line documents (sales_invoice/credit_note/refund_receipt/
// sales_receipt) used to always post a single "quantity 1" line at the full
// amount, discarding any real per-unit quantity/price the user stated (e.g.
// "2560 bags at 7000 XAF a bag"). When the AI/fallback extraction populated
// both draft.quantity and draft.unitPrice, use them for the real line;
// otherwise fall back to the previous quantity-1-at-amount behavior.
function resolveLineQuantityAndPrice(
  draft: BantooDraft,
  amount: bigint,
  currency: string,
): { quantity: string; unitPrice: bigint } {
  const qty = Number(draft.quantity);
  const price = Number(draft.unitPrice);
  if (draft.quantity.trim() && draft.unitPrice.trim() && qty > 0 && price > 0) {
    return { quantity: draft.quantity, unitPrice: parseAmount(draft.unitPrice, currency) };
  }
  return { quantity: "1", unitPrice: amount };
}

// Trust boundary for selectable inventory items. A client-supplied itemId must
// belong to the caller's org before it is posted, mirroring ensurePartyId.
async function assertOrgItemId(ctx: CurrentContext, itemId: string): Promise<string> {
  const found = await prisma.inventoryItem.findFirst({
    where: { id: itemId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!found) throw new DocumentError("That item was not found.");
  return found.id;
}

// Trust boundary for selectable accounts (bank/cash, expense/income categories).
// Confirms the account belongs to the org so a crafted request can't post to
// another tenant's chart of accounts. The generic message never reveals whether
// the id exists elsewhere.
async function assertOrgAccountId(ctx: CurrentContext, accountId: string): Promise<string> {
  const found = await prisma.account.findFirst({
    where: { id: accountId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!found) throw new DocumentError("That account was not found.");
  return found.id;
}

// Confirm-and-write endpoint for Ask Bantoo. Re-validates the client payload,
// converts amounts to minor units, and posts through the existing document/
// inventory helpers. Never trusts the AI-extracted values without validation.
export async function executeBantooAction(
  raw: ExecuteBantooInput,
): Promise<BantooExecuteResult> {
  const ctx = await requireContext();
  // QA Reliability Swarm (Track 9): resolved once per call and reused by
  // every t()-backed success/error string below, via the same
  // cookie/header-based resolution the AI-extraction route and the page
  // itself use — see lib/bantoo/locale.ts's doc comment for why this can't
  // just call next-intl/server's getTranslations() directly (this action is
  // invoked directly, with no request scope, by dozens of unit tests).
  const locale = await resolveUiLocale();
  const t = (key: string, params?: Record<string, string | number>) => tCommand(locale, key, params);

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request. Please review the details and try again." };
  }
  const input = parsed.data;
  const { draft } = input;
  const cur = ctx.baseCurrency;

  const date = parseDate(draft.date);
  if (!date) return { ok: false, error: "Invalid date." };

  try {
    switch (input.action) {
      case "add_inventory_item": {
        const name = draft.productName.trim();
        if (!name) return { ok: false, error: "Enter the product name." };
        const code = draft.sku.trim() || (await nextItemCode(ctx.orgId));
        const taxRate = draft.taxRate.trim() ? Number(draft.taxRate) : null;
        const item = await createInventoryItem(ctx.orgId, {
          code,
          name,
          salePrice: parseAmount(draft.salePrice || "0", cur),
          barcode: draft.barcode.trim() || null,
          unit: draft.unit.trim() || null,
          reorderLevel: draft.reorderLevel.trim() || null,
          defaultTaxRate:
            taxRate != null && Number.isFinite(taxRate) && taxRate > 0 ? taxRate : null,
        });

        // Optional opening stock — only when a positive quantity, unit cost and
        // supplier are all present.
        const qty = draft.quantity.trim();
        const unitCost = parseAmount(draft.costPrice || "0", cur);
        if (qty && Number(qty) > 0 && unitCost > 0n) {
          const supplierId = await ensurePartyId(ctx, {
            partyId: input.partyId,
            createParty: input.createParty,
            partyName: draft.partyName,
            type: "supplier",
          });
          if (supplierId) {
            await receiveGoods(ctx.orgId, {
              partyId: supplierId,
              date,
              notes: `Opening stock — ${name}`,
              lines: [{ itemId: item.id, quantity: qty, unitCost }],
            });
          }
        }
        return { ok: true, href: `/inventory-items`, number: item.code, kind: input.action };
      }

      case "receive_stock": {
        const qty = draft.quantity.trim();
        if (!qty || Number(qty) <= 0) {
          return { ok: false, error: "Enter the quantity received." };
        }
        const unitCost = parseAmount(draft.costPrice || "0", cur);
        if (unitCost <= 0n) return { ok: false, error: "Unit cost must be greater than zero." };

        const supplierId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "supplier",
        });
        if (!supplierId) return { ok: false, error: "Choose a supplier." };

        let itemId = input.itemId ? await assertOrgItemId(ctx, input.itemId) : null;
        if (!itemId) {
          const name = draft.productName.trim();
          if (!name) return { ok: false, error: "Choose or name the inventory item." };
          const created = await createInventoryItem(ctx.orgId, {
            code: draft.sku.trim() || (await nextItemCode(ctx.orgId)),
            name,
            salePrice: parseAmount(draft.salePrice || "0", cur),
            barcode: draft.barcode.trim() || null,
            unit: draft.unit.trim() || null,
          });
          itemId = created.id;
        }

        const receipt = await receiveGoods(ctx.orgId, {
          partyId: supplierId,
          date,
          notes: draft.description.trim() || null,
          lines: [{ itemId, quantity: qty, unitCost }],
        });
        return {
          ok: true,
          href: `/goods-receipts/${receipt.id}`,
          number: receipt.number,
          kind: input.action,
        };
      }

      case "supplier_purchase": {
        const amount = parseAmount(draft.amount || "0", cur);
        if (amount <= 0n) return { ok: false, error: "Enter the invoice total." };
        if (!input.lineAccountId) return { ok: false, error: "Choose an expense/purchases account." };
        const lineAccountId = await assertOrgAccountId(ctx, input.lineAccountId);
        const supplierId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "supplier",
        });
        if (!supplierId) return { ok: false, error: "Choose a supplier." };

        const dueDate = draft.dueDate.trim() ? parseDate(draft.dueDate) : null;
        const invoice = await createPurchaseInvoice(ctx.orgId, {
          partyId: supplierId,
          date,
          dueDate,
          notes: draft.description.trim() || null,
          lines: [
            {
              description: draft.description.trim() || draft.partyName.trim() || "Purchase",
              quantity: "1",
              unitPrice: amount,
              accountId: lineAccountId,
            },
          ],
        });
        return {
          ok: true,
          href: `/purchase-invoices/${invoice.id}`,
          number: invoice.number,
          kind: input.action,
        };
      }

      case "customer_payment": {
        const amount = parseAmount(draft.amount || "0", cur);
        if (amount <= 0n) return { ok: false, error: "Enter the amount received." };
        if (!input.bankAccountId) return { ok: false, error: "Choose a bank or cash account." };
        const bankAccountId = await assertOrgAccountId(ctx, input.bankAccountId);
        const customerId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "customer",
        });
        if (!customerId) return { ok: false, error: "Choose the customer who paid." };

        const lineAccountId = input.lineAccountId
          ? await assertOrgAccountId(ctx, input.lineAccountId)
          : (await receivableAccount(ctx.orgId)).id;
        const receipt = await createReceipt(ctx.orgId, {
          date,
          bankAccountId,
          partyId: customerId,
          description: draft.description.trim() || null,
          paymentMethod: draft.paymentMethod.trim() || null,
          lines: [{ accountId: lineAccountId, amount }],
        });
        return {
          ok: true,
          href: `/receipts/${receipt.id}`,
          number: receipt.number,
          kind: input.action,
        };
      }

      case "expense": {
        const amount = parseAmount(draft.amount || "0", cur);
        if (amount <= 0n) return { ok: false, error: "Enter the amount paid." };
        if (!input.bankAccountId) return { ok: false, error: "Choose a bank or cash account." };
        if (!input.lineAccountId) return { ok: false, error: "Choose an expense account." };
        const bankAccountId = await assertOrgAccountId(ctx, input.bankAccountId);
        const lineAccountId = await assertOrgAccountId(ctx, input.lineAccountId);
        const supplierId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "supplier",
        });

        const payment = await createPayment(ctx.orgId, {
          date,
          bankAccountId,
          partyId: supplierId,
          description: draft.description.trim() || null,
          paymentMethod: draft.paymentMethod.trim() || null,
          lines: [{ accountId: lineAccountId, amount }],
        });
        return {
          ok: true,
          href: `/payments/${payment.id}`,
          number: payment.number,
          kind: input.action,
        };
      }

      case "sales_receipt": {
        const amount = parseAmount(draft.amount || "0", cur);
        if (amount <= 0n) return { ok: false, error: "Enter the sale amount." };
        if (!input.bankAccountId) return { ok: false, error: "Choose a bank or cash account." };
        if (!input.lineAccountId) return { ok: false, error: "Choose an income account." };
        const bankAccountId = await assertOrgAccountId(ctx, input.bankAccountId);
        const lineAccountId = await assertOrgAccountId(ctx, input.lineAccountId);
        const customerId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "customer",
        });

        const { quantity: lineQuantity, unitPrice: lineUnitPrice } = resolveLineQuantityAndPrice(
          draft,
          amount,
          cur,
        );
        const receipt = await createSalesReceipt(ctx.orgId, {
          bankAccountId,
          partyId: customerId,
          date,
          notes: draft.description.trim() || null,
          lines: [
            {
              description: draft.description.trim() || "Cash sale",
              quantity: lineQuantity,
              unitPrice: lineUnitPrice,
              accountId: lineAccountId,
            },
          ],
        });
        return {
          ok: true,
          href: `/sales-receipts/${receipt.id}`,
          number: receipt.number,
          kind: input.action,
        };
      }

      case "create_customer": {
        const name = draft.partyName.trim();
        if (!name) return { ok: false, error: "Enter the customer name." };

        if (input.partyId) {
          const found = await prisma.party.findFirst({
            where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["customer", "both"] } },
            select: { id: true, name: true, notes: true },
          });
          if (!found) return { ok: false, error: "That customer was not found." };

          // "Use existing customer" (whether from the duplicate-choice prompt
          // or a directly-selected existing match): enrich the existing
          // record with any new field values actually submitted, rather than
          // silently discarding them because the party already existed. Only
          // non-empty draft values are applied — an empty field never clears
          // something already on file (e.g. a pre-existing email is never
          // blanked out just because THIS request didn't mention it).
          const enrichment: {
            city?: string;
            phone?: string;
            whatsapp?: string;
            country?: string;
            email?: string;
            companyName?: string;
            taxId?: string;
            paymentTermsDays?: number;
            creditLimit?: bigint;
            defaultDiscount?: string;
            preferredLanguage?: string;
            preferredPaymentMethod?: string;
          } = {};
          if (draft.city.trim()) enrichment.city = draft.city;
          if (draft.phone.trim()) enrichment.phone = draft.phone;
          if (draft.whatsapp.trim()) enrichment.whatsapp = draft.whatsapp;
          if (draft.country.trim()) enrichment.country = draft.country;
          if (draft.email.trim()) enrichment.email = draft.email;
          if (draft.companyName.trim()) enrichment.companyName = draft.companyName;
          if (draft.taxId.trim()) enrichment.taxId = draft.taxId;
          if (draft.paymentTermsDays.trim()) {
            const days = Number(draft.paymentTermsDays);
            if (Number.isFinite(days) && days > 0) enrichment.paymentTermsDays = days;
          }
          if (draft.creditLimit.trim()) {
            const limit = parseAmount(draft.creditLimit, cur);
            if (limit > 0n) enrichment.creditLimit = limit;
          }
          if (draft.defaultDiscount.trim()) enrichment.defaultDiscount = draft.defaultDiscount;
          if (draft.preferredLanguage.trim()) enrichment.preferredLanguage = draft.preferredLanguage;
          if (draft.preferredPaymentMethod.trim())
            enrichment.preferredPaymentMethod = draft.preferredPaymentMethod;
          if (Object.keys(enrichment).length > 0) {
            await updateParty(ctx.orgId, found.id, enrichment);
          }

          if (draft.note.trim()) {
            await appendPartyNote(ctx.orgId, found.id, found.notes, draft.note.trim(), date);
          }
          return {
            ok: true,
            href: `/customers/${found.id}`,
            number: found.name,
            kind: input.action,
          };
        }

        const customerId = await ensurePartyId(ctx, {
          partyId: null,
          createParty: input.createParty,
          partyName: name,
          type: "customer",
          city: draft.city,
          phone: draft.phone,
          whatsapp: draft.whatsapp,
          country: draft.country,
          // See ensurePartyId's forceCreate doc comment: only true when the
          // user explicitly chose "create as a new customer with the same
          // name" in the duplicate-review prompt this exact request already
          // went through resolve-time.
          forceCreate: input.duplicateResolution === "create_new",
        });
        if (!customerId) return { ok: false, error: "Enter the customer name." };

        const party = await prisma.party.findFirst({
          where: { id: customerId, orgId: ctx.orgId },
          select: { id: true, name: true, notes: true },
        });
        if (!party) return { ok: false, error: "Could not save the customer." };

        // Launch Bug Fix Sprint: persist every extracted profile field on
        // the brand-new customer — previously dropped entirely because
        // neither the extraction schema nor this execute() branch carried
        // them through at all (see createCustomerSchema's doc comment in
        // lib/ai/actions.ts). companyName defaults to the customer's own
        // name when no DISTINCT company name was extracted (see the
        // "Company name field appears blank" bug this closes) — every other
        // field is applied only when actually present, same convention as
        // city/phone/whatsapp above.
        const profileFields: {
          email?: string;
          companyName?: string;
          taxId?: string;
          paymentTermsDays?: number;
          creditLimit?: bigint;
          defaultDiscount?: string;
          defaultCurrency?: string;
          preferredLanguage?: string;
          preferredPaymentMethod?: string;
        } = { companyName: draft.companyName.trim() || party.name };
        if (draft.email.trim()) profileFields.email = draft.email;
        if (draft.taxId.trim()) profileFields.taxId = draft.taxId;
        if (draft.paymentTermsDays.trim()) {
          const days = Number(draft.paymentTermsDays);
          if (Number.isFinite(days) && days > 0) profileFields.paymentTermsDays = days;
        }
        if (draft.creditLimit.trim()) {
          const limit = parseAmount(draft.creditLimit, cur);
          if (limit > 0n) profileFields.creditLimit = limit;
        }
        if (draft.defaultDiscount.trim()) profileFields.defaultDiscount = draft.defaultDiscount;
        if (draft.currency.trim()) profileFields.defaultCurrency = draft.currency;
        if (draft.preferredLanguage.trim()) profileFields.preferredLanguage = draft.preferredLanguage;
        if (draft.preferredPaymentMethod.trim())
          profileFields.preferredPaymentMethod = draft.preferredPaymentMethod;
        await updateParty(ctx.orgId, party.id, profileFields);

        if (draft.note.trim()) {
          await appendPartyNote(ctx.orgId, party.id, party.notes, draft.note.trim(), date);
        }

        return {
          ok: true,
          href: `/customers/${party.id}`,
          number: party.name,
          kind: input.action,
        };
      }

      // Supplier & Purchasing Intelligence Sprint: create_supplier is the
      // exact mirror of create_customer above (party type "supplier", href
      // under /suppliers) — see the launch-blocking bug postmortem comment
      // above createSupplierSchema in lib/ai/actions.ts. Before this case
      // existed, a "save him as a supplier" request had no dedicated action
      // to execute against at all, since the AI/rule layers had nowhere to
      // route a create_supplier classification.
      case "create_supplier": {
        const name = draft.partyName.trim();
        if (!name) return { ok: false, error: "Enter the supplier name." };

        if (input.partyId) {
          const found = await prisma.party.findFirst({
            where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["supplier", "both"] } },
            select: { id: true, name: true, notes: true },
          });
          if (!found) return { ok: false, error: "That supplier was not found." };

          // QA Reliability Swarm (Track 2/10) fix: this "use existing
          // supplier" branch used to only ever append the note — city,
          // phone, WhatsApp, and every extended profile field submitted with
          // THIS request were silently discarded whenever the party already
          // existed, even though the confirmation plan showed them as
          // "ready". Mirrors create_customer's enrichment block exactly
          // (same "only non-empty submitted fields, never blank out
          // something already on file" semantics).
          const enrichment: {
            city?: string;
            phone?: string;
            whatsapp?: string;
            country?: string;
            email?: string;
            companyName?: string;
            taxId?: string;
            paymentTermsDays?: number;
            creditLimit?: bigint;
            defaultDiscount?: string;
            preferredLanguage?: string;
            preferredPaymentMethod?: string;
          } = {};
          if (draft.city.trim()) enrichment.city = draft.city;
          if (draft.phone.trim()) enrichment.phone = draft.phone;
          if (draft.whatsapp.trim()) enrichment.whatsapp = draft.whatsapp;
          if (draft.country.trim()) enrichment.country = draft.country;
          if (draft.email.trim()) enrichment.email = draft.email;
          if (draft.companyName.trim()) enrichment.companyName = draft.companyName;
          if (draft.taxId.trim()) enrichment.taxId = draft.taxId;
          if (draft.paymentTermsDays.trim()) {
            const days = Number(draft.paymentTermsDays);
            if (Number.isFinite(days) && days > 0) enrichment.paymentTermsDays = days;
          }
          if (draft.creditLimit.trim()) {
            const limit = parseAmount(draft.creditLimit, cur);
            if (limit > 0n) enrichment.creditLimit = limit;
          }
          if (draft.defaultDiscount.trim()) enrichment.defaultDiscount = draft.defaultDiscount;
          if (draft.preferredLanguage.trim()) enrichment.preferredLanguage = draft.preferredLanguage;
          if (draft.preferredPaymentMethod.trim())
            enrichment.preferredPaymentMethod = draft.preferredPaymentMethod;
          if (Object.keys(enrichment).length > 0) {
            await updateParty(ctx.orgId, found.id, enrichment);
          }

          if (draft.note.trim()) {
            await appendPartyNote(ctx.orgId, found.id, found.notes, draft.note.trim(), date);
          }
          return {
            ok: true,
            href: `/suppliers/${found.id}`,
            number: found.name,
            kind: input.action,
          };
        }

        const supplierId = await ensurePartyId(ctx, {
          partyId: null,
          createParty: input.createParty,
          partyName: name,
          type: "supplier",
          city: draft.city,
          phone: draft.phone,
          whatsapp: draft.whatsapp,
          country: draft.country,
          // See ensurePartyId's forceCreate doc comment and create_customer's
          // identical usage above — same duplicate-choice-prompt contract,
          // now ported to create_supplier (QA Reliability Swarm Track 4).
          forceCreate: input.duplicateResolution === "create_new",
        });
        if (!supplierId) return { ok: false, error: "Enter the supplier name." };

        const party = await prisma.party.findFirst({
          where: { id: supplierId, orgId: ctx.orgId },
          select: { id: true, name: true, notes: true },
        });
        if (!party) return { ok: false, error: "Could not save the supplier." };

        // QA Reliability Swarm (Track 2) field-persistence parity fix —
        // mirrors create_customer's profileFields block exactly, now that
        // createSupplierSchema/BantooDraft carry the same extended fields.
        const profileFields: {
          email?: string;
          companyName?: string;
          taxId?: string;
          paymentTermsDays?: number;
          creditLimit?: bigint;
          defaultDiscount?: string;
          defaultCurrency?: string;
          preferredLanguage?: string;
          preferredPaymentMethod?: string;
        } = { companyName: draft.companyName.trim() || party.name };
        if (draft.email.trim()) profileFields.email = draft.email;
        if (draft.taxId.trim()) profileFields.taxId = draft.taxId;
        if (draft.paymentTermsDays.trim()) {
          const days = Number(draft.paymentTermsDays);
          if (Number.isFinite(days) && days > 0) profileFields.paymentTermsDays = days;
        }
        if (draft.creditLimit.trim()) {
          const limit = parseAmount(draft.creditLimit, cur);
          if (limit > 0n) profileFields.creditLimit = limit;
        }
        if (draft.defaultDiscount.trim()) profileFields.defaultDiscount = draft.defaultDiscount;
        if (draft.currency.trim()) profileFields.defaultCurrency = draft.currency;
        if (draft.preferredLanguage.trim()) profileFields.preferredLanguage = draft.preferredLanguage;
        if (draft.preferredPaymentMethod.trim())
          profileFields.preferredPaymentMethod = draft.preferredPaymentMethod;
        await updateParty(ctx.orgId, party.id, profileFields);

        if (draft.note.trim()) {
          await appendPartyNote(ctx.orgId, party.id, party.notes, draft.note.trim(), date);
        }

        return {
          ok: true,
          href: `/suppliers/${party.id}`,
          number: party.name,
          kind: input.action,
        };
      }

      // --- Customer Intelligence Sprint: existing-customer workflows -----
      // Every case re-validates that partyId belongs to this org before
      // reading/writing anything, mirroring ensurePartyId/assertOrgItemId
      // above — the client-resolved id from resolve.ts is never trusted
      // blindly at execute time either.

      case "edit_customer": {
        if (!input.partyId) return { ok: false, error: "Choose the customer to edit." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["customer", "both"] } },
          select: { id: true, notes: true },
        });
        if (!found) return { ok: false, error: "That customer was not found." };

        const updated = await updateParty(ctx.orgId, found.id, {
          name: draft.newName.trim() || undefined,
          phone: draft.phone,
          whatsapp: draft.whatsapp,
          email: draft.email,
          city: draft.city,
        });
        if (!updated) return { ok: false, error: "Could not update that customer." };

        if (draft.note.trim()) {
          await appendPartyNote(ctx.orgId, updated.id, found.notes, draft.note.trim(), date);
        }

        return {
          ok: true,
          href: `/customers/${updated.id}`,
          number: updated.name,
          kind: input.action,
          message: `${updated.name} was updated.`,
        };
      }

      case "view_customer": {
        if (draft.view === "list") {
          return { ok: true, href: "/customers", number: "", kind: input.action };
        }
        if (!input.partyId) return { ok: false, error: "Choose a customer." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["customer", "both"] } },
          select: { id: true, name: true },
        });
        if (!found) return { ok: false, error: "That customer was not found." };

        const statementParams = new URLSearchParams({ partyId: found.id });
        if (draft.dateFrom) statementParams.set("from", draft.dateFrom);
        if (draft.dateTo) statementParams.set("to", draft.dateTo);
        const hrefByView: Record<string, string> = {
          profile: `/customers/${found.id}`,
          ledger: `/customers/${found.id}?tab=transactions`,
          documents: `/customers/${found.id}?tab=documents`,
          statement: `/reports/customer-statement?${statementParams.toString()}`,
        };
        return {
          ok: true,
          href: hrefByView[draft.view] ?? `/customers/${found.id}`,
          number: found.name,
          kind: input.action,
        };
      }

      case "customer_balance": {
        if (!input.partyId) return { ok: false, error: "Choose a customer." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["customer", "both"] } },
          select: { id: true, name: true },
        });
        if (!found) return { ok: false, error: "That customer was not found." };

        const balance = await getPartyBalance(ctx.orgId, found.id, "customer");
        const formatted = formatAmount(balance < 0n ? -balance : balance, cur);
        const message =
          balance > 0n
            ? t("balanceCustomerOwes", { name: found.name, amount: formatted, currency: cur })
            : balance < 0n
              ? t("balanceCustomerCredit", { name: found.name, amount: formatted, currency: cur })
              : t("balanceCustomerNone", { name: found.name });
        return {
          ok: true,
          href: `/customers/${found.id}?tab=transactions`,
          number: found.name,
          kind: input.action,
          message,
        };
      }

      case "add_customer_note": {
        if (!input.partyId) return { ok: false, error: "Choose a customer." };
        const noteText = draft.note.trim();
        if (!noteText) return { ok: false, error: "Enter the note text." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["customer", "both"] } },
          select: { id: true, name: true, notes: true },
        });
        if (!found) return { ok: false, error: "That customer was not found." };

        const stamp = date.toISOString().slice(0, 10);
        const existing = found.notes?.trim();
        const appended = existing ? `${existing}\n[${stamp}] ${noteText}` : `[${stamp}] ${noteText}`;
        const updated = await updatePartyNotes(ctx.orgId, found.id, appended);
        if (!updated) return { ok: false, error: "Could not save the note." };
        return {
          ok: true,
          href: `/customers/${found.id}?tab=notes`,
          number: found.name,
          kind: input.action,
          message: t("successNoteAdded", { number: found.name }),
        };
      }

      case "contact_customer": {
        if (!input.partyId) return { ok: false, error: "Choose a customer." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["customer", "both"] } },
          select: { id: true, name: true, phone: true, whatsapp: true, email: true },
        });
        if (!found) return { ok: false, error: "That customer was not found." };

        if (draft.contactMethod === "whatsapp") {
          const wa = found.whatsapp || found.phone;
          if (!wa) {
            return { ok: false, error: "This customer has no WhatsApp number on file. Add one first." };
          }
          const digits = wa.replace(/[^\d]/g, "");
          return { ok: true, href: `https://wa.me/${digits}`, number: found.name, kind: input.action };
        }
        if (draft.contactMethod === "email") {
          if (!found.email) {
            return { ok: false, error: "This customer has no email on file. Add one first." };
          }
          return { ok: true, href: `mailto:${found.email}`, number: found.name, kind: input.action };
        }
        if (!found.phone) {
          return { ok: false, error: "This customer has no phone number on file. Add one first." };
        }
        return { ok: true, href: `tel:${found.phone}`, number: found.name, kind: input.action };
      }

      case "customer_query": {
        if (!input.partyId) return { ok: false, error: "Choose a customer." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["customer", "both"] } },
          select: { id: true, name: true },
        });
        if (!found) return { ok: false, error: "That customer was not found." };

        const result = await getPartyPurchaseHistoryInRange(
          ctx.orgId,
          found.id,
          "customer",
          draft.dateFrom || null,
          draft.dateTo || null,
        );
        const periodSuffix = draft.periodText ? ` (${draft.periodText})` : "";
        const message =
          result.items.length > 0
            ? t("queryCustomerBought", {
                name: found.name,
                period: periodSuffix,
                items: result.items
                  .map((i) => `${i.name} (${i.quantity}${i.unit ? ` ${i.unit}` : ""})`)
                  .join(", "),
              })
            : t("queryCustomerNone", { name: found.name, period: periodSuffix });
        return {
          ok: true,
          href: `/customers/${found.id}?tab=products`,
          number: found.name,
          kind: input.action,
          message,
        };
      }

      case "unsupported_customer_action":
        return { ok: false, error: "This action is not available yet." };

      // --- Supplier & Purchasing Intelligence Sprint: existing-supplier
      // workflows. Every case is a field-for-field mirror of the matching
      // customer_* case above, with the party type filter and hrefs swapped
      // to /suppliers, and the balance/query messages framed in the
      // payable/purchasing direction instead of receivable/sales.

      case "edit_supplier": {
        if (!input.partyId) return { ok: false, error: "Choose the supplier to edit." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["supplier", "both"] } },
          select: { id: true },
        });
        if (!found) return { ok: false, error: "That supplier was not found." };

        const updated = await updateParty(ctx.orgId, found.id, {
          name: draft.newName.trim() || undefined,
          phone: draft.phone,
          whatsapp: draft.whatsapp,
          email: draft.email,
          city: draft.city,
        });
        if (!updated) return { ok: false, error: "Could not update that supplier." };
        return {
          ok: true,
          href: `/suppliers/${updated.id}`,
          number: updated.name,
          kind: input.action,
          message: t("successCustomerUpdated", { number: updated.name }),
        };
      }

      case "view_supplier": {
        if (draft.view === "list") {
          return { ok: true, href: "/suppliers", number: "", kind: input.action };
        }
        if (!input.partyId) return { ok: false, error: "Choose a supplier." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["supplier", "both"] } },
          select: { id: true, name: true },
        });
        if (!found) return { ok: false, error: "That supplier was not found." };

        const hrefByView: Record<string, string> = {
          profile: `/suppliers/${found.id}`,
          ledger: `/suppliers/${found.id}?tab=transactions`,
          documents: `/suppliers/${found.id}?tab=documents`,
        };
        return {
          ok: true,
          href: hrefByView[draft.view] ?? `/suppliers/${found.id}`,
          number: found.name,
          kind: input.action,
        };
      }

      case "supplier_balance": {
        if (!input.partyId) return { ok: false, error: "Choose a supplier." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["supplier", "both"] } },
          select: { id: true, name: true },
        });
        if (!found) return { ok: false, error: "That supplier was not found." };

        // getPartyBalance("supplier") is the payable balance: positive means
        // the org owes this supplier (see lib/party-ledger.ts and the
        // "Amounts you owe suppliers" framing on reports/supplier-balances) —
        // the opposite direction from customer_balance's receivable.
        const balance = await getPartyBalance(ctx.orgId, found.id, "supplier");
        const formatted = formatAmount(balance < 0n ? -balance : balance, cur);
        const message =
          balance > 0n
            ? t("balanceSupplierOwed", { name: found.name, amount: formatted, currency: cur })
            : balance < 0n
              ? t("balanceSupplierCredit", { name: found.name, amount: formatted, currency: cur })
              : t("balanceSupplierNone", { name: found.name });
        return {
          ok: true,
          href: `/suppliers/${found.id}?tab=transactions`,
          number: found.name,
          kind: input.action,
          message,
        };
      }

      case "add_supplier_note": {
        if (!input.partyId) return { ok: false, error: "Choose a supplier." };
        const noteText = draft.note.trim();
        if (!noteText) return { ok: false, error: "Enter the note text." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["supplier", "both"] } },
          select: { id: true, name: true, notes: true },
        });
        if (!found) return { ok: false, error: "That supplier was not found." };

        const stamp = date.toISOString().slice(0, 10);
        const existing = found.notes?.trim();
        const appended = existing ? `${existing}\n[${stamp}] ${noteText}` : `[${stamp}] ${noteText}`;
        const updated = await updatePartyNotes(ctx.orgId, found.id, appended);
        if (!updated) return { ok: false, error: "Could not save the note." };
        return {
          ok: true,
          href: `/suppliers/${found.id}?tab=notes`,
          number: found.name,
          kind: input.action,
          message: t("successNoteAdded", { number: found.name }),
        };
      }

      case "contact_supplier": {
        if (!input.partyId) return { ok: false, error: "Choose a supplier." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["supplier", "both"] } },
          select: { id: true, name: true, phone: true, whatsapp: true, email: true },
        });
        if (!found) return { ok: false, error: "That supplier was not found." };

        if (draft.contactMethod === "whatsapp") {
          const wa = found.whatsapp || found.phone;
          if (!wa) {
            return { ok: false, error: "This supplier has no WhatsApp number on file. Add one first." };
          }
          const digits = wa.replace(/[^\d]/g, "");
          return { ok: true, href: `https://wa.me/${digits}`, number: found.name, kind: input.action };
        }
        if (draft.contactMethod === "email") {
          if (!found.email) {
            return { ok: false, error: "This supplier has no email on file. Add one first." };
          }
          return { ok: true, href: `mailto:${found.email}`, number: found.name, kind: input.action };
        }
        if (!found.phone) {
          return { ok: false, error: "This supplier has no phone number on file. Add one first." };
        }
        return { ok: true, href: `tel:${found.phone}`, number: found.name, kind: input.action };
      }

      case "supplier_query": {
        if (!input.partyId) return { ok: false, error: "Choose a supplier." };
        const found = await prisma.party.findFirst({
          where: { id: input.partyId, orgId: ctx.orgId, type: { in: ["supplier", "both"] } },
          select: { id: true, name: true },
        });
        if (!found) return { ok: false, error: "That supplier was not found." };

        const result = await getPartyPurchaseHistoryInRange(
          ctx.orgId,
          found.id,
          "supplier",
          draft.dateFrom || null,
          draft.dateTo || null,
        );
        const periodSuffix = draft.periodText ? ` (${draft.periodText})` : "";
        const message =
          result.items.length > 0
            ? t("querySupplierBought", {
                name: found.name,
                period: periodSuffix,
                items: result.items
                  .map((i) => `${i.name} (${i.quantity}${i.unit ? ` ${i.unit}` : ""})`)
                  .join(", "),
              })
            : t("querySupplierNone", { name: found.name, period: periodSuffix });
        return {
          ok: true,
          href: `/suppliers/${found.id}?tab=products`,
          number: found.name,
          kind: input.action,
          message,
        };
      }

      case "unsupported_supplier_action":
        return { ok: false, error: "This action is not available yet." };

      // --- Sales Intelligence Sprint: single-line/lump-sum sales documents,
      // mirroring supplier_purchase (sales_invoice) and sales_receipt
      // (refund_receipt's bank + income-account shape) above.

      case "sales_invoice": {
        const amount = parseAmount(draft.amount || "0", cur);
        if (amount <= 0n) return { ok: false, error: "Enter the sale amount." };
        if (!input.lineAccountId) return { ok: false, error: "Choose an income account." };
        const lineAccountId = await assertOrgAccountId(ctx, input.lineAccountId);
        const customerId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "customer",
        });
        if (!customerId) return { ok: false, error: "Choose the customer to invoice." };

        const dueDate = draft.dueDate.trim() ? parseDate(draft.dueDate) : null;
        const { quantity: lineQuantity, unitPrice: lineUnitPrice } = resolveLineQuantityAndPrice(
          draft,
          amount,
          cur,
        );
        const invoice = await createSalesInvoice(ctx.orgId, {
          partyId: customerId,
          date,
          dueDate,
          notes: draft.description.trim() || null,
          lines: [
            {
              description: draft.description.trim() || "Sale",
              quantity: lineQuantity,
              unitPrice: lineUnitPrice,
              accountId: lineAccountId,
            },
          ],
        });
        return {
          ok: true,
          href: `/sales-invoices/${invoice.id}`,
          number: invoice.number,
          kind: input.action,
        };
      }

      case "credit_note": {
        const amount = parseAmount(draft.amount || "0", cur);
        if (amount <= 0n) return { ok: false, error: "Enter the credit amount." };
        if (!input.lineAccountId) return { ok: false, error: "Choose an income account." };
        const lineAccountId = await assertOrgAccountId(ctx, input.lineAccountId);
        const customerId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "customer",
        });
        if (!customerId) return { ok: false, error: "Choose the customer to credit." };

        const { quantity: lineQuantity, unitPrice: lineUnitPrice } = resolveLineQuantityAndPrice(
          draft,
          amount,
          cur,
        );
        const note = await createCreditNote(ctx.orgId, {
          partyId: customerId,
          date,
          notes: draft.description.trim() || null,
          lines: [
            {
              description: draft.description.trim() || "Credit note",
              quantity: lineQuantity,
              unitPrice: lineUnitPrice,
              accountId: lineAccountId,
            },
          ],
        });
        return {
          ok: true,
          href: `/credit-notes/${note.id}`,
          number: note.number,
          kind: input.action,
        };
      }

      case "refund_receipt": {
        const amount = parseAmount(draft.amount || "0", cur);
        if (amount <= 0n) return { ok: false, error: "Enter the refund amount." };
        if (!input.bankAccountId) return { ok: false, error: "Choose a bank or cash account." };
        if (!input.lineAccountId) return { ok: false, error: "Choose an income account." };
        const bankAccountId = await assertOrgAccountId(ctx, input.bankAccountId);
        const lineAccountId = await assertOrgAccountId(ctx, input.lineAccountId);
        // Unlike sales_invoice/credit_note, the customer is OPTIONAL here (a
        // cash refund can be walk-in/anonymous) — createRefundReceipt accepts
        // a nullable partyId.
        const customerId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "customer",
        });

        const { quantity: lineQuantity, unitPrice: lineUnitPrice } = resolveLineQuantityAndPrice(
          draft,
          amount,
          cur,
        );
        const refund = await createRefundReceipt(ctx.orgId, {
          bankAccountId,
          partyId: customerId,
          date,
          notes: draft.description.trim() || null,
          lines: [
            {
              description: draft.description.trim() || "Refund",
              quantity: lineQuantity,
              unitPrice: lineUnitPrice,
              accountId: lineAccountId,
            },
          ],
        });
        return {
          ok: true,
          href: `/refund-receipts/${refund.id}`,
          number: refund.number,
          kind: input.action,
        };
      }

      case "view_sales_invoice":
        return { ok: true, href: "/sales-invoices", number: "", kind: input.action };

      case "unsupported_sales_action":
        return { ok: false, error: "This action is not available yet." };

      default:
        return { ok: false, error: "This action can't be saved automatically yet." };
    }
  } catch (err) {
    if (err instanceof DocumentError) {
      return { ok: false, error: err.message };
    }
    console.error("[bantoo/execute] failed:", err);
    return { ok: false, error: "Could not save. Please try again." };
  }
}
