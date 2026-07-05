"use server";

import { redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { parseAmount } from "@/lib/money";
import {
  createReceipt,
  createPayment,
  createSalesInvoice,
  createSalesReceipt,
  createRefundReceipt,
  createPurchaseInvoice,
  createInterAccountTransfer,
  createCreditNote,
  createDebitNote,
  cloneReceipt,
  clonePayment,
  cloneSalesInvoice,
  clonePurchaseInvoice,
  cloneInterAccountTransfer,
  cloneCreditNote,
  cloneDebitNote,
  DocumentError,
} from "@/lib/documents";
import { LedgerError } from "@/lib/ledger";

export type DocState = { error?: string };

function parseDate(value: FormDataEntryValue | null, fallback = new Date()): Date {
  const s = String(value || "").trim();
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function parseTags(formData: FormData): string[] {
  try {
    const raw = JSON.parse(String(formData.get("tags") || "[]"));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function parseTaxRate(value: unknown): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCurrency(formData: FormData): {
  currency: string | null;
  exchangeRate: string | null;
} {
  const currency = String(formData.get("currency") || "").trim() || null;
  const rate = String(formData.get("exchangeRate") || "").trim() || null;
  return { currency, exchangeRate: rate };
}

function parseCashLines(formData: FormData, currency: string) {
  let raw: {
    accountId?: string;
    amount?: string;
    memo?: string;
    className?: string;
    taxRate?: string;
  }[];
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
      className: l.className?.trim() || null,
      taxRate: parseTaxRate(l.taxRate),
    }))
    .filter((l) => l.accountId && l.amount > 0n);
}

function parseItemLines(formData: FormData, currency: string) {
  let raw: {
    itemId?: string;
    quantity?: string;
    unitCost?: string;
    memo?: string;
    className?: string;
    taxRate?: string;
  }[];
  try {
    raw = JSON.parse(String(formData.get("itemLines") || "[]"));
  } catch {
    return [];
  }
  return raw
    .filter((l) => l.itemId)
    .map((l) => ({
      itemId: l.itemId as string,
      quantity: (l.quantity ?? "0").trim() || "0",
      unitCost: parseAmount(l.unitCost ?? "0", currency),
      memo: l.memo?.trim() || null,
      className: l.className?.trim() || null,
      taxRate: parseTaxRate(l.taxRate),
    }));
}

function parseInvoiceLines(formData: FormData, currency: string) {
  let raw: {
    description?: string;
    quantity?: string;
    unitPrice?: string;
    accountId?: string;
    itemId?: string;
    taxRate?: string;
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
      taxRate: parseTaxRate(l.taxRate),
    }));
}

function fail(err: unknown): DocState {
  if (err instanceof DocumentError || err instanceof LedgerError) {
    return { error: err.message };
  }
  console.error(err);
  return { error: "Could not save. Please try again." };
}

