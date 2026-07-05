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
import { parseAmount } from "@/lib/money";
import { createParty } from "@/lib/parties";
import { prisma } from "@/lib/prisma";
import { BANTOO_ACTION_TYPES } from "@/lib/ai/actions";
import { isAiConfigured } from "@/lib/ai/provider";
import type { BantooExecuteResult, ExecuteBantooInput } from "@/lib/bantoo/types";

// Lets the client know whether AI photo/voice capture is available WITHOUT ever
// exposing the key itself — only a boolean crosses the wire. Text still works
// via the rule-based fallback when this is false.
export async function getBantooAiStatus(): Promise<{ configured: boolean }> {
  await requireContext();
  return { configured: isAiConfigured() };
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
    const created = await createParty(ctx.orgId, {
      name: input.partyName.trim(),
      type: input.type,
    });
    return created.id;
  }
  return null;
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

        let itemId = input.itemId;
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
        const supplierId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "supplier",
        });
        if (!supplierId) return { ok: false, error: "Choose a supplier." };

        const invoice = await createPurchaseInvoice(ctx.orgId, {
          partyId: supplierId,
          date,
          notes: draft.description.trim() || null,
          lines: [
            {
              description: draft.description.trim() || draft.partyName.trim() || "Purchase",
              quantity: "1",
              unitPrice: amount,
              accountId: input.lineAccountId,
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
        const customerId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "customer",
        });
        if (!customerId) return { ok: false, error: "Choose the customer who paid." };

        const lineAccountId =
          input.lineAccountId ?? (await receivableAccount(ctx.orgId)).id;
        const receipt = await createReceipt(ctx.orgId, {
          date,
          bankAccountId: input.bankAccountId,
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
        const supplierId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "supplier",
        });

        const payment = await createPayment(ctx.orgId, {
          date,
          bankAccountId: input.bankAccountId,
          partyId: supplierId,
          description: draft.description.trim() || null,
          paymentMethod: draft.paymentMethod.trim() || null,
          lines: [{ accountId: input.lineAccountId, amount }],
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
        const customerId = await ensurePartyId(ctx, {
          partyId: input.partyId,
          createParty: input.createParty,
          partyName: draft.partyName,
          type: "customer",
        });

        const receipt = await createSalesReceipt(ctx.orgId, {
          bankAccountId: input.bankAccountId,
          partyId: customerId,
          date,
          notes: draft.description.trim() || null,
          lines: [
            {
              description: draft.description.trim() || "Cash sale",
              quantity: "1",
              unitPrice: amount,
              accountId: input.lineAccountId,
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
