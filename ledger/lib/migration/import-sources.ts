import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { createParty } from "@/lib/parties";
import { createInventoryItem } from "@/lib/inventory";
import { parseAmount } from "@/lib/money";
import { upsertInventoryBalance } from "@/lib/migration/wizard";

// ---------------------------------------------------------------------------
// Step 2 — pluggable master-data import sources.
//
// The existing `lib/import/*` pipeline (analyze-file.ts, classify.ts,
// execute.ts, columns.ts) is built specifically to turn a spreadsheet of
// TRANSACTION rows (dates/amounts/debit/credit/journal-or-receipt-or-payment)
// into ledger postings — its `ParsedImportRow`/`ColumnKey` shape has no
// concept of "customer name + phone" or "chart-of-account code + type".
// Reusing it as-is for master data (customers/suppliers/products/services/
// inventory/chart of accounts) would mean bending an unrelated row schema to
// fit, which is worse than the small amount of duplication below. What IS
// reused is the underlying `xlsx` parsing approach (same library, same
// "read first sheet into a string matrix, detect a header row" technique as
// lib/import/spreadsheet.ts#parseSpreadsheet) and, for parties, the exact
// same `createParty` helper the rest of the app uses.
//
// `MigrationImportSource` is the pluggable seam: the wizard's Step 2 UI and
// server action only ever talk to this interface + registry, never to
// "CSV" directly, so a future QuickBooks/Manager.io/Xero/Sage/Excel/PDF/
// AI-OCR importer can be added by implementing this interface and
// registering it — no change needed to the wizard's step-flow logic.
// ---------------------------------------------------------------------------

export type MigrationEntityKind =
  | "customers"
  | "suppliers"
  | "products"
  | "services"
  | "inventory"
  | "chart_of_accounts";

export type MigrationImportRunResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

export interface MigrationImportSource {
  readonly kind: string;
  readonly label: string;
  readonly acceptExtensions: string[];
  supports(entityKind: MigrationEntityKind): boolean;
  execute(
    orgId: string,
    entityKind: MigrationEntityKind,
    file: { buffer: Buffer; fileName: string },
    currency: string,
  ): Promise<MigrationImportRunResult>;
}

function sheetToMatrix(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];
  return rows.map((row) => row.map((c) => String(c ?? "").trim()));
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectColumn(headerRow: string[], aliases: string[]): number {
  const normalized = headerRow.map(normalizeHeader);
  const idx = normalized.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
  return idx;
}

function cellAt(row: string[], idx: number): string {
  if (idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

const COLUMN_ALIASES = {
  name: ["name", "customer", "supplier", "client", "company", "product", "service", "item", "description"],
  phone: ["phone", "telephone", "mobile", "whatsapp", "contact number"],
  email: ["email", "e mail"],
  code: ["code", "sku", "item code", "product code", "account code"],
  price: ["price", "sale price", "selling price", "unit price"],
  unit: ["unit", "uom", "unit of measure"],
  quantity: ["qty", "quantity", "stock", "on hand", "opening qty", "opening quantity"],
  cost: ["cost", "unit cost", "purchase price", "buy price"],
  warehouse: ["warehouse", "location", "store", "branch"],
  accountType: ["type", "account type"],
  subtype: ["subtype", "category", "classification"],
};

function rowsFromBuffer(buffer: Buffer): { header: string[]; rows: string[][] } {
  const matrix = sheetToMatrix(buffer);
  if (matrix.length === 0) return { header: [], rows: [] };
  const headerIdx = matrix.findIndex((row) => row.some((c) => c.trim().length > 0));
  const header = headerIdx >= 0 ? matrix[headerIdx] : [];
  const rows = matrix.slice(headerIdx + 1).filter((r) => r.some((c) => c.trim()));
  return { header, rows };
}

// ---------------------------------------------------------------------------
// CSV / Excel implementation — the only registered source in v1.
// ---------------------------------------------------------------------------

class CsvImportSource implements MigrationImportSource {
  readonly kind = "csv";
  readonly label = "CSV / Excel file";
  readonly acceptExtensions = [".csv", ".xlsx", ".xls"];

  supports(): boolean {
    return true; // every entity kind is supported for CSV in v1
  }

  async execute(
    orgId: string,
    entityKind: MigrationEntityKind,
    file: { buffer: Buffer; fileName: string },
    currency: string,
  ): Promise<MigrationImportRunResult> {
    const { header, rows } = rowsFromBuffer(file.buffer);
    if (rows.length === 0) {
      return { imported: 0, skipped: 0, errors: ["The file appears to be empty."] };
    }

    switch (entityKind) {
      case "customers":
        return importParties(orgId, header, rows, "customer");
      case "suppliers":
        return importParties(orgId, header, rows, "supplier");
      case "products":
      case "services":
        return importInventoryItems(orgId, header, rows, currency);
      case "inventory":
        return importInventoryBalances(orgId, header, rows, currency);
      case "chart_of_accounts":
        return importChartOfAccounts(orgId, header, rows);
      default:
        return { imported: 0, skipped: rows.length, errors: [`Unsupported entity kind: ${entityKind}`] };
    }
  }
}

async function importParties(
  orgId: string,
  header: string[],
  rows: string[][],
  type: "customer" | "supplier",
): Promise<MigrationImportRunResult> {
  const nameIdx = detectColumn(header, COLUMN_ALIASES.name);
  const phoneIdx = detectColumn(header, COLUMN_ALIASES.phone);
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, row] of rows.entries()) {
    const name = cellAt(row, nameIdx >= 0 ? nameIdx : 0);
    if (!name) {
      skipped += 1;
      continue;
    }
    try {
      await createParty(orgId, { name, type, phone: cellAt(row, phoneIdx) || null });
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "could not create"}`);
    }
  }
  return { imported, skipped, errors: errors.slice(0, 20) };
}

async function importInventoryItems(
  orgId: string,
  header: string[],
  rows: string[][],
  currency: string,
): Promise<MigrationImportRunResult> {
  const nameIdx = detectColumn(header, COLUMN_ALIASES.name);
  const codeIdx = detectColumn(header, COLUMN_ALIASES.code);
  const priceIdx = detectColumn(header, COLUMN_ALIASES.price);
  const unitIdx = detectColumn(header, COLUMN_ALIASES.unit);
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  let autoCodeSeq = 1;

  for (const [i, row] of rows.entries()) {
    const name = cellAt(row, nameIdx >= 0 ? nameIdx : 0);
    if (!name) {
      skipped += 1;
      continue;
    }
    const code = cellAt(row, codeIdx) || `IMP-${Date.now().toString(36)}-${autoCodeSeq++}`;
    const priceText = cellAt(row, priceIdx);
    try {
      const existing = await prisma.inventoryItem.findUnique({ where: { orgId_code: { orgId, code } } });
      if (existing) {
        skipped += 1;
        continue;
      }
      await createInventoryItem(orgId, {
        code,
        name,
        salePrice: priceText ? parseAmount(priceText, currency) : 0n,
        unit: cellAt(row, unitIdx) || null,
      });
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "could not create"}`);
    }
  }
  return { imported, skipped, errors: errors.slice(0, 20) };
}

