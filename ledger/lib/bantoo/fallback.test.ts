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

  it('maps "ajouter un client nommé Tanha Abdullah" to create_customer (French nommé)', () => {
    const action = ruleBasedExtract("ajouter un client nommé Tanha Abdullah");
    expect(action.action).toBe("create_customer");
    if (action.action === "create_customer") {
      expect(action.customer_name).toBe("Tanha Abdullah");
    }
  });

  it('maps "Add Golu as a client in Ngoundéré" to create_customer (client synonym)', () => {
    const action = ruleBasedExtract("Add Golu as a client in Ngoundéré");
    expect(action.action).toBe("create_customer");
    if (action.action === "create_customer") {
      expect(action.customer_name).toBe("Golu");
      expect(action.city).toBe("Ngoundéré");
    }
  });

  it('maps "Add Tanha Abdullah as a customer" to create_customer', () => {
    const action = ruleBasedExtract("Add Tanha Abdullah as a customer");
    expect(action.action).toBe("create_customer");
    if (action.action === "create_customer") {
      expect(action.customer_name).toBe("Tanha Abdullah");
    }
  });
});

describe("ruleBasedExtract — Customer Intelligence Sprint customer_action mapping", () => {
  it('maps "Edit customer Musa: phone 690123456" to edit_customer', () => {
    const action = ruleBasedExtract("Edit customer Musa: phone 690123456");
    expect(action.action).toBe("edit_customer");
    if (action.action === "edit_customer") {
      expect(action.customer_name).toBe("Musa");
      expect(action.phone).toBe("690123456");
    }
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it('maps "Modifier le client Musa" to edit_customer (French)', () => {
    const action = ruleBasedExtract("Modifier le client Musa");
    expect(action.action).toBe("edit_customer");
    if (action.action === "edit_customer") expect(action.customer_name).toBe("Musa");
  });

  it('maps "Open Musa\'s profile" to view_customer profile', () => {
    const action = ruleBasedExtract("Open Musa's profile");
    expect(action.action).toBe("view_customer");
    if (action.action === "view_customer") {
      expect(action.view).toBe("profile");
      expect(action.customer_name).toBe("Musa");
    }
  });

  it('maps "Search customers" to view_customer list (never a specific customer)', () => {
    const action = ruleBasedExtract("Search customers");
    expect(action.action).toBe("view_customer");
    if (action.action === "view_customer") {
      expect(action.view).toBe("list");
      expect(action.customer_name).toBeNull();
    }
  });

  it('maps "Show Musa\'s ledger" to view_customer ledger', () => {
    const action = ruleBasedExtract("Show Musa's ledger");
    expect(action.action).toBe("view_customer");
    if (action.action === "view_customer") expect(action.view).toBe("ledger");
  });

  it('maps "What is Musa\'s outstanding balance?" to customer_balance', () => {
    const action = ruleBasedExtract("What is Musa's outstanding balance?");
    expect(action.action).toBe("customer_balance");
    if (action.action === "customer_balance") expect(action.customer_name).toBe("Musa");
  });

  it('maps "Quel est le solde impayé de Musa ?" to customer_balance (French)', () => {
    const action = ruleBasedExtract("Quel est le solde impayé de Musa ?");
    expect(action.action).toBe("customer_balance");
    if (action.action === "customer_balance") expect(action.customer_name).toBe("Musa");
  });

  it('maps "Show Musa\'s statement for June" to view_customer statement with period', () => {
    const action = ruleBasedExtract("Show Musa's statement for June");
    expect(action.action).toBe("view_customer");
    if (action.action === "view_customer") {
      expect(action.view).toBe("statement");
      expect(action.period_text).toBe("June");
    }
  });

  it('maps "Add a note to customer Musa: prefers morning delivery" to add_customer_note', () => {
    const action = ruleBasedExtract("Add a note to customer Musa: prefers morning delivery");
    expect(action.action).toBe("add_customer_note");
    if (action.action === "add_customer_note") {
      expect(action.customer_name).toBe("Musa");
      expect(action.note).toBe("prefers morning delivery");
    }
  });

  it('maps "Call customer Musa" to contact_customer call', () => {
    const action = ruleBasedExtract("Call customer Musa");
    expect(action.action).toBe("contact_customer");
    if (action.action === "contact_customer") {
      expect(action.method).toBe("call");
      expect(action.customer_name).toBe("Musa");
    }
  });

  it('maps "WhatsApp customer Musa" to contact_customer whatsapp', () => {
    const action = ruleBasedExtract("WhatsApp customer Musa");
    expect(action.action).toBe("contact_customer");
    if (action.action === "contact_customer") expect(action.method).toBe("whatsapp");
  });

  it('maps "Email customer Musa" to contact_customer email', () => {
    const action = ruleBasedExtract("Email customer Musa");
    expect(action.action).toBe("contact_customer");
    if (action.action === "contact_customer") expect(action.method).toBe("email");
  });

  it('maps "What did Musa buy last month?" to customer_query', () => {
    const action = ruleBasedExtract("What did Musa buy last month?");
    expect(action.action).toBe("customer_query");
    if (action.action === "customer_query") {
      expect(action.customer_name).toBe("Musa");
      expect(action.period_text).toBe("last month");
    }
  });

  it('maps "Archive customer Musa" to unsupported_customer_action (never "not sure")', () => {
    const action = ruleBasedExtract("Archive customer Musa");
    expect(action.action).toBe("unsupported_customer_action");
    if (action.action === "unsupported_customer_action") {
      expect(action.requested).toBe("archive");
      expect(action.customer_name).toBe("Musa");
    }
    expect(action.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it('maps "Merge customers Musa and Musa Ibrahim" to unsupported_customer_action merge', () => {
    const action = ruleBasedExtract("Merge customers Musa and Musa Ibrahim");
    expect(action.action).toBe("unsupported_customer_action");
    if (action.action === "unsupported_customer_action") expect(action.requested).toBe("merge");
  });

  it("does not misclassify a supplier command as a customer_action", () => {
    const action = ruleBasedExtract("Call supplier Musa");
    expect(action.action).not.toBe("contact_customer");
  });
});

describe("blendExtraction — Customer Intelligence Sprint", () => {
  it("fills a missing customer_name on low-confidence AI edit_customer from the rule parser", () => {
    const blended = blendExtraction("Edit customer Musa: phone 690123456", {
      action: "edit_customer",
      customer_name: null,
      new_name: null,
      city: null,
      phone: "690123456",
      whatsapp: null,
      email: null,
      confidence: 0.3,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("edit_customer");
    if (blended.action === "edit_customer") {
      expect(blended.customer_name).toBe("Musa");
      expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    }
  });

  it("promotes rule-parser view_customer when AI returns unknown", () => {
    const blended = blendExtraction("Open Musa's profile", {
      action: "unknown",
      confidence: 0,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("view_customer");
    expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it("never merges customer_name across different action types", () => {
    const blended = blendExtraction("Call customer Musa", {
      action: "customer_balance",
      customer_name: null,
      confidence: 0.9,
      currency: "XAF",
      summary: null,
    });
    // Rule parser says contact_customer, AI says customer_balance — different
    // actions must not be silently merged into one another.
    expect(blended.action).toBe("customer_balance");
    if (blended.action === "customer_balance") {
      expect(blended.customer_name).toBeNull();
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

  it('detects create_customer for "ajouter un client nommé …"', () => {
    const parsed = parseBantooCommandText("ajouter un client nommé Tanha Abdullah");
    expect(parsed.intent).toBe("create_customer");
    expect(parsed.partyName).toBe("Tanha Abdullah");
  });

  it('detects create_customer for "Add … as a client in …"', () => {
    const parsed = parseBantooCommandText("Add Golu as a client in Ngoundéré");
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

  it("promotes from AI summary when raw text and action are unknown", () => {
    const blended = blendExtraction("Tanha Abdullah", {
      action: "unknown",
      confidence: 0.2,
      currency: "XAF",
      summary: "L'utilisateur souhaite ajouter un client nommé Tanha Abdullah.",
    });
    expect(blended.action).toBe("create_customer");
    if (blended.action === "create_customer") {
      expect(blended.customer_name).toBe("Tanha Abdullah");
      expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    }
  });

  it("fills missing customer_name on low-confidence AI create_customer from rules", () => {
    const blended = blendExtraction("Add Tanha Abdullah as a customer", {
      action: "create_customer",
      customer_name: null,
      city: null,
      phone: null,
      country: null,
      confidence: 0.35,
      currency: "XAF",
      summary: null,
    });
    expect(blended.action).toBe("create_customer");
    if (blended.action === "create_customer") {
      expect(blended.customer_name).toBe("Tanha Abdullah");
      expect(blended.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    }
  });
});
