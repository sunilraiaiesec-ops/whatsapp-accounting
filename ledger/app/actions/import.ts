"use server";

import { revalidatePath } from "next/cache";

import { requireContext } from "@/lib/auth/current";
import { analyzeImportFile } from "@/lib/import/analyze-file";
import { executeImport } from "@/lib/import/execute";
import type { ImportPreview, ImportResult, ParsedImportRow, ResolvedImportRow } from "@/lib/import/types";

export type ImportActionState = {
  error?: string;
  preview?: ImportPreview & { resolvedRows?: ResolvedImportRow[] };
  result?: ImportResult;
};

function isNextNavigationError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const digest = String((err as { digest: unknown }).digest);
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND");
}

export async function parseImportFileAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const ctx = await requireContext();
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "Choose a PDF or Excel file." };
    return analyzeImportFile(ctx, file);
  } catch (err) {
    if (isNextNavigationError(err)) throw err;
    console.error("[import] parse failed:", err);
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
    if (isNextNavigationError(err)) throw err;
    console.error("[import] confirm failed:", err);
    return { error: "Import failed. Please try again with a smaller file." };
  }
}

export type { ParsedImportRow, ImportPreview, ImportResult };
