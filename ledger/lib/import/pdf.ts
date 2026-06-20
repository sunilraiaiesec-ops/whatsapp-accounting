import { buildPreview } from "@/lib/import/spreadsheet";
import { classifyPdfLine } from "@/lib/import/classify";
import type { ImportPreview, ParsedImportRow } from "@/lib/import/types";

const DATE_PATTERN =
  /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/;

function parseDateFromMatch(raw: string): string | null {
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

function extractLines(text: string): ParsedImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows: ParsedImportRow[] = [];
  let rowNumber = 0;

  for (const line of lines) {
    if (line.length < 8) continue;
    if (/^page \d+/i.test(line)) continue;
    if (/^total\b/i.test(line)) continue;

    const dateMatch = line.match(DATE_PATTERN);
    const date = dateMatch ? parseDateFromMatch(dateMatch[1]) : null;

    const amounts = [...line.matchAll(/(-?\d[\d\s,'']{2,}(?:\.\d+)?)/g)].map((m) => m[1]);
    const amount = amounts.length > 0 ? amounts[amounts.length - 1] : "";

    if (!date && !amount) continue;

    let description = line;
    if (dateMatch) description = description.replace(dateMatch[0], "").trim();
    if (amount) description = description.replace(amount, "").trim();
    description = description.replace(/\s(xaf|fcfa|cfa)\s*$/i, "").trim();

    if (!description && !amount) continue;

    rowNumber += 1;
    const row = classifyPdfLine(rowNumber, line, date, amount, description);
    if (row.kind !== "skip") rows.push(row);
  }

  return rows;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

export async function parsePdf(buffer: Buffer, fileName: string): Promise<ImportPreview> {
  const text = await extractPdfText(buffer);

  if (!text.trim()) {
    return buildPreview(fileName, "pdf", "PDF (no extractable text — try Excel export)", []);
  }

  const rows = extractLines(text);
  return buildPreview(
    fileName,
    "pdf",
    rows.length > 0 ? "PDF bank/transaction list" : "PDF (no transactions detected)",
    rows,
  );
}
