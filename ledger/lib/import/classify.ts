import type { ParsedImportRow } from "@/lib/import/types";

type RowInput = {
  rowNumber: number;
  date: string | null;
  description: string;
  reference: string;
  partyName: string;
  amount: string;
  debit: string;
  credit: string;
  accountLabel: string;
  bankAccountLabel: string;
  typeLabel: string;
};

const RECEIPT_TYPES = /\b(receipt|receive|received|encaissement|encaisse|deposit|customer payment|sales receipt)\b/i;
const PAYMENT_TYPES = /\b(payment|paid|pay|expense|bill|decaissement|décaissement|supplier|purchase)\b/i;
const PARTY_TYPES = /\b(customer|supplier|vendor|client|fournisseur|contact)\b/i;

function inferFromText(text: string): ParsedImportRow["kind"] | null {
  if (RECEIPT_TYPES.test(text)) return "receipt";
  if (PAYMENT_TYPES.test(text)) return "payment";
  if (PARTY_TYPES.test(text)) return "party";
  return null;
}

function hasAmount(value: string): boolean {
  return /\d/.test(value.replace(/[^\d]/g, ""));
}

export function classifySpreadsheetRow(input: RowInput): ParsedImportRow {
  const warnings: string[] = [];
  const textBlob = `${input.typeLabel} ${input.description}`.trim();
  let kind: ParsedImportRow["kind"] = "skip";
  let confidence: ParsedImportRow["confidence"] = "low";

  const fromType = input.typeLabel ? inferFromText(input.typeLabel) : null;
  const fromDesc = inferFromText(input.description);

  if (input.debit || input.credit || input.accountLabel) {
    kind = "journal";
    confidence = input.date ? "high" : "medium";
    if (!input.date) warnings.push("Missing date — today's date will be used.");
    if (!input.debit && !input.credit) warnings.push("No debit or credit amount.");
  } else if (fromType === "receipt" || fromDesc === "receipt") {
    kind = "receipt";
    confidence = hasAmount(input.amount) ? "high" : "medium";
  } else if (fromType === "payment" || fromDesc === "payment") {
    kind = "payment";
    confidence = hasAmount(input.amount) ? "high" : "medium";
  } else if (fromType === "party") {
    kind = "party";
    confidence = input.partyName ? "high" : "medium";
  } else if (hasAmount(input.amount)) {
    const lower = textBlob.toLowerCase();
    if (/\b(from|client|customer|received)\b/.test(lower)) {
      kind = "receipt";
      confidence = "medium";
    } else if (/\b(to|supplier|paid|expense|for)\b/.test(lower)) {
      kind = "payment";
      confidence = "medium";
    } else {
      kind = "journal";
      confidence = "low";
      warnings.push("Could not tell receipt vs payment — imported as journal entry.");
    }
  } else if (input.partyName && !input.amount) {
    kind = "party";
    confidence = "medium";
  }

  if (kind === "skip") {
    return {
      ...input,
      kind,
      lineAccountLabel: input.accountLabel,
      confidence: "low",
      warnings: ["Could not recognize this row."],
    };
  }

  if ((kind === "receipt" || kind === "payment") && !hasAmount(input.amount)) {
    warnings.push("Missing amount.");
    confidence = "low";
  }

  return {
    rowNumber: input.rowNumber,
    kind,
    date: input.date,
    description: input.description,
    reference: input.reference,
    partyName: input.partyName,
    amount: input.amount,
    debit: input.debit,
    credit: input.credit,
    accountLabel: input.accountLabel,
    bankAccountLabel: input.bankAccountLabel,
    lineAccountLabel: input.accountLabel,
    typeLabel: input.typeLabel,
    confidence,
    warnings,
  };
}

export function classifyPdfLine(
  rowNumber: number,
  line: string,
  date: string | null,
  amount: string,
  description: string,
  context?: { section?: "receipt" | "payment" | "skip" | null; fileName?: string },
): ParsedImportRow {
  let typeLabel = "";
  if (context?.section === "receipt") typeLabel = "receipt";
  if (context?.section === "payment") typeLabel = "payment";

  const normalizedAmount = amount.replace(/\s+/g, "");
  const amountNum = parseAmountNumber(normalizedAmount);
  if (!typeLabel && amountNum !== null) {
    if (amountNum < 0) typeLabel = "payment";
    else if (amountNum > 0) typeLabel = "receipt";
  }

  return classifySpreadsheetRow({
    rowNumber,
    date,
    description,
    reference: "",
    partyName: extractPartyName(description),
    amount: normalizedAmount,
    debit: "",
    credit: "",
    accountLabel: "",
    bankAccountLabel: "",
    typeLabel,
  });
}

function parseAmountNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const negative = raw.trim().startsWith("-");
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const value = Number.parseFloat(digits);
  if (Number.isNaN(value)) return null;
  return negative ? -value : value;
}

function extractPartyName(description: string): string {
  const cleaned = description
    .replace(/\b(invoice|inv|facture|ref|reference)\s*#?\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 3) return "";
  if (looksLikeGenericDescription(cleaned)) return "";
  return cleaned.slice(0, 120);
}

function looksLikeGenericDescription(text: string): boolean {
  return /^-{2,}$/.test(text) || /^\d+([,\s]\d+)*-?$/.test(text);
}
