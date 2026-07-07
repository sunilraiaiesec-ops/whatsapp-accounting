import { describe, expect, it } from "vitest";

import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/ai/actions";
import { blendExtraction, ruleBasedExtract } from "@/lib/bantoo/fallback";
import { parseBantooCommandText } from "@/lib/command-parse";

describe("ruleBasedExtract (no-AI text fallback)", () => {
  it("maps a customer receipt to customer_payment", () => {
    const action = ruleBasedExtract("Received 25 million XAF from Elhaji Adoum");
    expect(action.action).toBe("customer_payment");
    if (action.action === "customer_payment") {
      expect(action.amount).toBe(25_000_000);
      expect(action.customer_name?.toLowerCase()).toContain("elhaji");
    }
  });

  it('maps "Record receipt … from …" phrasing to customer_payment (BUG-001)', () => {
    const action = ruleBasedExtract("Record receipt 50000 from Elhaji");
    expect(action.action).toBe("customer_payment");
    if (action.action === "customer_payment") {
      expect(action.amount).toBe(50_000);
      expect(action.customer_name?.toLowerCase()).toContain("elhaji");
    }
  });

  it("maps a paid expense to expense", () => {
    const action = ruleBasedExtract("Paid 45,000 for tire change");
    expect(action.action).toBe("expense");
    if (action.action === "expense") {
      expect(action.amount).toBe(45000);
    }
  });

  it("maps a goods receipt to receive_stock", () => {
    const action = ruleBasedExtract("Received 150 bags of rice from Adamou");
    expect(action.action).toBe("receive_stock");
    if (action.action === "receive_stock") {
      expect(action.quantity).toBe(150);
      expect(action.supplier_name?.toLowerCase()).toContain("adamou");
    }
  });

  it("returns unknown for gibberish", () => {
    const action = ruleBasedExtract("asdf qwerty");
    expect(action.action).toBe("unknown");
  });

  it("always defaults currency to XAF", () => {
    const action = ruleBasedExtract("Paid 1000 for fuel");
    expect(action.currency).toBe("XAF");
  });

  it('maps "Add Golu as a customer in Ngoundéré" to create_customer (BUG-005)', () => {
    const action = ruleBasedExtract("Add Golu as a customer in Ngoundéré");
    expect(action.action).toBe("create_customer");
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    if (action.action === "create_customer") {
      expect(action.customer_name).toBe("Golu");
      expect(action.city).toBe("Ngoundéré");
    }
  });

  it('maps "Ajouter Golu comme client à Ngoundéré" to create_customer (French)', () => {
    const action = ruleBasedExtract("Ajouter Golu comme client à Ngoundéré");
    expect(action.action).toBe("create_customer");
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    if (action.action === "create_customer") {
      expect(action.customer_name).toBe("Golu");
      expect(action.city).toBe("Ngoundéré");
    }
  });

  it('maps "Add customer John Doe" to create_customer', () => {
    const action = ruleBasedExtract("Add customer John Doe");
    expect(action.action).toBe("create_customer");
    if (action.action === "create_customer") {
      expect(action.customer_name).toBe("John Doe");
    }
  });
});

describe("parseCommandText create_customer intent", () => {
  it("detects create_customer intent for English phrasing", () => {
    const parsed = parseBantooCommandText("Add Golu as a customer in Ngoundéré");
    expect(parsed.intent).toBe("create_customer");
    expect(parsed.partyName).toBe("Golu");
    expect(parsed.city).toBe("Ngoundéré");
  });

  it("detects create_customer intent for French phrasing", () => {
    const parsed = parseBantooCommandText("Ajouter Golu comme client à Ngoundéré");
    expect(parsed.intent).toBe("create_customer");
    expect(parsed.partyName).toBe("Golu");
    expect(parsed.city).toBe("Ngoundéré");
  });
});

describe("blendExtraction (AI path reconciliation)", () => {
  it("promotes rule-parser create_customer when AI returns unknown", () => {
    const blended = blendExtraction("Add Golu as a customer in Ngoundéré", {
      action: "unknown",
      confidence: 0,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_customer");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it("promotes French create_customer when AI returns unknown", () => {
    const blended = blendExtraction("Ajouter Golu comme client à Ngoundéré", {
      action: "unknown",
      confidence: 0.2,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_customer");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it("boosts low-confidence AI create_customer when rule parser agrees", () => {
    const blended = blendExtraction("Add Golu as a customer in Ngoundéré", {
      action: "create_customer",
      customer_name: "Golu",
      city: "Ngoundéré",
      phone: null,
      country: null,
      confidence: 0.3,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_customer");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });
});
