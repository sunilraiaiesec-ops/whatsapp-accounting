import { NextResponse } from "next/server";

import { getCurrentContext } from "@/lib/auth/current";
import { getAiProvider, AiNotConfiguredError } from "@/lib/ai/provider";
import { ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES } from "@/lib/bantoo/upload";
import { rateLimit, RATE_LIMITS } from "@/lib/bantoo/rate-limit";

export const maxDuration = 60;

// Voice-note transcription endpoint. Accepts a single `audio` file recorded via
// MediaRecorder and returns the transcript text, which the client drops into the
// prompt box so the user can review/edit before extraction.
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

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "No audio was uploaded." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording is too long (max 20 MB)." }, { status: 400 });
  }
  // Strict backend type check: the recorded Blob must declare a known audio
  // container. Empty/unknown types are rejected (not just missing-checked).
  const baseType = audio.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_AUDIO_TYPES.has(baseType)) {
    return NextResponse.json({ error: "Unsupported audio format." }, { status: 400 });
  }

  // Abuse/cost guard — after cheap size/type checks, before the AI call.
  const rl = rateLimit(
    `transcribe:${ctx.orgId}:${ctx.userId}`,
    RATE_LIMITS.transcribe.limit,
    RATE_LIMITS.transcribe.windowMs,
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're going a bit fast. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const lang = String(formData.get("lang") ?? "").trim().slice(0, 5) || undefined;

  try {
    const provider = getAiProvider();
    const buffer = Buffer.from(await audio.arrayBuffer());
    const filename = audio.name || `voice.${baseType.includes("mp4") ? "mp4" : "webm"}`;
    const text = await provider.transcribe({
      data: buffer,
      mimeType: baseType || "audio/webm",
      filename,
      language: lang,
    });
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[bantoo/transcribe] failed:", err);
    return NextResponse.json(
      { error: "Sorry, I couldn't transcribe that. Please try typing instead." },
      { status: 500 },
    );
  }
}
