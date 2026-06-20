import type { ColumnKey, ColumnMap } from "@/lib/import/types";

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  date: ["date", "transaction date", "posting date", "entry date", "jour", "datum"],
  description: [
    "description",
    "memo",
    "narration",
    "details",
    "libelle",
    "libellé",
    "note",
    "notes",
  ],
  reference: ["reference", "ref", "ref no", "ref no.", "numero", "numéro", "check no"],
  party: [
    "party",
    "customer",
    "supplier",
    "vendor",
    "payee",
    "client",
    "fournisseur",
    "received from",
    "paid to",
    "name",
  ],
  amount: ["amount", "montant", "total", "value", "sum"],
  debit: ["debit", "dr", "débit", "debit amount"],
  credit: ["credit", "cr", "crédit", "credit amount"],
  account: ["account", "compte", "category", "account name", "account code", "gl account"],
  bank: ["bank", "deposit to", "paid from", "cash account", "bank account"],
  type: ["type", "transaction type", "kind", "document"],
};

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectColumns(headerRow: string[]): ColumnMap {
  const map: ColumnMap = {};
  const normalized = headerRow.map((cell) => normalizeHeader(String(cell ?? "")));

  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [ColumnKey, string[]][]) {
    const idx = normalized.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
    if (idx >= 0) map[key] = idx;
  }

  return map;
}

export function cell(row: string[], map: ColumnMap, key: ColumnKey): string {
  const idx = map[key];
  if (idx === undefined) return "";
  return String(row[idx] ?? "").trim();
}
