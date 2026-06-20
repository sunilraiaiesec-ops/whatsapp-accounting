export type ImportRowKind = "journal" | "receipt" | "payment" | "party" | "skip";

export type ParsedImportRow = {
  rowNumber: number;
  kind: ImportRowKind;
  date: string | null;
  description: string;
  reference: string;
  partyName: string;
  amount: string;
  debit: string;
  credit: string;
  accountLabel: string;
  bankAccountLabel: string;
  lineAccountLabel: string;
  typeLabel: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

export type ResolvedImportRow = ParsedImportRow & {
  accountId?: string;
  bankAccountId?: string;
  lineAccountId?: string;
  partyId?: string | null;
  resolvedAmount?: bigint;
};

export type ImportPreview = {
  fileName: string;
  source: "spreadsheet" | "pdf";
  detectedFormat: string;
  rows: ParsedImportRow[];
  summary: {
    total: number;
    journal: number;
    receipts: number;
    payments: number;
    parties: number;
    skipped: number;
  };
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

export type ColumnKey =
  | "date"
  | "description"
  | "reference"
  | "party"
  | "amount"
  | "debit"
  | "credit"
  | "account"
  | "bank"
  | "type";

export type ColumnMap = Partial<Record<ColumnKey, number>>;
