"use server";

import { requireContext } from "@/lib/auth/current";
import {
  bankAndCashAccounts,
  payableAccount,
  receiptCounterpartAccounts,
  paymentCounterpartAccounts,
  receivableAccount,
} from "@/lib/accounts";
import { rankParties } from "@/lib/command-match";
import { parseCommandText } from "@/lib/command-parse";
import { createPayment, createReceipt, DocumentError } from "@/lib/documents";
import { formatMoney, parseAmount } from "@/lib/money";
import { createParty, listParties } from "@/lib/parties";

export type CommandProposalDto = {
  intent: "create_receipt" | "create_payment" | "unknown";
  summary: string;
  confidence: "high" | "medium" | "low";
  amount: string;
  amountDisplay: string;
  partyId: string | null;
  partyName: string;
  partyMatch: "exact" | "fuzzy" | "none";
  createParty: boolean;
  partyType: "customer" | "supplier";
  bankAccountId: string;
  bankAccountLabel: string;
  lineAccountId: string;
  lineAccountLabel: string;
  date: string;
  description: string;
  warnings: string[];
  partyAlternatives: { id: string; name: string }[];
  bankAlternatives: { id: string; label: string }[];
};

export type ExecuteCommandInput = {
  intent: "create_receipt" | "create_payment";
  amount: string;
  partyId: string | null;
  partyName: string;
  createParty: boolean;
  partyType: "customer" | "supplier";
  bankAccountId: string;
  lineAccountId: string;
  date: string;
  description: string;
};

export async function interpretCommand(
  text: string,
): Promise<{ proposal: CommandProposalDto } | { error: string }> {
  const ctx = await requireContext();
  const parsed = parseCommandText(text);

  if (parsed.intent === "unknown") {
    return {
      error:
        "I couldn't tell if this is money received or paid. Try: “Received 25 million XAF from Elhaji Adoum” or “Paid 500,000 to Supplier Name”.",
    };
  }

  if (!parsed.amountText) {
    return { error: "Please include an amount, e.g. “25 million” or “500,000”." };
  }

  const amount = parseAmount(parsed.amountText, ctx.baseCurrency);
  if (amount <= 0n) {
    return { error: "The amount must be greater than zero." };
  }

  const partyType = parsed.intent === "create_receipt" ? "customer" : "supplier";
  const parties = await listParties(ctx.orgId, partyType);
  const ranked = parsed.partyName ? rankParties(parsed.partyName, parties) : [];
  const top = ranked[0];
  const partyId = top && top.score >= 0.85 ? top.id : null;
  const partyName = parsed.partyName ?? top?.name ?? "";
  const partyMatch: CommandProposalDto["partyMatch"] =
    top?.score === 1 ? "exact" : top && top.score >= 0.85 ? "fuzzy" : "none";

  const banks = await bankAndCashAccounts(ctx.orgId);
  if (banks.length === 0) {
    return { error: "No bank or cash account found. Add one under Bank & Cash first." };
  }

  const defaultBank = banks[0];
  const lineAccounts =
    parsed.intent === "create_receipt"
      ? await receiptCounterpartAccounts(ctx.orgId)
      : await paymentCounterpartAccounts(ctx.orgId);

  const controlLine =
    parsed.intent === "create_receipt"
      ? (lineAccounts.find((a) => a.subtype === "receivable") ??
        (await receivableAccount(ctx.orgId)))
      : (lineAccounts.find((a) => a.subtype === "payable") ??
        (await payableAccount(ctx.orgId)));

  const warnings: string[] = [];
  if (!partyName) {
    warnings.push("No customer or supplier name detected — you can pick or type one before confirming.");
  } else if (partyMatch === "none") {
    warnings.push(`“${partyName}” was not found — a new ${partyType} can be created when you confirm.`);
  } else if (partyMatch === "fuzzy") {
    warnings.push(`Matched “${top?.name}” — change below if that's not right.`);
  }

  if (banks.length > 1) {
    warnings.push("Confirm which bank or cash account to use.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const intentLabel =
    parsed.intent === "create_receipt" ? "Record receipt" : "Record payment";

  const proposal: CommandProposalDto = {
    intent: parsed.intent,
    summary: partyName
      ? `${intentLabel}: ${formatMoney(amount, ctx.baseCurrency)} ${parsed.intent === "create_receipt" ? "from" : "to"} ${partyName}`
      : `${intentLabel}: ${formatMoney(amount, ctx.baseCurrency)}`,
    confidence:
      partyMatch !== "none" && parsed.partyName ? "high" : partyName ? "medium" : "low",
    amount: amount.toString(),
    amountDisplay: formatMoney(amount, ctx.baseCurrency),
    partyId,
    partyName,
    partyMatch,
    createParty: partyMatch === "none" && partyName.length > 0,
    partyType,
    bankAccountId: defaultBank.id,
    bankAccountLabel: `${defaultBank.code} — ${defaultBank.name}`,
    lineAccountId: controlLine.id,
    lineAccountLabel: `${controlLine.code} — ${controlLine.name}`,
    date: today,
    description: text.trim(),
    warnings,
    partyAlternatives: ranked.map((p) => ({ id: p.id, name: p.name })),
    bankAlternatives: banks.map((b) => ({
      id: b.id,
      label: `${b.code} — ${b.name}`,
    })),
  };

  return { proposal };
}

export async function executeCommand(
  input: ExecuteCommandInput,
): Promise<{ ok: true; href: string; number: string } | { ok: false; error: string }> {
  const ctx = await requireContext();

  try {
    const amount = BigInt(input.amount);
    if (amount <= 0n) return { ok: false, error: "Amount must be greater than zero." };

    let partyId = input.partyId;
    if (!partyId && input.createParty && input.partyName.trim()) {
      const created = await createParty(ctx.orgId, {
        name: input.partyName.trim(),
        type: input.partyType,
      });
      partyId = created.id;
    }

    const date = new Date(input.date);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: "Invalid date." };
    }

    if (input.intent === "create_receipt") {
      const receipt = await createReceipt(ctx.orgId, {
        date,
        bankAccountId: input.bankAccountId,
        partyId,
        reference: null,
        description: input.description || null,
        lines: [{ accountId: input.lineAccountId, amount }],
      });
      return { ok: true, href: `/receipts/${receipt.id}`, number: receipt.number };
    }

    const payment = await createPayment(ctx.orgId, {
      date,
      bankAccountId: input.bankAccountId,
      partyId,
      reference: null,
      description: input.description || null,
      lines: [{ accountId: input.lineAccountId, amount }],
    });
    return { ok: true, href: `/payments/${payment.id}`, number: payment.number };
  } catch (err) {
    if (err instanceof DocumentError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}