// --- Receipt -----------------------------------------------------------------
export async function createReceiptAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const bankAccountId = String(formData.get("bankAccountId") || "");
  if (!bankAccountId) return { error: "Choose where the money was received" };

  const lines = parseCashLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };
  const fx = parseCurrency(formData);

  try {
    await createReceipt(ctx.orgId, {
      date: parseDate(formData.get("date")),
      bankAccountId,
      partyId: String(formData.get("partyId") || "") || null,
      reference: String(formData.get("reference") || "") || null,
      description: String(formData.get("description") || "") || null,
      paymentMethod: String(formData.get("paymentMethod") || "") || null,
      tags: parseTags(formData),
      currency: fx.currency,
      exchangeRate: fx.exchangeRate,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/receipts");
}

// --- Sales receipt (cash sale) ----------------------------------------------
export async function createSalesReceiptAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const bankAccountId = String(formData.get("bankAccountId") || "");
  if (!bankAccountId) return { error: "Choose where the money was received" };

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
    return { error: "Could not read line items" };
  }
  const lines = raw
    .filter((l) => (l.description ?? "").trim() && l.accountId)
    .map((l) => ({
      description: l.description ?? "",
      quantity: (l.quantity ?? "1").trim() || "1",
      unitPrice: parseAmount(l.unitPrice ?? "0", ctx.baseCurrency),
      accountId: l.accountId as string,
      itemId: l.itemId || null,
    }));

  try {
    await createSalesReceipt(ctx.orgId, {
      bankAccountId,
      partyId: String(formData.get("partyId") || "") || null,
      date: parseDate(formData.get("date")),
      reference: String(formData.get("reference") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/sales-receipts");
}

// --- Refund receipt (refund a customer) -------------------------------------
export async function createRefundReceiptAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const bankAccountId = String(formData.get("bankAccountId") || "");
  if (!bankAccountId) return { error: "Choose where the refund is paid from" };

  const lines = parseInvoiceLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };

  try {
    await createRefundReceipt(ctx.orgId, {
      bankAccountId,
      partyId: String(formData.get("partyId") || "") || null,
      date: parseDate(formData.get("date")),
      reference: String(formData.get("reference") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/refund-receipts");
}

// --- Payment -----------------------------------------------------------------
export async function createPaymentAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const bankAccountId = String(formData.get("bankAccountId") || "");
  if (!bankAccountId) return { error: "Choose where the money was paid from" };

  const lines = parseCashLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };
  const itemLines = parseItemLines(formData, ctx.baseCurrency);
  const fx = parseCurrency(formData);

  try {
    await createPayment(ctx.orgId, {
      date: parseDate(formData.get("date")),
      bankAccountId,
      partyId: String(formData.get("partyId") || "") || null,
      reference: String(formData.get("reference") || "") || null,
      description: String(formData.get("description") || "") || null,
      paymentMethod: String(formData.get("paymentMethod") || "") || null,
      tags: parseTags(formData),
      currency: fx.currency,
      exchangeRate: fx.exchangeRate,
      lines,
      itemLines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/payments");
}

// --- Sales invoice -----------------------------------------------------------
export async function createSalesInvoiceAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const partyId = String(formData.get("partyId") || "");
  if (!partyId) return { error: "Choose a customer" };

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
    return { error: "Could not read line items" };
  }
  const lines = raw
    .filter((l) => (l.description ?? "").trim() && l.accountId)
    .map((l) => ({
      description: l.description ?? "",
      quantity: (l.quantity ?? "1").trim() || "1",
      unitPrice: parseAmount(l.unitPrice ?? "0", ctx.baseCurrency),
      accountId: l.accountId as string,
      itemId: l.itemId || null,
    }));

  const dueRaw = String(formData.get("dueDate") || "").trim();

  try {
    await createSalesInvoice(ctx.orgId, {
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
  redirect("/sales-invoices");
}

// --- Purchase invoice --------------------------------------------------------
export async function createPurchaseInvoiceAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const partyId = String(formData.get("partyId") || "");
  if (!partyId) return { error: "Choose a supplier" };

  let raw: {
    description?: string;
    quantity?: string;
    unitPrice?: string;
    accountId?: string;
  }[];
  try {
    raw = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    return { error: "Could not read line items" };
  }
  const lines = raw
    .filter((l) => (l.description ?? "").trim() && l.accountId)
    .map((l) => ({
      description: l.description ?? "",
      quantity: (l.quantity ?? "1").trim() || "1",
      unitPrice: parseAmount(l.unitPrice ?? "0", ctx.baseCurrency),
      accountId: l.accountId as string,
    }));

  const dueRaw = String(formData.get("dueDate") || "").trim();

  try {
    await createPurchaseInvoice(ctx.orgId, {
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
  redirect("/purchase-invoices");
}

// --- Inter-account transfer --------------------------------------------------
export async function createInterAccountTransferAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const fromAccountId = String(formData.get("fromAccountId") || "");
  const toAccountId = String(formData.get("toAccountId") || "");

  try {
    await createInterAccountTransfer(ctx.orgId, {
      date: parseDate(formData.get("date")),
      fromAccountId,
      toAccountId,
      amount: parseAmount(String(formData.get("amount") || "0"), ctx.baseCurrency),
      reference: String(formData.get("reference") || "") || null,
      description: String(formData.get("description") || "") || null,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/inter-account-transfers");
}

// --- Credit note -------------------------------------------------------------
export async function createCreditNoteAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const partyId = String(formData.get("partyId") || "");
  if (!partyId) return { error: "Choose a customer" };

  const lines = parseInvoiceLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };

  try {
    await createCreditNote(ctx.orgId, {
      partyId,
      date: parseDate(formData.get("date")),
      reference: String(formData.get("reference") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/credit-notes");
}

// --- Debit note --------------------------------------------------------------
export async function createDebitNoteAction(
  _prev: DocState,
  formData: FormData,
): Promise<DocState> {
  const ctx = await requireContext();
  const partyId = String(formData.get("partyId") || "");
  if (!partyId) return { error: "Choose a supplier" };

  const lines = parseInvoiceLines(formData, ctx.baseCurrency);
  if (lines === null) return { error: "Could not read line items" };

  try {
    await createDebitNote(ctx.orgId, {
      partyId,
      date: parseDate(formData.get("date")),
      supplierRef: String(formData.get("supplierRef") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      lines,
    });
  } catch (err) {
    return fail(err);
  }
  redirect("/debit-notes");
}

// --- Clone -------------------------------------------------------------------
export async function cloneReceiptAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const created = await cloneReceipt(ctx.orgId, id);
  redirect(`/receipts/${created.id}`);
}

export async function clonePaymentAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const created = await clonePayment(ctx.orgId, id);
  redirect(`/payments/${created.id}`);
}

export async function cloneSalesInvoiceAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const created = await cloneSalesInvoice(ctx.orgId, id);
  redirect(`/sales-invoices/${created.id}`);
}

export async function clonePurchaseInvoiceAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const created = await clonePurchaseInvoice(ctx.orgId, id);
  redirect(`/purchase-invoices/${created.id}`);
}

export async function cloneInterAccountTransferAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const created = await cloneInterAccountTransfer(ctx.orgId, id);
  redirect(`/inter-account-transfers/${created.id}`);
}

export async function cloneCreditNoteAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const created = await cloneCreditNote(ctx.orgId, id);
  redirect(`/credit-notes/${created.id}`);
}

export async function cloneDebitNoteAction(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") || "");
  const created = await cloneDebitNote(ctx.orgId, id);
  redirect(`/debit-notes/${created.id}`);
}
