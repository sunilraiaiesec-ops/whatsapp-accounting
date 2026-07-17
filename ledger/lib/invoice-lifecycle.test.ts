import { describe, expect, it } from "vitest";

import { deriveInvoiceStatus, isOverdue } from "@/lib/invoice-lifecycle";

describe("deriveInvoiceStatus", () => {
  it("returns UNPAID when nothing has been paid", () => {
    expect(deriveInvoiceStatus(10_000n, 0n)).toBe("UNPAID");
  });

  it("returns PARTIALLY_PAID when some but not all has been paid", () => {
    expect(deriveInvoiceStatus(10_000n, 4_000n)).toBe("PARTIALLY_PAID");
  });

  it("returns PAID once amountPaid reaches the total", () => {
    expect(deriveInvoiceStatus(10_000n, 10_000n)).toBe("PAID");
  });

  it("returns PAID for an overpayment (amountPaid > total)", () => {
    expect(deriveInvoiceStatus(10_000n, 12_000n)).toBe("PAID");
  });

  it("treats a negative amountPaid the same as zero (defensive)", () => {
    expect(deriveInvoiceStatus(10_000n, -1n)).toBe("UNPAID");
  });
});

describe("isOverdue", () => {
  const asOf = new Date("2026-07-10T12:00:00Z");

  it("is false for PAID invoices regardless of due date", () => {
    expect(isOverdue("PAID", new Date("2026-01-01"), asOf)).toBe(false);
  });

  it("is false for DRAFT invoices", () => {
    expect(isOverdue("DRAFT", new Date("2026-01-01"), asOf)).toBe(false);
  });

  it("is false for VOIDED invoices", () => {
    expect(isOverdue("VOIDED", new Date("2026-01-01"), asOf)).toBe(false);
  });

  it("is false when there is no due date", () => {
    expect(isOverdue("UNPAID", null, asOf)).toBe(false);
  });

  it("is true for an UNPAID invoice past its due date", () => {
    expect(isOverdue("UNPAID", new Date("2026-07-01"), asOf)).toBe(true);
  });

  it("is true for a PARTIALLY_PAID invoice past its due date", () => {
    expect(isOverdue("PARTIALLY_PAID", new Date("2026-07-01"), asOf)).toBe(true);
  });

  it("is false on the due date itself (not yet overdue)", () => {
    expect(isOverdue("UNPAID", new Date("2026-07-10"), asOf)).toBe(false);
  });

  it("is false for a future due date", () => {
    expect(isOverdue("UNPAID", new Date("2026-08-01"), asOf)).toBe(false);
  });
});
