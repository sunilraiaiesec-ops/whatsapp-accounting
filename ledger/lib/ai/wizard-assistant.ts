import { formatMoney } from "@/lib/money";
import { AiError, AiNotConfiguredError, getAiProvider, isAiConfigured } from "@/lib/ai/provider";
import { consumeAiCredit } from "@/lib/billing/ai-credits";

// ---------------------------------------------------------------------------
// "Ask Bantoo" inside the Migration Wizard — a small, SEPARATE use case from
// the existing Ask Bantoo transaction-extraction pipeline (lib/ai/extract.ts,
// /api/bantoo/extract). That pipeline turns a photo/voice note/text message
// into a structured receipt/payment/invoice draft; this module answers plain
// conceptual/navigational questions ("What is Opening Equity?", "Why doesn't
// my balance sheet balance?") using the SAME swappable `AiProvider`
// (lib/ai/provider.ts#extractJson) but a completely different prompt and
// response shape (`{ answer: string }` instead of a transaction draft), and
// it is also used to add a natural-language phrasing layer on top of Step
// 5A's rule-based imbalance detection (see lib/migration/suggestions.ts).
//
// Graceful degradation: when OPENAI_API_KEY is absent (or the call fails),
// this NEVER throws to the caller — it always returns a still-useful
// rule-based/canned answer, using the live wizard context wherever it can.
// ---------------------------------------------------------------------------

export type WizardAssistantContext = {
  // Optional: when provided, AI credit metering is applied (see
  // askWizardAssistant below). Omitted in isolated tests/callers that have
  // no live org, in which case metering is skipped entirely.
  orgId?: string;
  currentStep: number;
  currency: string;
  totalAssets: bigint;
  totalLiabilities: bigint;
  totalEquity: bigint;
  difference: bigint;
  zeroOrMissingCategories: string[]; // human labels, e.g. "Owner Capital"
  extraNotes?: string[]; // e.g. rule-based findings for Step 5A
};

export type WizardAssistantAnswer = {
  answer: string;
  source: "ai" | "rule_based";
};

function money(ctx: WizardAssistantContext, amount: bigint): string {
  return formatMoney(amount, ctx.currency);
}

function describeImbalance(ctx: WizardAssistantContext): string {
  if (ctx.difference === 0n) {
    return `Your staged books currently balance: Assets ${money(ctx, ctx.totalAssets)} = Liabilities + Equity ${money(ctx, ctx.totalLiabilities + ctx.totalEquity)}.`;
  }
  const short = ctx.difference > 0n ? "Assets exceed Liabilities + Equity" : "Liabilities + Equity exceed Assets";
  return `${short} by ${money(ctx, ctx.difference < 0n ? -ctx.difference : ctx.difference)}. Assets ${money(ctx, ctx.totalAssets)}, Liabilities ${money(ctx, ctx.totalLiabilities)}, Equity ${money(ctx, ctx.totalEquity)}.`;
}

// A small FAQ matched by keyword, covering (at minimum) the example
// questions from the spec, so the wizard is still genuinely useful with no
// AI configured at all.
const FAQ: { test: RegExp; answer: (ctx: WizardAssistantContext) => string }[] = [
  {
    test: /retained earning/i,
    answer: () =>
      "Retained earnings is the accumulated profit (or loss) your business kept from prior years instead of paying out to owners. When you're migrating an existing business, it captures the net result of everything that happened before your BantooBooks opening date that isn't already reflected in another account.",
  },
  {
    test: /opening equity|opening balance equity/i,
    answer: () =>
      "Opening Equity is a temporary \"plug\" account used only during migration. If your other opening balances (assets, liabilities, owner capital, retained earnings) don't add up perfectly on day one, the leftover difference is parked here so your books still balance — you can review and reclassify it later.",
  },
  {
    test: /(why|why doesn'?t|why isn'?t).*(balance|balanced)/i,
    answer: (ctx) =>
      `${describeImbalance(ctx)}${ctx.zeroOrMissingCategories.length ? ` Categories with nothing staged yet: ${ctx.zeroOrMissingCategories.join(", ")}.` : ""} Common causes: a missing Owner's Capital entry, missing Retained Earnings, an unentered loan, or an incomplete inventory valuation.`,
  },
  {
    test: /leave inventory (empty|blank)|skip inventory/i,
    answer: () =>
      "Yes — Inventory is optional in Step 4. If you leave it empty, your opening Inventory balance stays at zero, which is fine for a service business or one with no stock on the opening date. Just make sure that's actually true, since Step 5B will otherwise flag zero inventory as something to double-check.",
  },
  {
    test: /why can'?t i finish|can'?t click finish|finish (is )?(disabled|blocked)/i,
    answer: (ctx) =>
      ctx.difference === 0n
        ? "Finish should be available — your staged books currently balance. If it's still blocked, check Step 5B for any unacknowledged warnings."
        : `Finish is blocked until your staged trial balance is exactly zero. ${describeImbalance(ctx)} Use Step 5A's suggestions or edit Steps 3–4 to close the gap.`,
  },
  {
    test: /accounts receivable|\bAR\b/i,
    answer: () =>
      "Accounts Receivable is what your customers owe you. In this wizard, you don't type an AR total directly — you assign an opening balance to each customer in Step 4, and the total automatically becomes your Accounts Receivable figure in Step 3.",
  },
  {
    test: /accounts payable|\bAP\b/i,
    answer: () =>
      "Accounts Payable is what you owe your suppliers. Just like Accounts Receivable, you assign it per supplier in Step 4 and the total automatically becomes your Accounts Payable figure in Step 3.",
  },
  {
    test: /migration date|opening date/i,
    answer: () =>
      "The migration date is the day BantooBooks starts recording your transactions. Everything before that date stays in your previous accounting system — you're only entering balances AS OF that date, not re-entering every historical transaction.",
  },
];

