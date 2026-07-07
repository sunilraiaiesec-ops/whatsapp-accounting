import { AiError, AiNotConfiguredError, getAiProvider, isAiConfigured } from "@/lib/ai/provider";

// ---------------------------------------------------------------------------
// Generates a friendly display name for an uploaded document, e.g.
// "2026-07-05 Purchase Invoice - Aqua General Trading.pdf". Always has a
// deterministic, synchronous fallback so naming never blocks an upload —
// the AI pass (when available) only tries to fill in a party name that
// wasn't already known, by reading the extracted document text.
//
// This does NOT consume an AI credit (see lib/billing/ai-credits.ts) — naming
// a file is a low-value, best-effort convenience, not a core "Ask Bantoo"
// extraction the org is paying for, so it's deliberately left unmetered here.
// ---------------------------------------------------------------------------

export type DocumentNameContext = {
  date: Date;
  documentType: string;
  originalFilename: string;
  partyName?: string | null;
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  purchase_invoice: "Purchase Invoice",
  sales_invoice: "Sales Invoice",
  receipt: "Receipt",
  payment: "Payment",
  goods_receipt: "Goods Receipt",
};

// Filesystem-unsafe characters across Windows/macOS/Linux, plus control
// characters. Collapses runs of whitespace left behind after stripping.
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

function sanitizeNamePart(value: string): string {
  return value
    .replace(UNSAFE_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function documentTypeLabel(documentType: string): string {
  return DOCUMENT_TYPE_LABELS[documentType] ?? (titleCase(documentType) || "Document");
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function extensionOf(filename: string): string {
  const match = /\.[^./\\]+$/.exec(filename);
  return match ? match[0].toLowerCase() : "";
}

function buildName(date: Date, documentType: string, partyName: string | null | undefined, extension: string): string {
  const label = documentTypeLabel(documentType);
  const cleanParty = partyName ? sanitizeNamePart(partyName) : "";
  const suffix = cleanParty ? ` - ${cleanParty}` : "";
  return `${isoDate(date)} ${label}${suffix}${extension}`;
}

// Deterministic, synchronous fallback — never throws, never calls the network.
export function deterministicDocumentName(ctx: DocumentNameContext): string {
  const extension = extensionOf(ctx.originalFilename);
  return buildName(ctx.date, ctx.documentType, ctx.partyName, extension);
}

function buildSystemPrompt(): string {
  return (
    "You extract the vendor or counterparty name mentioned in a business document's " +
    'text. Respond as JSON: {"partyName": "..."} using the short name as it appears ' +
    'on the document (e.g. "Aqua General Trading"), or {"partyName": null} if no ' +
    "party name is clearly identifiable. Never invent a name that isn't in the text."
  );
}

function buildUserPrompt(ctx: DocumentNameContext, extractedText: string): string {
  return [
    `Document type: ${ctx.documentType}`,
    `Already-known party name: ${ctx.partyName ?? "(none)"}`,
    "Extracted document text:",
    extractedText,
  ].join("\n");
}

// A "sane" AI-suggested name: non-empty after trimming, short, single line.
function isSaneName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 80 && !/[\r\n]/.test(trimmed);
}

// Async, AI-assisted name. Falls back to the deterministic name whenever AI
// is unavailable, has nothing to work with, or fails in any way — this NEVER
// throws to the caller.
export async function generateDocumentName(
  ctx: DocumentNameContext,
  extractedText?: string,
): Promise<string> {
  const text = extractedText?.trim();
  // A party name is already known — the deterministic name already includes
  // it, so there's nothing for the AI to usefully add.
  if (!isAiConfigured() || !text || ctx.partyName) {
    return deterministicDocumentName(ctx);
  }

  try {
    const provider = getAiProvider();
    const raw = await provider.extractJson({
      system: buildSystemPrompt(),
      user: buildUserPrompt(ctx, text),
    });
    const partyName = (raw as { partyName?: unknown })?.partyName;
    if (isSaneName(partyName)) {
      const extension = extensionOf(ctx.originalFilename);
      return buildName(ctx.date, ctx.documentType, partyName, extension);
    }
    return deterministicDocumentName(ctx);
  } catch (err) {
    if (err instanceof AiNotConfiguredError || err instanceof AiError) {
      return deterministicDocumentName(ctx);
    }
    // Any other unexpected failure — still degrade gracefully.
    return deterministicDocumentName(ctx);
  }
}
