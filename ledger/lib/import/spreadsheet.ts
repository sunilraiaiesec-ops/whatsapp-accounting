import * as XLSX from "xlsx";

import { cell, detectColumns } from "@/lib/import/columns";
import { classifySpreadsheetRow } from "@/lib/import/classify";
import type { ImportPreview, ParsedImportRow } from "@/lib/import/types";

function sheetToMatrix(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];
  return rows.map((row) => row.map((c) => String(c ?? "").trim()));
}

function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    let yyyy = dmy[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function parseSpreadsheet(buffer: Buffer, fileName: string): ImportPreview {
  const matrix = sheetToMatrix(buffer);
  if (matrix.length === 0) {
    return emptyPreview(fileName, "spreadsheet", "Empty file");
  }

  const headerIdx = matrix.findIndex((row) =>
    row.some((c) => /date|amount|debit|credit|account|description|memo|montant/i.test(c)),
  );
  const headerRow = headerIdx >= 0 ? matrix[headerIdx] : matrix[0];
  const dataStart = headerIdx >= 0 ? headerIdx + 1 : 1;
  const map = detectColumns(headerRow);

  const rows: ParsedImportRow[] = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const raw = matrix[i];
    if (!raw.some((c) => c.trim())) continue;

    const row = classifySpreadsheetRow({
      rowNumber: i + 1,
      date: parseDateCell(cell(raw, map, "date")),
      description: cell(raw, map, "description"),
      reference: cell(raw, map, "reference"),
      partyName: cell(raw, map, "party"),
      amount: cell(raw, map, "amount"),
      debit: cell(raw, map, "debit"),
      credit: cell(raw, map, "credit"),
      accountLabel: cell(raw, map, "account"),
      bankAccountLabel: cell(raw, map, "bank"),
      typeLabel: cell(raw, map, "type"),
    });
    if (row.kind !== "skip") rows.push(row);
  }

  const detectedFormat =
    map.debit !== undefined || map.credit !== undefined
      ? "Journal (debit/credit columns)"
      : map.amount !== undefined
        ? "Cash transactions (amount column)"
        : "General spreadsheet";

  return buildPreview(fileName, "spreadsheet", detectedFormat, rows);
}

function emptyPreview(
  fileName: string,
  source: ImportPreview["source"],
  format: string,
): ImportPreview {
  return buildPreview(fileName, source, format, []);
}

function buildPreview(
  fileName: string,
  source: ImportPreview["source"],
  detectedFormat: string,
  rows: ParsedImportRow[],
): ImportPreview {
  return {
    fileName,
    source,
    detectedFormat,
    rows: rows.slice(0, 500),
    summary: {
      total: rows.length,
      journal: rows.filter((r) => r.kind === "journal").length,
      receipts: rows.filter((r) => r.kind === "receipt").length,
      payments: rows.filter((r) => r.kind === "payment").length,
      parties: rows.filter((r) => r.kind === "party").length,
      skipped: rows.filter((r) => r.kind === "skip").length,
    },
  };
}

export { buildPreview };
