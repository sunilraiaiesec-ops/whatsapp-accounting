import type { ExtractedAction } from "@/lib/ai/actions";
import { humanizeDescription, parseCommandText } from "@/lib/command-parse";

// Rule-based fallback used when no AI provider is configured (missing API key)
// and the input is plain text. Reuses the existing regex parser so the classic
// text flow keeps working without any AI, mapping its result into the same
// ExtractedAction shape the AI path produces. Photos/voice still require AI.
export function ruleBasedExtract(text: string): ExtractedAction {
  const parsed = parseCommandText(text);
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

  return { action: "unknown", currency, confidence: 0, summary: null };
}
