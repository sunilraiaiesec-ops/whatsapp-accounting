import { bankAndCashAccounts, listAccounts } from "@/lib/accounts";
import type { CurrentContext } from "@/lib/auth/current";
import { parsePdf } from "@/lib/import/pdf";
import { resolveImportRows } from "@/lib/import/resolve";
import { parseSpreadsheet } from "@/lib/import/spreadsheet";
import type { ImportPreview, ResolvedImportRow } from "@/lib/import/types";
import { listParties } from "@/lib/parties";

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export type AnalyzeImportResult = {
  error?: string;
  preview?: ImportPreview & { resolvedRows?: ResolvedImportRow[] };
};

function extension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1]! : "";
}

export async function analyzeImportFile(
  ctx: CurrentContext,
  file: File,
): Promise<AnalyzeImportResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    return { error: "File is too large (max 8 MB)." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = extension(file.name);

  let preview: ImportPreview;
  if (ext === "pdf") {
    preview = await parsePdf(buffer, file.name);
  } else if (["xlsx", "xls", "csv"].includes(ext)) {
    preview = parseSpreadsheet(buffer, file.name);
  } else {
    return { error: "Unsupported file type. Upload .xlsx, .xls, .csv, or .pdf." };
  }

  if (preview.rows.length === 0) {
    const stockReport =
      preview.detectedFormat.includes("stock report") ||
      /stock report/i.test(file.name);
    return {
      error: stockReport
        ? "This looks like a stock/inventory report, not receipts or payments. Upload your Receipts & Payments Summary PDF or an Excel export instead."
        : preview.source === "pdf"
          ? "No transactions found in this PDF. Try exporting from your old system as Excel."
          : "No recognizable rows found. Check column headers (Date, Amount, Account, Debit, Credit).",
    };
  }

  const [accounts, parties, banks] = await Promise.all([
    listAccounts(ctx.orgId),
    listParties(ctx.orgId),
    bankAndCashAccounts(ctx.orgId),
  ]);

  const resolvedRows = resolveImportRows(
    preview.rows,
    accounts,
    parties,
    banks[0]?.id ?? null,
  );

  return {
    preview: {
      ...preview,
      resolvedRows,
    },
  };
}
