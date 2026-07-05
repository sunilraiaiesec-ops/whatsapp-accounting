import { describe, expect, it } from "vitest";

import { parseExtractedAction, extractedActionSchema } from "@/lib/ai/actions";

describe("extractedActionSchema", () => {
  it("accepts a valid expense action and coerces messy numbers", () => {
    const result = parseExtractedAction({
      action: "expense",
      amount: "45,000 XAF",
      description: "Tire change",
      category: null,
      supplier_name: null,
      payment_method: "cash",
      date: "2026-01-05",
      confidence: 0.9,
      summary: "Paid 45,000 for tire change",
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.action.action === "expense") {
      expect(result.action.amount).toBe(45000);
      expect(result.action.currency).toBe("XAF");
      expect(result.action.date).toBe("2026-01-05");
    }
  });

  it("defaults currency to XAF when missing", () => {
    const result = parseExtractedAction({ action: "unknown", confidence: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.action.currency).toBe("XAF");
  });

  it("clamps confidence into the 0..1 range", () => {
    const parsed = extractedActionSchema.parse({
      action: "sales_receipt",
      amount: 1000,
      confidence: 5,
    });
    expect(parsed.confidence).toBe(1);
  });

  it("normalizes a garbage date to null", () => {
    const parsed = extractedActionSchema.parse({
      action: "receive_stock",
      quantity: 10,
      date: "sometime last week",
      confidence: 0.8,
    });
    if (parsed.action === "receive_stock") expect(parsed.date).toBeNull();
  });

  it("rejects an unknown action type", () => {
    const result = parseExtractedAction({ action: "delete_everything", confidence: 1 });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(parseExtractedAction("not json").ok).toBe(false);
    expect(parseExtractedAction(null).ok).toBe(false);
  });

  it("keeps discriminated fields per action", () => {
    const parsed = extractedActionSchema.parse({
      action: "add_inventory_item",
      product_name: "Peak Milk 400g",
      barcode: "6154000112233",
      sale_price: 1500,
      cost_price: 1200,
      unit: "tin",
      confidence: 0.7,
    });
    if (parsed.action === "add_inventory_item") {
      expect(parsed.product_name).toBe("Peak Milk 400g");
      expect(parsed.sale_price).toBe(1500);
      expect(parsed.unit).toBe("tin");
    }
  });
});
