import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { costPatternForItem } from "@/lib/command-patterns";
import { parseAmount } from "@/lib/money";
import { getAiProvider, isAiConfigured, AiError, AiNotConfiguredError } from "@/lib/ai/provider";
import {
  HIGH_AMOUNT_MULTIPLIER,
  PRICE_INCREASE_THRESHOLD_PERCENT,
  RISK_SCORE_HIGH_THRESHOLD,
  RISK_SCORE_MEDIUM_THRESHOLD,
} from "@/lib/approvals/config";
import {
  estimateAmountMinorFromStored,
  partyIdFromStored,
  type StoredGoodsReceiptPayload,
  type StoredPurchaseInvoicePayload,
  type StoredSalesInvoicePayload,
} from "@/lib/approvals/payloads";
import type { PendingTransactionType, RiskLevel, RiskReview, RiskSignal } from "@/lib/approvals/types";

// ---------------------------------------------------------------------------
// §12 — AI approval review. Advisory only, NEVER blocking: every signal here
// is deterministic and rule-based (reusing lib/command-patterns.ts's own
// signals rather than re-deriving them), with an optional one-sentence AI
// phrasing layer on top when lib/ai/provider.ts is configured. If the AI call
// fails or isn't configured, the deterministic signals/level are returned
// unchanged — an approver ALWAYS sees a risk review, AI or not, and it never
// stops them from approving/rejecting either way.
// ---------------------------------------------------------------------------

const MIN_HISTORY_FOR_AVERAGE = 3;

function levelFromScore(score: number): RiskLevel {
  if (score >= RISK_SCORE_HIGH_THRESHOLD) return "high";
  if (score >= RISK_SCORE_MEDIUM_THRESHOLD) return "medium";
  return "low";
}

// --- Signal: unfamiliar supplier (no prior history with this org) ----------
async function unfamiliarSupplierSignal(
  orgId: string,
  type: PendingTransactionType,
  partyId: string | null,
): Promise<RiskSignal | null> {
  if (!partyId) return null;
  if (type !== "stock_receipt" && type !== "purchase_invoice" && type !== "supplier_payment") return null;

  const [goodsReceiptCount, purchaseInvoiceCount, paymentCount] = await Promise.all([
    prisma.goodsReceipt.count({ where: { orgId, partyId } }),
    prisma.purchaseInvoice.count({ where: { orgId, partyId } }),
    prisma.payment.count({ where: { orgId, partyId } }),
  ]);
  if (goodsReceiptCount + purchaseInvoiceCount + paymentCount > 0) return null;

  return {
    code: "unfamiliar_supplier",
    label: "Unfamiliar supplier",
    detail: "This supplier has no prior purchase or payment history with your organization.",
    weight: 10,
  };
}

// --- Signal: price notably higher than last purchase (stock receipts) ------
async function priceIncreaseSignals(
  orgId: string,
  type: PendingTransactionType,
  stored: Prisma.JsonValue,
  partyId: string | null,
  currency: string,
): Promise<RiskSignal[]> {
  if (type !== "stock_receipt") return [];
  const payload = stored as unknown as StoredGoodsReceiptPayload;
  const signals: RiskSignal[] = [];

  for (const line of payload.lines) {
    // costPatternForItem (lib/command-patterns.ts) returns `value` as a
    // major-unit decimal string (e.g. "1,250.00" formatted, comma-stripped)
    // — parse it back to minor units with the SAME currency before comparing
    // against the stored (already-minor-unit) unitCost, so this holds for
    // non-zero-decimal currencies too, not just XAF.
    const pattern = await costPatternForItem(orgId, [line.itemId], partyId, currency);
    if (!pattern) continue;
    const lastCost = parseAmount(pattern.value, currency);
    const newCost = BigInt(line.unitCost);
    if (!(lastCost > 0n)) continue;
    const increasePercent = (Number(newCost - lastCost) / Number(lastCost)) * 100;
    if (increasePercent >= PRICE_INCREASE_THRESHOLD_PERCENT) {
      signals.push({
        code: `price_increase:${line.itemId}`,
        label: "Price higher than last purchase",
        detail: `Unit cost is ${increasePercent.toFixed(0)}% higher than the last purchase of this item (was ${pattern.value}).`,
        weight: 20,
      });
    }
  }
  return signals;
}

// --- Signal: possible duplicate invoice number ------------------------------
async function duplicateInvoiceSignal(
  orgId: string,
  type: PendingTransactionType,
  stored: Prisma.JsonValue,
): Promise<RiskSignal | null> {
  if (type === "purchase_invoice") {
    const p = stored as unknown as StoredPurchaseInvoicePayload;
    if (!p.supplierRef?.trim()) return null;
    const existing = await prisma.purchaseInvoice.findFirst({
      where: { orgId, partyId: p.partyId, supplierRef: p.supplierRef.trim() },
      select: { id: true, number: true },
    });
    if (!existing) return null;
    return {
      code: "duplicate_invoice_number",
      label: "Duplicate invoice number possible",
      detail: `An existing bill (${existing.number}) from this supplier already uses reference "${p.supplierRef.trim()}".`,
      weight: 25,
    };
  }
  if (type === "sales_invoice") {
    const p = stored as unknown as StoredSalesInvoicePayload;
    if (!p.reference?.trim()) return null;
    const existing = await prisma.salesInvoice.findFirst({
      where: { orgId, partyId: p.partyId, reference: p.reference.trim() },
      select: { id: true, number: true },
    });
    if (!existing) return null;
    return {
      code: "duplicate_invoice_number",
      label: "Duplicate invoice number possible",
      detail: `An existing invoice (${existing.number}) for this customer already uses reference "${p.reference.trim()}".`,
      weight: 25,
    };
  }
  return null;
}

