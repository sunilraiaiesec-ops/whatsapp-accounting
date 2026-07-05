import { describe, expect, it } from "vitest";

import { ruleBasedExtract } from "@/lib/bantoo/fallback";

describe("ruleBasedExtract (no-AI text fallback)", () => {
  it("maps a customer receipt to customer_payment", () => {
    const action = ruleBasedExtract("Received 25 million XAF from Elhaji Adoum");
    expect(action.action).toBe("customer_payment");
    if (action.action === "customer_payment") {
      expect(action.amount).toBe(25_000_000);
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
});
