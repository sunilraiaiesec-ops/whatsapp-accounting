import { prisma } from "@/lib/prisma";
import { getEffectiveSubscription } from "@/lib/billing/subscription";
import { getPlanLimits } from "@/lib/billing/plans";

// ---------------------------------------------------------------------------
// Per-org-per-month AI credit metering. One counter row per (orgId,
// yearMonth) in `AiCreditUsage`, incremented atomically via upsert so
// concurrent requests never lose a count.
//
// Every current and future AI-backed feature should call consumeAiCredit()
// exactly once per AI *call* it actually makes (not once per user action —
// e.g. Ask Bantoo's photo extraction consumes one credit even though it also
// creates a resolved transaction proposal). Feature-specific callers decide
// what to do when `allowed` is false; see the call sites in
// app/api/bantoo/extract/route.ts, app/api/bantoo/transcribe/route.ts, and
// lib/ai/wizard-assistant.ts for the three fallback shapes this module
// supports (rule-based fallback, upgrade message, graceful canned answer).
// ---------------------------------------------------------------------------

export type AiFeature =
  | "text_extraction"
  | "photo_ocr"
  | "voice_transcription"
  | "wizard_assistant"
  // Reserved: command-patterns.ts / party-insights.ts ("AI Memory") make NO
  // live AI calls today (purely rule-based scoring over the org's own
  // transaction history) — metering for this feature is currently a no-op.
  // Kept in the union so the day it becomes AI-backed, only the call site
  // changes, not this type.
  | "ai_memory";

export type AiCreditConsumeResult =
  | { allowed: true; remaining: number; limit: number; used: number }
  | { allowed: false; remaining: number; limit: number; used: number };

export type AiCreditStatus = { used: number; limit: number; remaining: number; yearMonth: string };

export function currentYearMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function limitForOrg(orgId: string): Promise<number> {
  const { effectivePlan } = await getEffectiveSubscription(orgId);
  return getPlanLimits(effectivePlan).aiCreditsPerMonth;
}

// "6 of 10 AI credits remaining" — read-only, never mutates usage. Safe to
// call from any dashboard widget or pre-flight UI check.
export async function getAiCreditStatus(orgId: string, now: Date = new Date()): Promise<AiCreditStatus> {
  const yearMonth = currentYearMonth(now);
  const [limit, row] = await Promise.all([
    limitForOrg(orgId),
    prisma.aiCreditUsage.findUnique({ where: { orgId_yearMonth: { orgId, yearMonth } } }),
  ]);
  const used = row?.creditsUsed ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used), yearMonth };
}

// Attempts to spend `cost` credits (default 1). Returns allowed=false
// WITHOUT incrementing anything when it would exceed the org's monthly
// limit — a rejected request should never be charged. Never throws; a
// database error is treated as "not allowed" so a metering hiccup can never
// crash an AI feature (callers already have a graceful fallback for that).
export async function consumeAiCredit(
  orgId: string,
  feature: AiFeature,
  cost = 1,
): Promise<AiCreditConsumeResult> {
  try {
    const yearMonth = currentYearMonth();
    const limit = await limitForOrg(orgId);

    const existing = await prisma.aiCreditUsage.upsert({
      where: { orgId_yearMonth: { orgId, yearMonth } },
      create: { orgId, yearMonth, creditsUsed: 0 },
      update: {},
    });

    if (existing.creditsUsed + cost > limit) {
      return {
        allowed: false,
        remaining: Math.max(0, limit - existing.creditsUsed),
        limit,
        used: existing.creditsUsed,
      };
    }

    const updated = await prisma.aiCreditUsage.update({
      where: { orgId_yearMonth: { orgId, yearMonth } },
      data: { creditsUsed: { increment: cost } },
    });
    return {
      allowed: true,
      remaining: Math.max(0, limit - updated.creditsUsed),
      limit,
      used: updated.creditsUsed,
    };
  } catch (err) {
    console.error(`[billing/ai-credits] consumeAiCredit failed (org=${orgId}, feature=${feature}):`, err);
    return { allowed: false, remaining: 0, limit: 0, used: 0 };
  }
}
