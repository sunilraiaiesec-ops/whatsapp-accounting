"use server";

import { requireContext } from "@/lib/auth/current";
import {
  bankAndCashAccounts,
  payableAccount,
  paymentCounterpartAccounts,
  receiptCounterpartAccounts,
  receivableAccount,
} from "@/lib/accounts";
import { pickExpenseAccount, pickSalesAccount } from "@/lib/command-accounts";
import { rankParties } from "@/lib/command-match";
import { humanizeDescription, parseCommandText } from "@/lib/command-parse";
import { createPayment, createReceipt, DocumentError } from "@/lib/documents";
import { formatMoney, parseAmount } from "@/lib/money";
import { createParty, listParties } from "@/lib/parties";
import { prisma } from "@/lib/prisma";

export type CommandProposalDto = {
  intent: "create_receipt" | "create_payment" | "unknown";
  category: "customer" | "supplier" | "expense" | "sales";
  summary: string;
  confidence: "high" | "medium" | "low";
  amount: string;
  amountDisplay: string;
  partyId: string | null;
  partyName: string;
  partyOptional: boolean;
  partyMatch: "exact" | "fuzzy" | "none";
  createParty: boolean;
  partyType: "customer" | "supplier";
  expenseDescription: string;
  bankAccountId: string;
  bankAccountLabel: string;
  lineAccountId: string;
  lineAccountLabel: string;
  date: string;
  description: string;
  warnings: string[];
  partyAlternatives: { id: string; name: string }[];
  bankAlternatives: { id: string; label: string }[];
  lineAccountAlternatives: { id: string; label: string }[];
  suggestNewCategory: boolean;
  suggestedCategoryName: string;
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
        "I couldn't tell if this is money received or paid. Try: “Received 25 million XAF from Elhaji Adoum” or “Paid 45,000 for tire change”.",
    };
  }

  if (!parsed.amountText) {
    return { error: "Please include an amount, e.g. “25 million” or “45,000”." };
  }

  const amount = parseAmount(parsed.amountText, ctx.baseCurrency);
  if (amount <= 0n) {
    return { error: "The amount must be greater than zero." };
  }

  const isExpensePayment =
    parsed.intent === "create_payment" && parsed.paymentCategory === "expense";
  const isSalesReceipt =
    parsed.intent === "create_receipt" && parsed.receiptCategory === "sales";

  const category: CommandProposalDto["category"] =
    parsed.intent === "create_payment"
      ? isExpensePayment
        ? "expense"
        : "supplier"
      : isSalesReceipt
        ? "sales"
        : "customer";

  const partyType = parsed.intent === "create_receipt" ? "customer" : "supplier";
  const partyOptional = category === "expense" || category === "sales";

  const parties =
    partyOptional && !parsed.partyName
      ? []
      : await listParties(ctx.orgId, partyType);
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

  let lineAccount =
    parsed.intent === "create_receipt"
      ? (lineAccounts.find((a) => a.subtype === "receivable") ??
        (await receivableAccount(ctx.orgId)))
      : (lineAccounts.find((a) => a.subtype === "payable") ??
        (await payableAccount(ctx.orgId)));

  const expenseDescription = humanizeDescription(parsed.expenseDescription ?? "");

  if (isExpensePayment) {
    lineAccount =
      pickExpenseAccount(lineAccounts, expenseDescription) ??
      lineAccounts.find((a) => a.type === "EXPENSE" && a.subtype !== "cogs") ??
      lineAccount;
  } else if (isSalesReceipt) {
    lineAccount = pickSalesAccount(lineAccounts) ?? lineAccount;
  }

  const lineAccountAlternatives = lineAccounts
    .filter((a) =>
      category === "expense"
        ? a.type === "EXPENSE"
        : category === "sales"
          ? a.type === "INCOME"
          : category === "supplier"
            ? a.subtype === "payable" || a.type === "EXPENSE"
            : a.subtype === "receivable" || a.type === "INCOME",
    )
    .map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }));

  const warnings: string[] = [];

  if (category === "expense") {
    if (banks.length > 1) {
      warnings.push("Confirm which bank or cash account to pay from.");
    }
  } else if (category === "sales") {
    if (banks.length > 1) {
      warnings.push("Confirm which bank or cash account received the money.");
    }
  } else if (!partyName) {
    warnings.push("No customer or supplier name detected — pick or type one before confirming.");
  } else if (partyMatch === "none") {
    warnings.push(`“${partyName}” was not found — a new ${partyType} can be created when you confirm.`);
  } else if (partyMatch === "fuzzy") {
    warnings.push(`Matched “${top?.name}” — change below if that's not right.`);
  }

  if (banks.length > 1 && category !== "expense" && category !== "sales") {
    warnings.push("Confirm which bank or cash account to use.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const money = formatMoney(amount, ctx.baseCurrency);

  let summary: string;
  if (parsed.intent === "create_payment" && category === "expense") {
    summary = expenseDescription
      ? `Record expense payment: ${money} for ${expenseDescription}`
      : `Record expense payment: ${money}`;
  } else if (parsed.intent === "create_receipt" && category === "sales") {
    summary = expenseDescription
      ? `Record receipt: ${money} for ${expenseDescription}`
      : `Record receipt: ${money}`;
  } else if (partyName) {
    summary = `${parsed.intent === "create_receipt" ? "Record receipt" : "Record payment"}: ${money} ${parsed.intent === "create_receipt" ? "from" : "to"} ${partyName}`;
  } else {
    summary = `${parsed.intent === "create_receipt" ? "Record receipt" : "Record payment"}: ${money}`;
  }

  const proposal: CommandProposalDto = {
    intent: parsed.intent,
    category,
    summary,
    confidence:
      category === "expense" || category === "sales"
        ? "high"
        : partyMatch !== "none" && parsed.partyName
          ? "high"
          : partyName
            ? "medium"
            : "low",
    amount: amount.toString(),
    amountDisplay: money,
    partyId,
    partyName,
    partyOptional,
    partyMatch,
    createParty: !partyOptional && partyMatch === "none" && partyName.length > 0,
    partyType,
    expenseDescription,
    bankAccountId: defaultBank.id,
    bankAccountLabel: `${defaultBank.code} — ${defaultBank.name}`,
    lineAccountId: lineAccount.id,
    lineAccountLabel: `${lineAccount.code} — ${lineAccount.name}`,
    date: today,
    description: expenseDescription || text.trim(),
    warnings,
    partyAlternatives: ranked.map((p) => ({ id: p.id, name: p.name })),
    bankAlternatives: banks.map((b) => ({
      id: b.id,
      label: `${b.code} — ${b.name}`,
    })),
    lineAccountAlternatives:
      lineAccountAlternatives.length > 0
        ? lineAccountAlternatives
        : [{ id: lineAccount.id, label: `${lineAccount.code} — ${lineAccount.name}` }],
    suggestNewCategory:
      category === "expense" &&
      expenseDescription.length >= 3 &&
      !lineAccountAlternatives.some((a) =>
        a.label.toLowerCase().includes(expenseDescription.toLowerCase()),
      ),
    suggestedCategoryName: expenseDescription,
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

export async function createExpenseCategory(
  name: string,
): Promise<{ id: string; label: string } | { error: string }> {
  const ctx = await requireContext();
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { error: "Category name is too short." };
  }

  const existing = await prisma.account.findMany({
    where: { orgId: ctx.orgId, type: "EXPENSE" },
    select: { code: true, name: true },
  });

  const duplicate = existing.find(
    (a) => a.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (duplicate) {
    return {
      id: (
        await prisma.account.findFirstOrThrow({
          where: { orgId: ctx.orgId, code: duplicate.code },
        })
      ).id,
      label: `${duplicate.code} — ${duplicate.name}`,
    };
  }

  const used = new Set(existing.map((a) => a.code));
  let code = 6400;
  while (used.has(String(code))) code += 1;

  const account = await prisma.account.create({
    data: {
      orgId: ctx.orgId,
      code: String(code),
      name: trimmed,
      type: "EXPENSE",
      currency: ctx.baseCurrency,
    },
  });

  return { id: account.id, label: `${account.code} — ${account.name}` };
}
