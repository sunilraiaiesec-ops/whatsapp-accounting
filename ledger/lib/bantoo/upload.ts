import { createRequire } from "node:module";

// Upload constraints and helpers for the Ask Bantoo endpoints. All validation
// happens server-side; the client hints (accept=...) are convenience only.

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB per image / PDF
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB per voice note
export const MAX_IMAGES = 4;

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export const PDF_TYPE = "application/pdf";

// MediaRecorder output varies by browser (webm/ogg on Chrome/Firefox, mp4/aac
// on Safari), so accept the common audio containers plus video/webm which some
// browsers emit for audio-only recordings.
export const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/x-m4a",
  "audio/m4a",
  "video/webm",
  "video/mp4",
]);

const require = createRequire(import.meta.url);
type PdfParseFn = (buffer: Buffer) => Promise<{ text: string }>;

export async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const type = file.type || "image/jpeg";
  return `data:${type};base64,${base64}`;
}

export async function pdfToText(file: File): Promise<string> {
  const pdfParse = require("pdf-parse") as PdfParseFn;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { text } = await pdfParse(buffer);
  return text.replace(/\s+\n/g, "\n").trim().slice(0, 12000);
}
