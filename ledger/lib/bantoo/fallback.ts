import type { ExtractedAction } from "@/lib/ai/actions";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/ai/actions";
import { humanizeDescription, parseBantooCommandText } from "@/lib/command-parse";

// Rule-based fallback used when no AI provider is configured (missing API key)
// and the input is plain text. Reuses the existing regex parser so the classic
// text flow keeps working without any AI, mapping its result into the same
// ExtractedAction shape the AI path produces. Photos/voice still require AI.
export function ruleBasedExtract(text: string): ExtractedAction {
  const parsed = parseBantooCommandText(text);
  const currency = "XAF";
  const amount = parsed.amountText ? Number(parsed.amountText) : null;
  const confidence = 0.75;

  if (parsed.intent === "create_goods_receipt") {
    return {
      action: "receive_stock",
      product_name: parsed.itemDescription ? humanizeDescription(parsed.itemDescription) : null,
      barcode: null,
      sku: null,
      unit: parsed.quantityUnit,
      quantity: parsed.quantityText ? Number(parsed.quantityText) : null,
      cost_price: null,
      supplier_name: parsed.partyName,
      date: null,
      currency,
      confidence,
      summary: null,
    };
  }

  if (parsed.intent === "create_payment") {
    if (parsed.paymentCategory === "supplier" && parsed.partyName) {
      return {
        action: "expense",
        amount,
        description: parsed.expenseDescription,
        category: null,
        supplier_name: parsed.partyName,
        payment_method: null,
        date: null,
        currency,
        confidence,
        summary: null,
      };
    }
    return {
      action: "expense",
      amount,
      description: parsed.expenseDescription,
      category: null,
      supplier_name: parsed.partyName,
      payment_method: null,
      date: null,
      currency,
      confidence,
      summary: null,
    };
  }

  if (parsed.intent === "create_receipt") {
    if (parsed.receiptCategory === "sales") {
      return {
        action: "sales_receipt",
        amount,
        customer_name: null,
        description: parsed.expenseDescription,
        payment_method: null,
        date: null,
        currency,
        confidence,
        summary: null,
      };
    }
    return {
      action: "customer_payment",
      customer_name: parsed.partyName,
      amount,
      payment_method: null,
      description: null,
      date: null,
      currency,
      confidence,
      summary: null,
    };
  }

  if (parsed.intent === "create_customer") {
    return {
      action: "create_customer",
      customer_name: parsed.partyName,
      city: parsed.city,
      phone: null,
      country: null,
      currency,
      confidence,
      summary: null,
    };
  }

  return { action: "unknown", currency, confidence: 0, summary: null };
}

// When the AI returns unknown or low-confidence, prefer a confident rule-parser
// hit so obvious structured commands (e.g. "Add Golu as a customer") still
// promote to the right workflow.
export function blendExtraction(text: string, action: ExtractedAction): ExtractedAction {
  const rule = ruleBasedExtract(text);
  if (action.action === "unknown" && rule.action !== "unknown") {
    return rule;
  }
  if (
    action.action !== "unknown" &&
    action.confidence < LOW_CONFIDENCE_THRESHOLD &&
    rule.action === action.action &&
    rule.confidence >= LOW_CONFIDENCE_THRESHOLD
  ) {
    return { ...action, confidence: rule.confidence };
  }
  return action;
}
