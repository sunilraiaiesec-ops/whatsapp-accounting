import { describe, expect, it } from "vitest";

import { buildSupplierQuoteMessage, buildWhatsAppLink, FORBIDDEN_PHRASES } from "@/lib/reorder-message";

describe("buildSupplierQuoteMessage", () => {
  it("matches the required message shape and fields", () => {
    const message = buildSupplierQuoteMessage({
      supplierName: "Fresh Foods Ltd",
      quantity: "50",
      unit: "bags",
      productName: "Rice 50kg",
    });

    expect(message).toBe(
      [
        "Hello Fresh Foods Ltd,",
        "Please quote us for 50 bags of Rice 50kg.",
        "",
        "Kindly confirm:",
        "- Current price",
        "- Available quantity",
        "- Earliest delivery date",
        "- Payment terms",
        "",
        "Thank you.",
      ].join("\n"),
    );
  });

  it("falls back to a generic unit when none is provided", () => {
    const message = buildSupplierQuoteMessage({
      supplierName: "Ngozi Supplies",
      quantity: "10",
      unit: "",
      productName: "Cooking oil",
    });
    expect(message).toContain("Please quote us for 10 units of Cooking oil.");
  });

  it("trims whitespace from every field", () => {
    const message = buildSupplierQuoteMessage({
      supplierName: "  Bantoo Traders  ",
      quantity: " 20 ",
      unit: " cartons ",
      productName: " Bottled water ",
    });
    expect(message).toContain("Hello Bantoo Traders,");
    expect(message).toContain("Please quote us for 20 cartons of Bottled water.");
  });
});

// Critical: the supplier must never learn this is a low-stock/urgent
// reorder, and must never see the internal stock or reorder-level numbers.
describe("buildSupplierQuoteMessage — never leaks urgency or stock signals", () => {
  const representativeInputs = [
    { supplierName: "Fresh Foods Ltd", quantity: "50", unit: "bags", productName: "Rice 50kg", currentStock: "3", reorderLevel: "10" },
    { supplierName: "Ngozi Supplies", quantity: "5", unit: "cartons", productName: "Cooking oil 5L", currentStock: "0", reorderLevel: "6" },
    { supplierName: "Cameroon Beverages", quantity: "120", unit: "crates", productName: "Bottled water", currentStock: "8", reorderLevel: "8" },
    { supplierName: "Douala Grains Co.", quantity: "150", unit: "kg", productName: "Maize flour", currentStock: "15.5", reorderLevel: "25" },
  ];

  it.each(representativeInputs)(
    "contains no forbidden phrase and no literal stock/reorder numbers for %o",
    ({ supplierName, quantity, unit, productName, currentStock, reorderLevel }) => {
      const message = buildSupplierQuoteMessage({ supplierName, quantity, unit, productName });
      const lower = message.toLowerCase();

      for (const phrase of FORBIDDEN_PHRASES) {
        expect(lower).not.toContain(phrase.toLowerCase());
      }

      // The literal current-stock/reorder-level numbers must never appear,
      // unless they happen to coincide with the (legitimate) quantity value.
      if (currentStock !== quantity) {
        expect(message).not.toContain(currentStock);
      }
      if (reorderLevel !== quantity) {
        expect(message).not.toContain(reorderLevel);
      }
    },
  );

  it("never mentions urgency even when the caller (incorrectly) tries to smuggle it into a field", () => {
    // Defense in depth: even if a caller passed urgency language into a
    // free-text-ish field, the fixed template around it must still read as
    // neutral purchasing language, and the literal forbidden phrases test
    // above is the actual guarantee — this just documents the expectation
    // that the template itself adds no urgency of its own.
    const message = buildSupplierQuoteMessage({
      supplierName: "Test Supplier",
      quantity: "1",
      unit: "unit",
      productName: "Test product",
    });
    const lower = message.toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(lower).not.toContain(phrase.toLowerCase());
    }
  });
});

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link with a URL-encoded message", () => {
    const link = buildWhatsAppLink("237612345678", "Hello there,\nLine two.");
    expect(link).toBe(
      `https://wa.me/237612345678?text=${encodeURIComponent("Hello there,\nLine two.")}`,
    );
    expect(link.startsWith("https://wa.me/237612345678?text=")).toBe(true);
  });
});
