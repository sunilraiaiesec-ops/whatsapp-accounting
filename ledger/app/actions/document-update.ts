"use server";

import { redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { parseAmount } from "@/lib/money";
import { DocumentError } from "@/lib/documents";
import { LedgerError } from "@/lib/ledger";
import {
  updateReceipt,
  updatePayment,
  updateInterAccountTransfer,
  updateSalesInvoice,
  updatePurchaseInvoice,
  updateCreditNote,
  updateDebitNote,
} from "@/lib/document-update";
import { updateGoodsReceipt, updateWriteOff } from "@/lib/inventory";

export type DocState = { error?: string };

function parseDate(value: FormDataEntryValue | null, fallback = new Date()): Date {
  const s = String(value || "").trim();
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function fail(err: unknown): DocState {
  if (err instanceof DocumentError || err instanceof LedgerError) {
    return { error: err.message };
  }
  console.error(err);
  return { error: "Could not save. Please try again." };
}

function parseInvoiceLines(formData: FormData, currency: string) {
  let raw: {
    description?: string;
    quantity?: string;
    unitPrice?: string;
    accountId?: string;
    itemId?: string;
  }[];
  try {
    raw = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    return null;
  }
  return raw
    .filter((l) => (l.description ?? "").trim() && l.accountId)
    .map((l) => ({
      description: l.description ?? "",
      quantity: (l.quantity ?? "1").trim() || "1",
      unitPrice: parseAmount(l.unitPrice ?? "0", currency),
      accountId: l.accountId as string,
      itemId: l.itemId || null,
    }));
}

function parseCashLines(formData: FormData, currency: string) {
  let raw: { accountId?: string; amount?: string; memo?: string }[];
  try {
    raw = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    return null;
  }
  return raw
    .map((l) => ({
      accountId: l.accountId ?? "",
      amount: parseAmount(l.amount ?? "0", currency),
      memo: l.memo?.trim() || null,
    }))
    .filter((l) => l.accountId && l.amount > 0n);
}

export async function updateReceiptAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const bankAccountId = String(formData.get("bankAccountId") || "");
  if (!bankAccountId) return { error: "Choose where the money was received" };
  const lines = parseCashLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };

  try {
    await updateReceipt(ctx.orgId, id, {
      date: parseDate(formData.get("date")),
      bankAccountId,
      partyId: String(formData.get("partyId") || "") || null,
      reference: String(formData.get("reference") || "") || null,
      description: String(formData.get("description") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/receipts/${id}`);
}

export async function updatePaymentAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const bankAccountId = String(formData.get("bankAccountId") || "");
  if (!bankAccountId) return { error: "Choose where the money was paid from" };
  const lines = parseCashLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };

  try {
    await updatePayment(ctx.orgId, id, {
      date: parseDate(formData.get("date")),
      bankAccountId,
      partyId: String(formData.get("partyId") || "") || null,
      reference: String(formData.get("reference") || "") || null,
      description: String(formData.get("description") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/payments/${id}`);
}

export async function updateInterAccountTransferAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");

  try {
    await updateInterAccountTransfer(ctx.orgId, id, {
      date: parseDate(formData.get("date")),
      fromAccountId: String(formData.get("fromAccountId") || ""),
      toAccountId: String(formData.get("toAccountId") || ""),
      amount: parseAmount(String(formData.get("amount") || "0"), ctx.baseCurrency),
      reference: String(formData.get("reference") || "") || null,
      description: String(formData.get("description") || "") || null,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/inter-account-transfers/${id}`);
}

export async function updateSalesInvoiceAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const partyId = String(formData.get("partyId") || "");
  if (!partyId) return { error: "Choose a customer" };
  const lines = parseInvoiceLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };
  const dueRaw = String(formData.get("dueDate") || "").trim();

  try {
    await updateSalesInvoice(ctx.orgId, id, {
      partyId,
      date: parseDate(formData.get("date")),
      dueDate: dueRaw ? parseDate(formData.get("dueDate")) : null,
      reference: String(formData.get("reference") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/sales-invoices/${id}`);
}

export async function updatePurchaseInvoiceAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const partyId = String(formData.get("partyId") || "");
  if (!partyId) return { error: "Choose a supplier" };
  const lines = parseInvoiceLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };
  const dueRaw = String(formData.get("dueDate") || "").trim();

  try {
    await updatePurchaseInvoice(ctx.orgId, id, {
      partyId,
      date: parseDate(formData.get("date")),
      dueDate: dueRaw ? parseDate(formData.get("dueDate")) : null,
      supplierRef: String(formData.get("supplierRef") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/purchase-invoices/${id}`);
}

export async function updateCreditNoteAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const partyId = String(formData.get("partyId") || "");
  if (!partyId) return { error: "Choose a customer" };
  const lines = parseInvoiceLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };

  try {
    await updateCreditNote(ctx.orgId, id, {
      partyId,
      date: parseDate(formData.get("date")),
      reference: String(formData.get("reference") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/credit-notes/${id}`);
}

export async function updateDebitNoteAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const partyId = String(formData.get("partyId") || "");
  if (!partyId) return { error: "Choose a supplier" };
  const lines = parseInvoiceLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };

  try {
    await updateDebitNote(ctx.orgId, id, {
      partyId,
      date: parseDate(formData.get("date")),
      supplierRef: String(formData.get("supplierRef") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/debit-notes/${id}`);
}

export async function updateGoodsReceiptAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
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
    await updateGoodsReceipt(ctx.orgId, id, {
      partyId: String(formData.get("partyId") || ""),
      date: parseDate(formData.get("date")),
      reference: String(formData.get("reference") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/goods-receipts/${id}`);
}

export async function updateWriteOffAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
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
    await updateWriteOff(ctx.orgId, id, {
      date: parseDate(formData.get("date")),
      expenseAccountId: String(formData.get("expenseAccountId") || ""),
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/inventory-write-offs/${id}`);
}