// --- Signal: amount unusually high for this category ------------------------
type AverageAmountModel = "payment" | "receipt" | "salesInvoice" | "purchaseInvoice" | "goodsReceipt";

function modelForType(type: PendingTransactionType): AverageAmountModel | null {
  switch (type) {
    case "expense":
    case "supplier_payment":
      return "payment";
    case "payment_received":
      return "receipt";
    case "sales_invoice":
      return "salesInvoice";
    case "purchase_invoice":
      return "purchaseInvoice";
    case "stock_receipt":
      return "goodsReceipt";
    case "inventory_adjustment":
      return null;
  }
}

async function highAmountSignal(
  orgId: string,
  type: PendingTransactionType,
  amountMinor: bigint,
): Promise<RiskSignal | null> {
  const model = modelForType(type);
  if (!model || amountMinor <= 0n) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[model];
  const agg = await delegate.aggregate({
    where: { orgId },
    _avg: { total: true },
    _count: true,
  });
  const count: number = agg._count;
  const avg: number = agg._avg.total ?? 0;
  if (count < MIN_HISTORY_FOR_AVERAGE || avg <= 0) return null;

  const amountNum = Number(amountMinor);
  if (amountNum >= avg * HIGH_AMOUNT_MULTIPLIER) {
    return {
      code: "amount_unusually_high",
      label: "Amount unusually high for this category",
      detail: `This amount is more than ${HIGH_AMOUNT_MULTIPLIER}x the org's historical average for this transaction type (avg ~${Math.round(avg).toLocaleString()}).`,
      weight: 20,
    };
  }
  return null;
}

// --- Signal: missing receipt/attachment -------------------------------------
function missingAttachmentSignal(type: PendingTransactionType, attachmentId: string | null): RiskSignal | null {
  const expectsAttachment: PendingTransactionType[] = ["expense", "supplier_payment", "purchase_invoice", "stock_receipt"];
  if (!expectsAttachment.includes(type)) return null;
  if (attachmentId) return null;
  return {
    code: "missing_attachment",
    label: "Missing receipt/attachment",
    detail: "No receipt, bill photo, or document was attached to this submission.",
    weight: 15,
  };
}

// Optional AI phrasing layer — one plain-English sentence summarizing the
// signals, purely cosmetic. Never throws: any failure (not configured, rate
// limited, network) is swallowed and simply omitted from the review.
async function maybeGenerateAiNarrative(
  type: PendingTransactionType,
  signals: RiskSignal[],
  level: RiskLevel,
): Promise<string | null> {
  if (!isAiConfigured() || signals.length === 0) return null;
  try {
    const provider = getAiProvider();
    const result = await provider.extractJson({
      system:
        "You are an accounting risk-review assistant. Given a list of deterministic risk signals for one draft transaction, write ONE short, plain sentence (no more than 30 words) summarizing the concern for a busy approver. Respond as JSON: {\"narrative\": \"...\"}. Never invent signals beyond what's given.",
      user: JSON.stringify({ transactionType: type, riskLevel: level, signals: signals.map((s) => s.label) }),
    });
    const narrative = (result as { narrative?: unknown })?.narrative;
    return typeof narrative === "string" && narrative.trim() ? narrative.trim() : null;
  } catch (err) {
    if (!(err instanceof AiNotConfiguredError) && !(err instanceof AiError)) {
      console.error("[approvals/risk-review] AI narrative generation failed unexpectedly:", err);
    }
    return null;
  }
}

// Computes the full risk review for a staged (already-serialized) payload.
// `withAiNarrative` defaults to false — submitForApproval doesn't call the AI
// on every single submission by default (cost/latency); callers that want
// the phrasing layer opt in explicitly.
export async function computeRiskReview(
  orgId: string,
  type: PendingTransactionType,
  stored: Prisma.JsonValue,
  attachmentId: string | null,
  currency: string,
  options: { withAiNarrative?: boolean } = {},
): Promise<RiskReview> {
  const partyId = partyIdFromStored(type, stored);
  const amountMinor = estimateAmountMinorFromStored(type, stored);

  const [unfamiliarSupplier, priceIncreases, duplicateInvoice, highAmount] = await Promise.all([
    unfamiliarSupplierSignal(orgId, type, partyId),
    priceIncreaseSignals(orgId, type, stored, partyId, currency),
    duplicateInvoiceSignal(orgId, type, stored),
    highAmountSignal(orgId, type, amountMinor),
  ]);
  const missingAttachment = missingAttachmentSignal(type, attachmentId);

  const signals = [unfamiliarSupplier, ...priceIncreases, duplicateInvoice, highAmount, missingAttachment].filter(
    (s): s is RiskSignal => s != null,
  );

  const score = Math.min(100, signals.reduce((s, sig) => s + sig.weight, 0));
  const level = levelFromScore(score);

  const aiNarrative = options.withAiNarrative ? await maybeGenerateAiNarrative(type, signals, level) : null;

  return { level, score, signals, aiNarrative };
}
