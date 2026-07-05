import { NextResponse } from "next/server";

import { getCurrentContext } from "@/lib/auth/current";
import { extractBantooAction } from "@/lib/ai/extract";
import {
  AiNotConfiguredError,
  isAiConfigured,
  type AiImageInput,
} from "@/lib/ai/provider";
import { ruleBasedExtract } from "@/lib/bantoo/fallback";
import { resolveExtraction } from "@/lib/bantoo/resolve";
import { rateLimit, RATE_LIMITS } from "@/lib/bantoo/rate-limit";
import type { ExtractedAction } from "@/lib/ai/actions";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  PDF_TYPE,
  fileToDataUrl,
  pdfToText,
} from "@/lib/bantoo/upload";

export const maxDuration = 60;

// AI extraction endpoint. Accepts multipart/form-data with an optional `text`
// field and up to MAX_IMAGES `image` files (images or PDF). Runs AI extraction,
// resolves against the caller's org, and returns a confirmation proposal. The
// client always confirms before anything is written.
export async function POST(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = String(formData.get("text") ?? "").trim().slice(0, 4000);
  const files = formData.getAll("image").filter((f): f is File => f instanceof File);

  if (files.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `Please attach at most ${MAX_IMAGES} images.` },
      { status: 400 },
    );
  }

  const images: AiImageInput[] = [];
  const pdfTexts: string[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "A file is too large (max 8 MB)." }, { status: 400 });
    }
    if (file.type === PDF_TYPE) {
      try {
        const t = await pdfToText(file);
        if (t) pdfTexts.push(t);
      } catch {
        return NextResponse.json({ error: "Could not read that PDF." }, { status: 400 });
      }
    } else if (ALLOWED_IMAGE_TYPES.has(file.type)) {
      images.push({ url: await fileToDataUrl(file) });
    } else {
      return NextResponse.json(
        { error: "Only images (JPG, PNG, WebP, HEIC) or PDF are allowed." },
        { status: 400 },
      );
    }
  }

  if (!text && images.length === 0 && pdfTexts.length === 0) {
    return NextResponse.json(
      { error: "Type something, take a photo, or record a voice note." },
      { status: 400 },
    );
  }

  // Abuse/cost guard — enforced after the cheap file-size/type checks and
  // before any AI call. Keyed per org+user (best-effort, see rate-limit.ts).
  const rl = rateLimit(
    `extract:${ctx.orgId}:${ctx.userId}`,
    RATE_LIMITS.extract.limit,
    RATE_LIMITS.extract.windowMs,
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're going a bit fast. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const combinedText = [text, ...pdfTexts.map((t) => `Document text:\n${t}`)]
    .filter(Boolean)
    .join("\n\n");

  try {
    let action: ExtractedAction;
    if (!isAiConfigured()) {
      // No AI key: text-only still works via the rule-based parser; photos need AI.
      if (images.length > 0) {
        return NextResponse.json(
          { error: new AiNotConfiguredError().message },
          { status: 503 },
        );
      }
      action = ruleBasedExtract(combinedText);
    } else {
      action = await extractBantooAction({ text: combinedText, images });
    }
    const proposal = await resolveExtraction(ctx, action);
    return NextResponse.json({ proposal });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[bantoo/extract] failed:", err);
    return NextResponse.json(
      { error: "Sorry, I couldn't read that. Please try again or type the details." },
      { status: 500 },
    );
  }
}
