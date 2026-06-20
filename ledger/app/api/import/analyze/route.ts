import { NextResponse } from "next/server";

import { getCurrentContext } from "@/lib/auth/current";
import { analyzeImportFile } from "@/lib/import/analyze-file";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentContext();
    if (!ctx) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a PDF or Excel file." }, { status: 400 });
    }

    const result = await analyzeImportFile(ctx, file);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[import/analyze] failed:", err);
    return NextResponse.json(
      { error: "Could not read this file. Try Excel export from your previous software." },
      { status: 500 },
    );
  }
}
