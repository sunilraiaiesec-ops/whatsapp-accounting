const DATE_PATTERN =
  /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/;

const MONETARY_PATTERN =
  /(-?\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|-?\d{4,}(?:\.\d{1,2})?)/g;

export type PdfSection = "receipt" | "payment" | "skip";

export function parseDateFromMatch(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    let yyyy = dmy[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

export function dateFromFileName(fileName: string): string | null {
  const match = fileName.match(/(\d{2})-(\d{2})-(\d{2,4})/);
  if (!match) return null;
  const dd = match[1]!.padStart(2, "0");
  const mm = match[2]!.padStart(2, "0");
  let yyyy = match[3]!;
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

export function detectPdfSection(line: string): PdfSection | null {
  const normalized = line
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (
    /^(receipts?|encaissements?|cash received|money in|recu|recus)\b/.test(normalized) ||
    /receipts?\s*(and|&)\s*payments?/.test(normalized)
  ) {
    return "receipt";
  }
  if (
    /^(payments?|decaissements?|cash paid|money out|depenses?|expenses?)\b/.test(normalized) ||
    /payments?\s*summary\b/.test(normalized)
  ) {
    return "payment";
  }
  if (/^(stock|inventory|inventaire|stock report)\b/.test(normalized)) {
    return "skip";
  }
  return null;
}

export function isPdfNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 4) return true;
  if (/^page \d+/i.test(trimmed)) return true;
  if (/^total\b/i.test(trimmed)) return true;
  if (/^-{2,}$/.test(trimmed)) return true;
  if (/^_{2,}$/.test(trimmed)) return true;
  if (/^(date|description|particulars|reference|balance|montant|amount|debit|credit)\b/i.test(trimmed)) {
    return true;
  }
  if (/^(report|summary|grand total|sub total|subtotal)\b/i.test(trimmed)) return true;
  return false;
}

export function looksLikeStockLine(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    /\b\d+\s*kg\b/.test(lower) ||
    /\b\d+\s*%\s*\d*\s*kg\b/.test(lower) ||
    /\bbrk\b/.test(lower) ||
    /\bstock\b/.test(lower)
  );
}

export function isStockReport(fileName: string, text: string): boolean {
  const blob = `${fileName} ${text.slice(0, 1200)}`.toLowerCase();
  return /\bstock report\b/.test(blob) || /\binventory valuation\b/.test(blob);
}

function stripQuantityTokens(line: string): string {
  return line.replace(/\b\d[\d,.]*\s*(kg|kgs|g|lb|lbs|%)\b/gi, " ");
}

export function extractMonetaryAmounts(line: string): string[] {
  const cleaned = stripQuantityTokens(line);
  const matches = [...cleaned.matchAll(MONETARY_PATTERN)];
  return matches
    .map((m) => m[1]!)
    .filter((amount) => {
      const digits = amount.replace(/[^\d]/g, "");
      return digits.length >= 3;
    });
}

export function pickPrimaryAmount(line: string): string {
  const amounts = extractMonetaryAmounts(line);
  return amounts.length > 0 ? amounts[amounts.length - 1]! : "";
}

export function parseAmountNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const negative = raw.trim().startsWith("-");
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const value = Number.parseFloat(digits);
  if (Number.isNaN(value)) return null;
  return negative ? -value : value;
}

export function splitPdfColumns(line: string): string[] {
  return line
    .split(/\s{2,}|\t/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parsePdfTableRow(
  line: string,
  fallbackDate: string | null,
): { date: string | null; description: string; amount: string } | null {
  const columns = splitPdfColumns(line);
  if (columns.length >= 3) {
    const firstDate = parseDateFromMatch(columns[0]!);
    const lastAmount = pickPrimaryAmount(columns[columns.length - 1]!);
    if (lastAmount) {
      const description = columns.slice(firstDate ? 1 : 0, -1).join(" ").trim();
      return {
        date: firstDate ?? fallbackDate,
        description,
        amount: lastAmount,
      };
    }
  }

  const dateMatch = line.match(DATE_PATTERN);
  const date = dateMatch ? parseDateFromMatch(dateMatch[1]!) : fallbackDate;
  const amount = pickPrimaryAmount(line);
  if (!amount) return null;

  let description = line;
  if (dateMatch) description = description.replace(dateMatch[0], "").trim();
  description = description.replace(amount, "").trim();
  description = description.replace(/\s(xaf|fcfa|cfa|usd|eur)\b/gi, "").trim();

  return { date, description, amount };
}

export function extractDateFromLine(line: string): string | null {
  const match = line.match(DATE_PATTERN);
  return match ? parseDateFromMatch(match[1]!) : null;
}