// Creates/matches inventory items AND stages their opening quantity/cost as
// a MigrationInventoryBalance row — the direct link between Step 2's import
// and Step 4's inventory subledger.
async function importInventoryBalances(
  orgId: string,
  header: string[],
  rows: string[][],
  currency: string,
): Promise<MigrationImportRunResult> {
  const nameIdx = detectColumn(header, COLUMN_ALIASES.name);
  const codeIdx = detectColumn(header, COLUMN_ALIASES.code);
  const unitIdx = detectColumn(header, COLUMN_ALIASES.unit);
  const qtyIdx = detectColumn(header, COLUMN_ALIASES.quantity);
  const costIdx = detectColumn(header, COLUMN_ALIASES.cost);
  const warehouseIdx = detectColumn(header, COLUMN_ALIASES.warehouse);
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  let autoCodeSeq = 1;

  for (const [i, row] of rows.entries()) {
    const name = cellAt(row, nameIdx >= 0 ? nameIdx : 0);
    if (!name) {
      skipped += 1;
      continue;
    }
    try {
      const code = cellAt(row, codeIdx) || `IMP-${Date.now().toString(36)}-${autoCodeSeq++}`;
      let item = await prisma.inventoryItem.findUnique({ where: { orgId_code: { orgId, code } } });
      if (!item) {
        item = await createInventoryItem(orgId, { code, name, salePrice: 0n, unit: cellAt(row, unitIdx) || null });
      }
      await upsertInventoryBalance(
        orgId,
        item.id,
        {
          quantity: cellAt(row, qtyIdx) || "0",
          unit: cellAt(row, unitIdx) || null,
          unitCost: cellAt(row, costIdx) || "0",
          warehouse: cellAt(row, warehouseIdx) || null,
        },
        currency,
      );
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "could not stage"}`);
    }
  }
  return { imported, skipped, errors: errors.slice(0, 20) };
}

const ACCOUNT_TYPE_ALIASES: Record<string, "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"> = {
  asset: "ASSET",
  assets: "ASSET",
  liability: "LIABILITY",
  liabilities: "LIABILITY",
  equity: "EQUITY",
  income: "INCOME",
  revenue: "INCOME",
  expense: "EXPENSE",
  expenses: "EXPENSE",
};

async function importChartOfAccounts(
  orgId: string,
  header: string[],
  rows: string[][],
): Promise<MigrationImportRunResult> {
  const nameIdx = detectColumn(header, COLUMN_ALIASES.name);
  const codeIdx = detectColumn(header, COLUMN_ALIASES.code);
  const typeIdx = detectColumn(header, COLUMN_ALIASES.accountType);
  const subtypeIdx = detectColumn(header, COLUMN_ALIASES.subtype);
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, row] of rows.entries()) {
    const name = cellAt(row, nameIdx >= 0 ? nameIdx : 0);
    const code = cellAt(row, codeIdx);
    if (!name || !code) {
      skipped += 1;
      continue;
    }
    const typeRaw = normalizeHeader(cellAt(row, typeIdx));
    const type = ACCOUNT_TYPE_ALIASES[typeRaw] ?? "ASSET";
    try {
      const existing = await prisma.account.findUnique({ where: { orgId_code: { orgId, code } } });
      if (existing) {
        skipped += 1;
        continue;
      }
      await prisma.account.create({
        data: { orgId, code, name, type, subtype: cellAt(row, subtypeIdx) || null },
      });
      imported += 1;
    } catch (err) {
      skipped += 1;
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "could not create"}`);
    }
  }
  return { imported, skipped, errors: errors.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, MigrationImportSource>();
registry.set("csv", new CsvImportSource());

export function listImportSources(): MigrationImportSource[] {
  return [...registry.values()];
}

export function getImportSource(kind: string): MigrationImportSource | undefined {
  return registry.get(kind);
}

export function registerImportSource(source: MigrationImportSource): void {
  registry.set(source.kind, source);
}
