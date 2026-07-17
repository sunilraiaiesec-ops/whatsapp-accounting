import { describe, expect, it, vi } from "vitest";

// --- Mocks: no DB / network. -------------------------------------------------
const salesInvoiceFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesInvoice: { findMany: (...args: unknown[]) => salesInvoiceFindMany(...args) },
  },
}));

const {
  getDueSoonAndOverdueInvoices,
  getPaymentReminderCount,
  buildPaymentReminderMessage,
  FORBIDDEN_PHRASES,
  buildWhatsAppLink,
} = await import("@/lib/billing/reminders");

const NOW = new Date("2026-07-05T12:00:00Z");

const PARTY_A = { id: "party_A", name: "Alice Traders", phone: "612345678", whatsapp: null };

function invoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "inv_1",
    orgId: "org_A",
    number: "INV-0001",
    partyId: "party_A",
    date: new Date("2026-06-01"),
    dueDate: new Date("2026-07-05"),
    reference: null,
    notes: null,
    total: 50_000n,
    amountPaid: 0n,
    status: "UNPAID",
    journalEntryId: "je_1",
    createdAt: new Date("2026-06-01"),
    party: PARTY_A,
    ...overrides,
  };
}

describe("getDueSoonAndOverdueInvoices — bucketing", () => {
  it("buckets an invoice due today as due-soon, not overdue", async () => {
    salesInvoiceFindMany.mockResolvedValue([invoice({ id: "inv_today", dueDate: new Date("2026-07-05") })]);
    const result = await getDueSoonAndOverdueInvoices("org_A", 7, NOW);
    expect(result.dueSoon.map((i) => i.id)).toEqual(["inv_today"]);
    expect(result.overdue).toEqual([]);
  });

  it("buckets an invoice due within the window as due-soon", async () => {
    salesInvoiceFindMany.mockResolvedValue([invoice({ id: "inv_soon", dueDate: new Date("2026-07-10") })]);
    const result = await getDueSoonAndOverdueInvoices("org_A", 7, NOW);
    expect(result.dueSoon.map((i) => i.id)).toEqual(["inv_soon"]);
    expect(result.overdue).toEqual([]);
  });

  it("buckets an invoice due in the past as overdue", async () => {
    salesInvoiceFindMany.mockResolvedValue([invoice({ id: "inv_overdue", dueDate: new Date("2026-07-01") })]);
    const result = await getDueSoonAndOverdueInvoices("org_A", 7, NOW);
    expect(result.overdue.map((i) => i.id)).toEqual(["inv_overdue"]);
    expect(result.dueSoon).toEqual([]);
  });

  it("excludes an invoice due further out than the window", async () => {
    salesInvoiceFindMany.mockResolvedValue([invoice({ id: "inv_far", dueDate: new Date("2026-08-01") })]);
    const result = await getDueSoonAndOverdueInvoices("org_A", 7, NOW);
    expect(result.dueSoon).toEqual([]);
    expect(result.overdue).toEqual([]);
  });

  it("respects a custom dueSoonWindowDays", async () => {
    salesInvoiceFindMany.mockResolvedValue([invoice({ id: "inv_14", dueDate: new Date("2026-07-18") })]);
    const withDefault = await getDueSoonAndOverdueInvoices("org_A", 7, NOW);
    expect(withDefault.dueSoon).toEqual([]);

    const withWiderWindow = await getDueSoonAndOverdueInvoices("org_A", 14, NOW);
    expect(withWiderWindow.dueSoon.map((i) => i.id)).toEqual(["inv_14"]);
  });

  it("only ever queries with the caller's own orgId, excludes paid invoices and null due dates", async () => {
    salesInvoiceFindMany.mockResolvedValue([]);
    await getDueSoonAndOverdueInvoices("org_B", 7, NOW);
    expect(salesInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org_B",
          status: { in: ["UNPAID", "PARTIALLY_PAID"] },
          dueDate: { not: null },
        }),
      }),
    );
  });
});

describe("getPaymentReminderCount", () => {
  it("returns the combined due-soon + overdue count", async () => {
    salesInvoiceFindMany.mockResolvedValue([
      invoice({ id: "a", dueDate: new Date("2026-07-01") }), // overdue
      invoice({ id: "b", dueDate: new Date("2026-07-06") }), // due soon
      invoice({ id: "c", dueDate: new Date("2026-09-01") }), // neither
    ]);
    const count = await getPaymentReminderCount("org_A", 7, NOW);
    expect(count).toBe(2);
  });
});

describe("buildPaymentReminderMessage", () => {
  it("includes the invoice number, amount, currency and due date", () => {
    const message = buildPaymentReminderMessage({
      customerName: "Alice Traders",
      invoiceNumber: "INV-0001",
      amount: "50,000",
      currency: "XAF",
      dueDate: "Jul 5, 2026",
    });
    expect(message).toContain("Alice Traders");
    expect(message).toContain("INV-0001");
    expect(message).toContain("50,000");
    expect(message).toContain("XAF");
    expect(message).toContain("Jul 5, 2026");
  });

  it.each([
    { customerName: "Bob Ngu", invoiceNumber: "INV-0042", amount: "12,000", currency: "XAF", dueDate: "Jul 1, 2026" },
    { customerName: "Cameroon Beverages", invoiceNumber: "INV-1001", amount: "1,200,000", currency: "XAF", dueDate: "Jun 30, 2026" },
  ])("never contains a forbidden phrase for %o", (input) => {
    const message = buildPaymentReminderMessage(input);
    const lower = message.toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(lower).not.toContain(phrase.toLowerCase());
    }
  });

  it("falls back to a generic greeting when no customer name is given", () => {
    const message = buildPaymentReminderMessage({
      customerName: "",
      invoiceNumber: "INV-0001",
      amount: "1,000",
      currency: "XAF",
      dueDate: "Jul 5, 2026",
    });
    expect(message).toContain("Hello there,");
  });
});

// This module never sends anything itself — the only "transport" it offers
// is buildWhatsAppLink() (re-exported from lib/reorder-message.ts), which
// just builds a wa.me draft link. No send-side-effect / API call exists
// anywhere in this module, so a reminder can only ever be sent by the human
// user manually clicking that link and pressing Send inside WhatsApp.
describe("buildPaymentReminderMessage — never auto-sent", () => {
  it("buildWhatsAppLink only ever produces a clickable wa.me draft link, never sends anything", () => {
    const message = buildPaymentReminderMessage({
      customerName: "Alice Traders",
      invoiceNumber: "INV-0001",
      amount: "50,000",
      currency: "XAF",
      dueDate: "Jul 5, 2026",
    });
    const link = buildWhatsAppLink("237612345678", message);
    expect(link.startsWith("https://wa.me/237612345678?text=")).toBe(true);
  });
});
