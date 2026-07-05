"use server";

import { redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { parseAmount } from "@/lib/money";
import {
  adjustInventory,
  createInventoryItem,
  receiveGoods,
  writeOffInventory,
} from "@/lib/inventory";
import { DocumentError } from "@/lib/documents";
import { LedgerError } from "@/lib/ledger";

export type InvState = { error?: string };

function parseDate(value: FormDataEntryValue | null, fallback = new Date()): Date {
  const s = String(value || "").trim();
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function fail(err: unknown): InvState {
  if (err instanceof DocumentError || err instanceof LedgerError) {
    return { error: err.message };
  }
  console.error(err);
  return { error: "Could not save. Please try again." };
}

export async function createInventoryItemAction(
  _prev: InvState,
  formData: FormData,
): Promise<InvState> {
  const ctx = await requireContext();
  const taxRaw = String(formData.get("defaultTaxRate") || "").trim();
  const taxRate = taxRaw ? Number(taxRaw) : null;
  const reorderRaw = String(formData.get("reorderLevel") || "").trim();
  try {
    await createInventoryItem(ctx.orgId, {
      code: String(formData.get("code") || ""),
      name: String(formData.get("name") || ""),
      salePrice: parseAmount(String(formData.get("salePrice") || "0"), ctx.baseCurrency),
      barcode: String(formData.get("barcode") || "") || null,
      unit: String(formData.get("unit") || "") || null,
      reorderLevel: reorderRaw || null,
      defaultTaxRate: taxRate != null && Number.isFinite(taxRate) && taxRate > 0 ? taxRate : null,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/inventory-items");
}

export async function createGoodsReceiptAction(
  _prev: InvState,
  formData: FormData,
): Promise<InvState> {
  const ctx = await requireContext();
  let raw: { itemId?: string; quantity?: string; unitCost?: string }[];
  try {
    raw = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    return { error: "Could not read line items" };
  }
  const lines = raw
    .filter((l) => l.itemId)
    .map((l) => ({
      itemId: l.itemId as string,
      quantity: (l.quantity ?? "0").trim() || "0",
      unitCost: parseAmount(l.unitCost ?? "0", ctx.baseCurrency),
    }));

  try {
    await receiveGoods(ctx.orgId, {
      partyId: String(formData.get("partyId") || ""),
      date: parseDate(formData.get("date")),
      reference: String(formData.get("reference") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/goods-receipts");
}

export async function createWriteOffAction(
  _prev: InvState,
  formData: FormData,
): Promise<InvState> {
  const ctx = await requireContext();
  let raw: { itemId?: string; quantity?: string }[];
  try {
    raw = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    return { error: "Could not read line items" };
  }
  const lines = raw
    .filter((l) => l.itemId)
    .map((l) => ({
      itemId: l.itemId as string,
      quantity: (l.quantity ?? "0").trim() || "0",
    }));

  try {
    await writeOffInventory(ctx.orgId, {
      date: parseDate(formData.get("date")),
      expenseAccountId: String(formData.get("expenseAccountId") || ""),
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/inventory-write-offs");
}

export async function createInventoryAdjustmentAction(
  _prev: InvState,
  formData: FormData,
): Promise<InvState> {
  const ctx = await requireContext();
  let raw: { itemId?: string; newQuantity?: string }[];
  try {
    raw = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    return { error: "Could not read line items" };
  }
  const lines = raw
    .filter((l) => l.itemId)
    .map((l) => ({
      itemId: l.itemId as string,
      newQuantity: String(l.newQuantity ?? "").trim(),
    }));

  try {
    await adjustInventory(ctx.orgId, {
      date: parseDate(formData.get("date")),
      adjustmentAccountId: String(formData.get("adjustmentAccountId") || ""),
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/inventory-adjustments");
}
