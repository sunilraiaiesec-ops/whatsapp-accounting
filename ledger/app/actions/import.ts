"use server";

import { revalidatePath } from "next/cache";

import { requireContext } from "@/lib/auth/current";
import { bankAndCashAccounts, listAccounts } from "@/lib/accounts";
import { executeImport } from "@/lib/import/execute";
import { parsePdf } from "@/lib/import/pdf";
import { resolveImportRows } from "@/lib/import/resolve";
import { parseSpreadsheet } from "@/lib/import/spreadsheet";
import type { ImportPreview, ImportResult, ParsedImportRow, ResolvedImportRow } from "@/lib/import/types";
import { listParties } from "@/lib/parties";

export type ImportActionState = {
  error?: string;
  preview?: ImportPreview & { resolvedRows?: ResolvedImportRow[] };
  result?: ImportResult;
};

const MAX_BYTES = 8 * 1024 * 1024;

function extension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1]! : "";
}

export async function parseImportFileAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const ctx = await requireContext();
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "Choose a PDF or Excel file." };
    if (file.size > MAX_BYTES) return { error: "File is too large (max 8 MB)." };

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
      return {
        error:
          preview.source === "pdf"
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
  } catch (err) {
    console.error(err);
    return { error: "Could not read this file. Try Excel export from your previous software." };
  }
}

export async function confirmImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const ctx = await requireContext();
    const raw = String(formData.get("rows") || "");
    const createParties = formData.get("createParties") === "on";

    let rows: ResolvedImportRow[];
    try {
      rows = JSON.parse(raw) as ResolvedImportRow[];
    } catch {
      return { error: "Import data expired. Upload the file again." };
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return { error: "Nothing to import." };
    }

    const result = await executeImport(ctx.orgId, rows.slice(0, 500), {
      createParties,
      currency: ctx.baseCurrency,
    });

    revalidatePath("/dashboard");
    revalidatePath("/journal");
    revalidatePath("/receipts");
    revalidatePath("/payments");
    revalidatePath("/customers");
    revalidatePath("/suppliers");

    return { result };
  } catch (err) {
    console.error(err);
    return { error: "Import failed. Please try again with a smaller file." };
  }
}

export type { ParsedImportRow, ImportPreview, ImportResult };
