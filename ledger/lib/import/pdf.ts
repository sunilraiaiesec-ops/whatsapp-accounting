import { createRequire } from "node:module";

import { buildPreview } from "@/lib/import/spreadsheet";
import { classifyPdfLine } from "@/lib/import/classify";
import type { ImportPreview, ParsedImportRow } from "@/lib/import/types";
import {
  dateFromFileName,
  detectPdfSection,
  extractDateFromLine,
  isPdfNoiseLine,
  isStockReport,
  looksLikeStockLine,
  parsePdfTableRow,
  type PdfSection,
} from "@/lib/import/pdf-text";

const require = createRequire(import.meta.url);
type PdfParseFn = (buffer: Buffer) => Promise<{ text: string }>;

const MAX_ROWS = 500;

function sectionToTypeLabel(section: PdfSection | null): string {
  if (section === "receipt") return "receipt";
  if (section === "payment") return "payment";
  return "";
}

function extractLines(text: string, fileName: string): ParsedImportRow[] {
  const fallbackDate = dateFromFileName(fileName);
  const stockReport = isStockReport(fileName, text);
  const rawLines = text.split(/\r?\n/);

  const rows: ParsedImportRow[] = [];
  let rowNumber = 0;
  let currentSection: PdfSection | null = null;
  let inPaymentsHalf = false;

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line || isPdfNoiseLine(line)) continue;

    const section = detectPdfSection(line);
    if (section === "skip") {
      currentSection = "skip";
      continue;
    }
    if (section === "receipt") {
      currentSection = "receipt";
      inPaymentsHalf = false;
      continue;
    }
    if (section === "payment") {
      currentSection = "payment";
      inPaymentsHalf = true;
      continue;
    }

    if (/receipts?\s*(and|&)\s*payments?\s*summary/i.test(line)) {
      currentSection = "receipt";
      inPaymentsHalf = false;
      continue;
    }

    if (currentSection === "skip" || (stockReport && currentSection === null)) {
      continue;
    }

    const parsed = parsePdfTableRow(line, fallbackDate);
    if (!parsed || !parsed.amount) continue;

    if (looksLikeStockLine(parsed.description)) continue;

    const inlineDate = extractDateFromLine(line);
    const effectiveSection = currentSection ?? (inPaymentsHalf ? "payment" : null);

    rowNumber += 1;
    const row = classifyPdfLine(
      rowNumber,
      line,
      parsed.date ?? inlineDate ?? fallbackDate,
      parsed.amount,
      parsed.description,
      {
        section: effectiveSection,
        fileName,
      },
    );
    if (row.kind !== "skip") rows.push(row);
    if (rows.length >= MAX_ROWS) break;
  }

  return rows;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as PdfParseFn;
  const parsed = await pdfParse(buffer);
  return parsed.text ?? "";
}

export async function parsePdf(buffer: Buffer, fileName: string): Promise<ImportPreview> {
  const text = await extractPdfText(buffer);

  if (!text.trim()) {
    return buildPreview(fileName, "pdf", "PDF (no extractable text — try Excel export)", []);
  }

  const rows = extractLines(text, fileName);
  const stockReport = isStockReport(fileName, text);
  const formatLabel = stockReport
    ? "PDF stock report (use Receipts & Payments Summary for transactions)"
    : rows.length > 0
      ? "PDF bank/transaction list"
      : "PDF (no transactions detected)";

  return buildPreview(fileName, "pdf", formatLabel, rows);
}
