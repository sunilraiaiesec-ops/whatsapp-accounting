"use server";

import { redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { DocumentError } from "@/lib/documents";
import { LedgerError } from "@/lib/ledger";
import {
  postSalesInvoiceDraft,
  postPurchaseInvoiceDraft,
  voidSalesInvoice,
  voidPurchaseInvoice,
  listOpenInvoicesForParty,
} from "@/lib/invoice-lifecycle";
import { formatAmount } from "@/lib/money";
import { isoDate } from "@/lib/format";

export type InvoiceLifecycleState = { error?: string; info?: string };

function fail(err: unknown): InvoiceLifecycleState {
  if (err instanceof DocumentError || err instanceof LedgerError) {
    return { error: err.message };
  }
  console.error(err);
  return { error: "Could not save. Please try again." };
}

export async function postSalesInvoiceDraftAction(
  _prev: InvoiceLifecycleState,
  formData: FormData,
): Promise<InvoiceLifecycleState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "editTransactions")) {
    return { error: "You don't have permission to post this invoice." };
  }
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing invoice id" };

  try {
    await postSalesInvoiceDraft(ctx.orgId, id);
  } catch (err) {
    return fail(err);
  }
  redirect(`/sales-invoices/${id}`);
}

export async function postPurchaseInvoiceDraftAction(
  _prev: InvoiceLifecycleState,
  formData: FormData,
): Promise<InvoiceLifecycleState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "editTransactions")) {
    return { error: "You don't have permission to post this bill." };
  }
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing bill id" };

  try {
    await postPurchaseInvoiceDraft(ctx.orgId, id);
  } catch (err) {
    return fail(err);
  }
  redirect(`/purchase-invoices/${id}`);
}

export async function voidSalesInvoiceAction(
  _prev: InvoiceLifecycleState,
  formData: FormData,
): Promise<InvoiceLifecycleState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "deleteTransactions")) {
    return { error: "You don't have permission to void this invoice." };
  }
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing invoice id" };

  try {
    await voidSalesInvoice(ctx.orgId, id);
  } catch (err) {
    return fail(err);
  }
  redirect(`/sales-invoices/${id}`);
}

export async function voidPurchaseInvoiceAction(
  _prev: InvoiceLifecycleState,
  formData: FormData,
): Promise<InvoiceLifecycleState> {
  const ctx = await requireContext();
  if (!can(ctx.role, "deleteTransactions")) {
    return { error: "You don't have permission to void this bill." };
  }
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing bill id" };

  try {
    await voidPurchaseInvoice(ctx.orgId, id);
  } catch (err) {
    return fail(err);
  }
  redirect(`/purchase-invoices/${id}`);
}

// Client-callable — powers the "Apply to invoices" picker in CashDocForm
// once a party is selected. Returns display-ready strings (bigint/Date don't
// cross the server-action boundary), following the same formatAmount/isoDate
// convention already used to pass amounts into other client forms.
export type OpenInvoiceOption = {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  balance: string;
};

export async function getOpenInvoicesForPartyAction(
  partyId: string,
  type: "sales" | "purchase",
): Promise<OpenInvoiceOption[]> {
  const ctx = await requireContext();
  if (!partyId) return [];
  const invoices = await listOpenInvoicesForParty(ctx.orgId, partyId, type);
  return invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    date: isoDate(inv.date),
    dueDate: inv.dueDate ? isoDate(inv.dueDate) : null,
    balance: formatAmount(inv.balance, ctx.baseCurrency),
  }));
}
