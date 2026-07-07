import { describe, expect, it } from "vitest";

import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/ai/actions";
import { blendExtraction, ruleBasedExtract } from "@/lib/bantoo/fallback";

describe("ruleBasedExtract — Sales Intelligence Sprint sales_action mapping", () => {
  it('maps "Create an invoice for Musa for 50000" to sales_invoice', () => {
    const action = ruleBasedExtract("Create an invoice for Musa for 50000");
    expect(action.action).toBe("sales_invoice");
    if (action.action === "sales_invoice") {
      expect(action.customer_name).toBe("Musa");
      expect(action.amount).toBe(50000);
      expect(action.due_date).toBeNull();
    }
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it('maps "Create an invoice for Musa for 50000, due in 30 days" with a resolved due_date', () => {
    const action = ruleBasedExtract("Create an invoice for Musa for 50000, due in 30 days");
    expect(action.action).toBe("sales_invoice");
    if (action.action === "sales_invoice") {
      expect(action.customer_name).toBe("Musa");
      expect(action.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('maps "Facturer Musa 50000" to sales_invoice (French)', () => {
    const action = ruleBasedExtract("Facturer Musa 50000");
    expect(action.action).toBe("sales_invoice");
    if (action.action === "sales_invoice") {
      expect(action.customer_name).toBe("Musa");
      expect(action.amount).toBe(50000);
    }
  });

  it('maps "Émettre une facture pour Musa de 50000, échéance dans 30 jours" to sales_invoice (French)', () => {
    const action = ruleBasedExtract(
      "Émettre une facture pour Musa de 50000, échéance dans 30 jours",
    );
    expect(action.action).toBe("sales_invoice");
    if (action.action === "sales_invoice") {
      expect(action.customer_name).toBe("Musa");
      expect(action.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('maps "Issue a credit note for Musa for 5000" to credit_note', () => {
    const action = ruleBasedExtract("Issue a credit note for Musa for 5000");
    expect(action.action).toBe("credit_note");
    if (action.action === "credit_note") {
      expect(action.customer_name).toBe("Musa");
      expect(action.amount).toBe(5000);
    }
  });

  it('maps "Émettre une note de crédit pour Musa de 5000" to credit_note (French)', () => {
    const action = ruleBasedExtract("Émettre une note de crédit pour Musa de 5000");
    expect(action.action).toBe("credit_note");
    if (action.action === "credit_note") expect(action.customer_name).toBe("Musa");
  });

  it('maps "Refund Musa 5000" to refund_receipt', () => {
    const action = ruleBasedExtract("Refund Musa 5000");
    expect(action.action).toBe("refund_receipt");
    if (action.action === "refund_receipt") {
      expect(action.customer_name).toBe("Musa");
      expect(action.amount).toBe(5000);
    }
  });

  it('maps "Rembourser Musa 5000" to refund_receipt (French)', () => {
    const action = ruleBasedExtract("Rembourser Musa 5000");
    expect(action.action).toBe("refund_receipt");
    if (action.action === "refund_receipt") expect(action.customer_name).toBe("Musa");
  });

  it('maps "View sales invoices" to view_sales_invoice list (never a specific customer)', () => {
    const action = ruleBasedExtract("View sales invoices");
    expect(action.action).toBe("view_sales_invoice");
    if (action.action === "view_sales_invoice") {
      expect(action.view).toBe("list");
      expect(action.customer_name).toBeNull();
    }
  });

  it('maps "Voir les factures de vente" to view_sales_invoice list (French)', () => {
    const action = ruleBasedExtract("Voir les factures de vente");
    expect(action.action).toBe("view_sales_invoice");
    if (action.action === "view_sales_invoice") expect(action.view).toBe("list");
  });

  it('maps "Edit invoice INV-0001" to unsupported_sales_action edit (never "not sure")', () => {
    const action = ruleBasedExtract("Edit invoice INV-0001");
    expect(action.action).toBe("unsupported_sales_action");
    if (action.action === "unsupported_sales_action") expect(action.requested).toBe("edit");
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it('maps "Void invoice INV-0001" to unsupported_sales_action void', () => {
    const action = ruleBasedExtract("Void invoice INV-0001");
    expect(action.action).toBe("unsupported_sales_action");
    if (action.action === "unsupported_sales_action") expect(action.requested).toBe("void");
  });

  it('maps "Email invoice INV-0001 to Musa" to unsupported_sales_action email', () => {
    const action = ruleBasedExtract("Email invoice INV-0001 to Musa");
    expect(action.action).toBe("unsupported_sales_action");
    if (action.action === "unsupported_sales_action") {
      expect(action.requested).toBe("email");
      expect(action.customer_name).toBe("Musa");
    }
  });

  it('maps "Apply payment to invoice INV-0001" to unsupported_sales_action apply_payment', () => {
    const action = ruleBasedExtract("Apply payment to invoice INV-0001");
    expect(action.action).toBe("unsupported_sales_action");
    if (action.action === "unsupported_sales_action") expect(action.requested).toBe("apply_payment");
  });

  it('maps "Record a cash sale of 20000 from Musa" to sales_receipt with the customer name (regression fix)', () => {
    const action = ruleBasedExtract("Record a cash sale of 20000 from Musa");
    expect(action.action).toBe("sales_receipt");
    if (action.action === "sales_receipt") {
      expect(action.customer_name).toBe("Musa");
      expect(action.amount).toBe(20000);
    }
  });

  it('maps "Vente au comptant de 20000 à Musa" to sales_receipt with the customer name (French)', () => {
    const action = ruleBasedExtract("Vente au comptant de 20000 à Musa");
    expect(action.action).toBe("sales_receipt");
    if (action.action === "sales_receipt") {
      expect(action.customer_name).toBe("Musa");
      expect(action.amount).toBe(20000);
    }
  });

  it("does not misclassify a customer/supplier command as a sales_action", () => {
    const action = ruleBasedExtract("Call customer Musa");
    expect(action.action).not.toBe("sales_invoice");
    expect(action.action).not.toBe("credit_note");
    expect(action.action).not.toBe("refund_receipt");
  });
});

describe("blendExtraction — Sales Intelligence Sprint", () => {
  it("fills a missing customer_name on low-confidence AI sales_invoice from the rule parser", () => {
    const blended = blendExtraction("Create an invoice for Musa for 50000", {
      action: "sales_invoice",
      customer_name: null,
      amount: 50000,
      description: null,
      date: null,
      due_date: null,
      confidence: 0.3,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("sales_invoice");
    if (blended.action === "sales_invoice") {
      expect(blended.customer_name).toBe("Musa");
      expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    }
  });

  it("promotes rule-parser view_sales_invoice when AI returns unknown", () => {
    const blended = blendExtraction("View sales invoices", {
      action: "unknown",
      confidence: 0,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("view_sales_invoice");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it("never merges customer_name across different sales action types", () => {
    const blended = blendExtraction("Refund Musa 5000", {
      action: "credit_note",
      customer_name: null,
      amount: 5000,
      description: null,
      date: null,
      confidence: 0.9,
      currency: "XAF",
      summary: null,
    });
    // Rule parser says refund_receipt, AI says credit_note — different actions
    // must not be silently merged into one another.
    expect(blended.action).toBe("credit_note");
    if (blended.action === "credit_note") {
      expect(blended.customer_name).toBeNull();
    }
  });
});
