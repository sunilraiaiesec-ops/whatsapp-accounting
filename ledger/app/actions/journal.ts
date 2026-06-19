"use server";

import { redirect } from "next/navigation";

import { requireContext } from "@/lib/auth/current";
import { postEntry, LedgerError, type PostLine } from "@/lib/ledger";
import { parseAmount } from "@/lib/money";

export type JournalState = { error?: string };

type IncomingLine = {
  accountId?: string;
  side?: "debit" | "credit";
  amount?: string;
  memo?: string;
};

export async function createJournalEntryAction(
  _prev: JournalState,
  formData: FormData,
): Promise<JournalState> {
  const ctx = await requireContext();

  const dateStr = String(formData.get("entryDate") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const reference = String(formData.get("reference") || "").trim();

  const entryDate = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(entryDate.getTime())) {
    return { error: "Invalid date" };
  }

  let incoming: IncomingLine[];
  try {
    incoming = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    return { error: "Could not read line items" };
  }

  const lines: PostLine[] = [];
  for (const l of incoming) {
    if (!l.accountId) continue;
    const amount = parseAmount(l.amount ?? "0", ctx.baseCurrency);
    if (amount === 0n) continue;
    lines.push({
      accountId: l.accountId,
      debit: l.side === "debit" ? amount : 0n,
      credit: l.side === "credit" ? amount : 0n,
      memo: l.memo?.trim() || null,
    });
  }

  try {
    await postEntry({
      orgId: ctx.orgId,
      entryDate,
      description: description || null,
      reference: reference || null,
      sourceType: "manual",
      lines,
    });
  } catch (err) {
    if (err instanceof LedgerError) return { error: err.message };
    console.error(err);
    return { error: "Could not post entry. Please try again." };
  }

  redirect("/journal");
}