function canned(question: string, ctx: WizardAssistantContext): string {
  const hit = FAQ.find((f) => f.test.test(question));
  if (hit) return hit.answer(ctx);
  return `I can't reach the AI assistant right now, but here's what I can tell you from your current numbers: ${describeImbalance(ctx)} Ask about a specific term (like "Opening Equity" or "Retained Earnings") or a specific step and I'll do my best without AI.`;
}

function buildSystemPrompt(): string {
  return (
    "You are the BantooBooks Migration Wizard assistant. Answer the user's accounting " +
    "question clearly and briefly (2-4 sentences), in plain language for a small-business " +
    "owner who is not an accountant. Use the provided wizard context (current numbers) when " +
    "relevant. Never invent numbers that aren't in the context. Respond as JSON: " +
    '{"answer": "..."}.'
  );
}

function buildUserPrompt(question: string, ctx: WizardAssistantContext): string {
  const lines = [
    `Wizard step: ${ctx.currentStep}`,
    `Currency: ${ctx.currency}`,
    `Staged totals — Assets: ${money(ctx, ctx.totalAssets)}, Liabilities: ${money(ctx, ctx.totalLiabilities)}, Equity: ${money(ctx, ctx.totalEquity)}`,
    `Difference (Assets - (Liabilities + Equity)): ${money(ctx, ctx.difference)}`,
  ];
  if (ctx.zeroOrMissingCategories.length) {
    lines.push(`Categories with nothing staged: ${ctx.zeroOrMissingCategories.join(", ")}`);
  }
  if (ctx.extraNotes?.length) {
    lines.push(`Rule-based findings: ${ctx.extraNotes.join("; ")}`);
  }
  lines.push(`Question: ${question}`);
  return lines.join("\n");
}

export async function askWizardAssistant(
  question: string,
  ctx: WizardAssistantContext,
): Promise<WizardAssistantAnswer> {
  const q = question.trim();
  if (!q) return { answer: canned("", ctx), source: "rule_based" };

  if (!isAiConfigured()) {
    return { answer: canned(q, ctx), source: "rule_based" };
  }

  if (ctx.orgId) {
    // This feature already has a good non-AI answer, so credit exhaustion
    // degrades silently to the canned answer — no blocking/upgrade message.
    const credit = await consumeAiCredit(ctx.orgId, "wizard_assistant");
    if (!credit.allowed) {
      return { answer: canned(q, ctx), source: "rule_based" };
    }
  }

  try {
    const provider = getAiProvider();
    const raw = await provider.extractJson({
      system: buildSystemPrompt(),
      user: buildUserPrompt(q, ctx),
    });
    const answer = (raw as { answer?: unknown })?.answer;
    if (typeof answer === "string" && answer.trim()) {
      return { answer: answer.trim(), source: "ai" };
    }
    return { answer: canned(q, ctx), source: "rule_based" };
  } catch (err) {
    if (err instanceof AiNotConfiguredError || err instanceof AiError) {
      return { answer: canned(q, ctx), source: "rule_based" };
    }
    // Any other unexpected failure — still degrade gracefully rather than
    // breaking the wizard.
    return { answer: canned(q, ctx), source: "rule_based" };
  }
}
