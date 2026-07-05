import {
  parseExtractedAction,
  type ExtractedAction,
} from "@/lib/ai/actions";
import {
  getAiProvider,
  type AiImageInput,
} from "@/lib/ai/provider";

// The strict system prompt. It pins the business context (a small grocery shop
// in Cameroon, base currency XAF with ZERO decimals), enumerates the exact
// action types, and forces a JSON-only reply matching the TS/zod schema. When
// unsure the model MUST return { action: "unknown" } with low confidence so we
// never post a wrong entry.
function buildSystemPrompt(today: string): string {
  return `You are Bantoo, an extraction engine for BantooBooks, an accounting and inventory app used by small grocery shops in Cameroon. Today's date is ${today}. The base currency is XAF (Central African CFA franc), which has ZERO decimal places. Amounts are whole numbers (e.g. 45000, not 45000.00).

Your job: read the user's text and/or attached image(s) and return a SINGLE JSON object describing ONE action. Reply with ONLY the JSON object, no prose, no markdown.

Classify "action" as exactly one of:
- "add_inventory_item": defining/registering a NEW product in the catalog (often from a product package photo). Fields: product_name, barcode, sku, category, unit, quantity (opening stock, if any), cost_price, sale_price, tax_rate, reorder_level, supplier_name, currency.
- "receive_stock": stock/goods arriving from a supplier for an EXISTING or known product. Fields: product_name, barcode, sku, unit, quantity, cost_price (unit cost), supplier_name, date, currency.
- "supplier_purchase": a bill/invoice from a supplier (goods or services bought, often on credit) — from a supplier invoice/receipt photo. Fields: supplier_name, amount (grand total), description, payment_method, date, currency.
- "customer_payment": money RECEIVED from a named customer (paying what they owe). Fields: customer_name, amount, payment_method, description, date, currency.
- "expense": money PAID OUT for a business cost (rent, fuel, transport, salaries, fees, utilities...). Fields: amount, description, category, supplier_name (vendor, optional), payment_method, date, currency.
- "sales_receipt": a cash SALE to a customer (money received now for goods sold). Fields: amount, customer_name (optional), description, payment_method, date, currency.
- "unknown": you cannot confidently tell what the user wants.

Rules:
- Always include "action", "confidence" (0..1), "currency" (default "XAF"), and "summary" (a short human sentence describing the action in the user's language).
- Set unused/absent fields to null. Do NOT invent names, amounts, or barcodes that are not present.
- Amounts and prices are in MAJOR currency units exactly as written/said (no thousands separators).
- If the text is ambiguous, or you are guessing at the amount/party, set "action":"unknown" OR keep the best guess but set "confidence" below 0.5.
- For a photo of a product package, prefer "add_inventory_item" and read: product name, brand, size/package count (into unit), visible barcode, category.
- For a photo of a supplier invoice/receipt, prefer "supplier_purchase" and read: supplier, invoice date, and the grand total; put a brief line-item description in "description".
- Dates must be YYYY-MM-DD or null. Interpret "today"/"aujourd'hui" as ${today}.`;
}

function buildUserMessage(text: string | null | undefined, hasImages: boolean): string {
  const parts: string[] = [];
  if (hasImages) {
    parts.push(
      "Analyze the attached image(s) and extract the action. If it is a product package, register the item; if it is a supplier invoice/receipt, record the purchase.",
    );
  }
  const trimmed = (text ?? "").trim();
  if (trimmed) {
    parts.push(`User message:\n"""${trimmed}"""`);
  }
  if (parts.length === 0) {
    parts.push("No input provided.");
  }
  return parts.join("\n\n");
}

export type ExtractInput = {
  text?: string | null;
  images?: AiImageInput[];
  today?: string;
};

// Runs the AI extraction and validates the result with zod. Any malformed model
// output is downgraded to a low-confidence "unknown" rather than throwing, so
// the UI can always ask the user to confirm/edit. Provider/config errors (e.g.
// missing API key) DO propagate so the caller can surface a clear message.
export async function extractBantooAction(
  input: ExtractInput,
): Promise<ExtractedAction> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const provider = getAiProvider();
  const hasImages = Boolean(input.images && input.images.length > 0);

  const raw = await provider.extractJson({
    system: buildSystemPrompt(today),
    user: buildUserMessage(input.text, hasImages),
    images: input.images,
  });

  const parsed = parseExtractedAction(raw);
  if (!parsed.ok) {
    return {
      action: "unknown",
      confidence: 0,
      currency: "XAF",
      summary: null,
    };
  }
  return parsed.action;
}
