"use server";

import { z } from "zod";

import { requireContext, type CurrentContext } from "@/lib/auth/current";
import { receivableAccount } from "@/lib/accounts";
import {
  createPayment,
  createPurchaseInvoice,
  createReceipt,
  createSalesReceipt,
  DocumentError,
} from "@/lib/documents";
import { createInventoryItem, receiveGoods } from "@/lib/inventory";
import { MATCH_HIGH } from "@/lib/bantoo/match";
import { parseAmount } from "@/lib/money";
import { createParty, findPossiblePartyDuplicates } from "@/lib/parties";
import { prisma } from "@/lib/prisma";
import { BANTOO_ACTION_TYPES } from "@/lib/ai/actions";
import { isAiConfigured } from "@/lib/ai/provider";
import {
  productDefaultsFromItem,
  searchEntities,
} from "@/lib/bantoo/entities";
import { listInventoryItems } from "@/lib/inventory";
import type {
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
  partyName: z.string().max(200).default(""),
  paymentMethod: z.string().max(100).default(""),
  description: z.string().max(500).default(""),
  date: z.string().max(40).default(""),
  dueDate: z.string().max(40).default(""),
  currency: z.string().max(8).default("XAF"),
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
  input: { partyId: string | null; createParty: boolean; partyName: string; type: "customer" | "supplier" },
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
    const duplicates = await findPossiblePartyDuplicates(ctx.orgId, {
      name: input.partyName,
    });
    const highConfidence = duplicates.find((d) => d.score >= MATCH_HIGH);
    if (highConfidence) return highConfidence.id;

    const created = await createParty(ctx.orgId, {
      name: input.partyName.trim(),
      type: input.type,
    });
    return created.id;
  }
  return null;
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

        const receipt = await createSalesReceipt(ctx.orgId, {
          bankAccountId,
          partyId: customerId,
          date,
          notes: draft.description.trim() || null,
          lines: [
            {
              description: draft.description.trim() || "Cash sale",
              quantity: "1",
              unitPrice: amount,
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
