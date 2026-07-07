import { describe, expect, it } from "vitest";

import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/ai/actions";
import { blendExtraction, ruleBasedExtract } from "@/lib/bantoo/fallback";

describe("ruleBasedExtract — Supplier & Purchasing Intelligence Sprint supplier_action mapping", () => {
  it('maps "Edit supplier Adamou: phone 690123456" to edit_supplier', () => {
    const action = ruleBasedExtract("Edit supplier Adamou: phone 690123456");
    expect(action.action).toBe("edit_supplier");
    if (action.action === "edit_supplier") {
      expect(action.supplier_name).toBe("Adamou");
      expect(action.phone).toBe("690123456");
    }
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it('maps "Modifier le fournisseur Adamou" to edit_supplier (French)', () => {
    const action = ruleBasedExtract("Modifier le fournisseur Adamou");
    expect(action.action).toBe("edit_supplier");
    if (action.action === "edit_supplier") expect(action.supplier_name).toBe("Adamou");
  });

  it('maps "Open supplier Adamou\'s profile" to view_supplier profile', () => {
    const action = ruleBasedExtract("Open supplier Adamou's profile");
    expect(action.action).toBe("view_supplier");
    if (action.action === "view_supplier") {
      expect(action.view).toBe("profile");
      expect(action.supplier_name).toBe("Adamou");
    }
  });

  it('maps "Search suppliers" to view_supplier list (never a specific supplier)', () => {
    const action = ruleBasedExtract("Search suppliers");
    expect(action.action).toBe("view_supplier");
    if (action.action === "view_supplier") {
      expect(action.view).toBe("list");
      expect(action.supplier_name).toBeNull();
    }
  });

  it('maps "Show supplier Adamou\'s ledger" to view_supplier ledger', () => {
    const action = ruleBasedExtract("Show supplier Adamou's ledger");
    expect(action.action).toBe("view_supplier");
    if (action.action === "view_supplier") expect(action.view).toBe("ledger");
  });

  it('maps "How much do we owe supplier Adamou?" to supplier_balance', () => {
    const action = ruleBasedExtract("How much do we owe supplier Adamou?");
    expect(action.action).toBe("supplier_balance");
    if (action.action === "supplier_balance") expect(action.supplier_name).toBe("Adamou");
  });

  it('maps "Combien devons-nous au fournisseur Adamou ?" to supplier_balance (French)', () => {
    const action = ruleBasedExtract("Combien devons-nous au fournisseur Adamou ?");
    expect(action.action).toBe("supplier_balance");
    if (action.action === "supplier_balance") expect(action.supplier_name).toBe("Adamou");
  });

  it('maps "Add a note to supplier Adamou: delivers on Tuesdays" to add_supplier_note', () => {
    const action = ruleBasedExtract("Add a note to supplier Adamou: delivers on Tuesdays");
    expect(action.action).toBe("add_supplier_note");
    if (action.action === "add_supplier_note") {
      expect(action.supplier_name).toBe("Adamou");
      expect(action.note).toBe("delivers on Tuesdays");
    }
  });

  it('maps "Call supplier Adamou" to contact_supplier call', () => {
    const action = ruleBasedExtract("Call supplier Adamou");
    expect(action.action).toBe("contact_supplier");
    if (action.action === "contact_supplier") {
      expect(action.method).toBe("call");
      expect(action.supplier_name).toBe("Adamou");
    }
  });

  it('maps "WhatsApp supplier Adamou" to contact_supplier whatsapp', () => {
    const action = ruleBasedExtract("WhatsApp supplier Adamou");
    expect(action.action).toBe("contact_supplier");
    if (action.action === "contact_supplier") expect(action.method).toBe("whatsapp");
  });

  it('maps "Email supplier Adamou" to contact_supplier email', () => {
    const action = ruleBasedExtract("Email supplier Adamou");
    expect(action.action).toBe("contact_supplier");
    if (action.action === "contact_supplier") expect(action.method).toBe("email");
  });

  it('maps "What did we buy from supplier Elhaji last month?" to supplier_query', () => {
    const action = ruleBasedExtract("What did we buy from supplier Elhaji last month?");
    expect(action.action).toBe("supplier_query");
    if (action.action === "supplier_query") {
      expect(action.supplier_name).toBe("Elhaji");
      expect(action.period_text).toBe("last month");
    }
  });

  it('maps "Archive supplier Adamou" to unsupported_supplier_action (never "not sure")', () => {
    const action = ruleBasedExtract("Archive supplier Adamou");
    expect(action.action).toBe("unsupported_supplier_action");
    if (action.action === "unsupported_supplier_action") {
      expect(action.requested).toBe("archive");
      expect(action.supplier_name).toBe("Adamou");
    }
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it('maps "Merge suppliers Adamou and Adamou Issa" to unsupported_supplier_action merge', () => {
    const action = ruleBasedExtract("Merge suppliers Adamou and Adamou Issa");
    expect(action.action).toBe("unsupported_supplier_action");
    if (action.action === "unsupported_supplier_action") expect(action.requested).toBe("merge");
  });

  it("does not misclassify a customer command as a supplier_action", () => {
    const action = ruleBasedExtract("Call customer Adamou");
    expect(action.action).not.toBe("contact_supplier");
  });
});

describe("blendExtraction — Supplier & Purchasing Intelligence Sprint", () => {
  it("fills a missing supplier_name on low-confidence AI edit_supplier from the rule parser", () => {
    const blended = blendExtraction("Edit supplier Adamou: phone 690123456", {
      action: "edit_supplier",
      supplier_name: null,
      new_name: null,
      city: null,
      phone: "690123456",
      whatsapp: null,
      email: null,
      confidence: 0.3,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("edit_supplier");
    if (blended.action === "edit_supplier") {
      expect(blended.supplier_name).toBe("Adamou");
      expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    }
  });

  it("promotes rule-parser view_supplier when AI returns unknown", () => {
    const blended = blendExtraction("Open supplier Adamou's profile", {
      action: "unknown",
      confidence: 0,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("view_supplier");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it("never merges supplier_name across different action types", () => {
    const blended = blendExtraction("Call supplier Adamou", {
      action: "supplier_balance",
      supplier_name: null,
      confidence: 0.9,
      currency: "XAF",
      summary: null,
    });
    // Rule parser says contact_supplier, AI says supplier_balance — different
    // actions must not be silently merged into one another.
    expect(blended.action).toBe("supplier_balance");
    if (blended.action === "supplier_balance") {
      expect(blended.supplier_name).toBeNull();
    }
  });

  it("does not merge supplier_name for pre-existing transactional actions (backward compatibility)", () => {
    // receive_stock already carried supplier_name before this sprint; its
    // blend behavior must stay exactly as it was (no supplier_name merging),
    // since the AI/rule may disagree on which supplier this is.
    const blended = blendExtraction("Received 150 bags of rice from Adamou", {
      action: "receive_stock",
      product_name: "rice",
      barcode: null,
      sku: null,
      unit: "bags",
      quantity: 150,
      cost_price: null,
      supplier_name: null,
      date: null,
      currency: "XAF",
      confidence: 0.9,
      summary: null,
    });
    expect(blended.action).toBe("receive_stock");
    if (blended.action === "receive_stock") {
      expect(blended.supplier_name).toBeNull();
    }
  });
});
