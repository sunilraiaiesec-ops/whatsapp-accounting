import { prisma } from "@/lib/prisma";

// Per-contact document lists for the profile page's Invoices/Bills, Payments
// and Documents tabs. Kept separate from lib/documents.ts's org-wide list*
// helpers (which don't filter by party) and from lib/party-ledger.ts (which
// is the double-entry ledger view, not a document list) — every query here
// is scoped to both orgId and partyId.

export function listPartyInvoices(orgId: string, partyId: string, kind: "customer" | "supplier") {
  return kind === "customer"
    ? prisma.salesInvoice.findMany({
        where: { orgId, partyId },
        orderBy: { date: "desc" },
        take: 200,
      })
    : prisma.purchaseInvoice.findMany({
        where: { orgId, partyId },
        orderBy: { date: "desc" },
        take: 200,
      });
}

export function listPartyPayments(orgId: string, partyId: string, kind: "customer" | "supplier") {
  return kind === "customer"
    ? prisma.receipt.findMany({ where: { orgId, partyId }, orderBy: { date: "desc" }, take: 200 })
    : prisma.payment.findMany({ where: { orgId, partyId }, orderBy: { date: "desc" }, take: 200 });
}

// "Documents" = everything else touching this party that isn't already
// covered by Invoices/Bills or Payments: sales receipts / credit notes for
// customers, goods receipts / debit notes for suppliers.
export async function listPartyOtherDocuments(
  orgId: string,
  partyId: string,
  kind: "customer" | "supplier",
) {
  if (kind === "customer") {
    const [salesReceipts, creditNotes] = await Promise.all([
      prisma.salesReceipt.findMany({ where: { orgId, partyId }, orderBy: { date: "desc" }, take: 100 }),
      prisma.creditNote.findMany({ where: { orgId, partyId }, orderBy: { date: "desc" }, take: 100 }),
    ]);
    return [
      ...salesReceipts.map((r) => ({ id: r.id, kind: "sales_receipt" as const, number: r.number, date: r.date, total: r.total, href: `/sales-receipts/${r.id}` })),
      ...creditNotes.map((r) => ({ id: r.id, kind: "credit_note" as const, number: r.number, date: r.date, total: r.total, href: `/credit-notes/${r.id}` })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  const [goodsReceipts, debitNotes] = await Promise.all([
    prisma.goodsReceipt.findMany({ where: { orgId, partyId }, orderBy: { date: "desc" }, take: 100 }),
    prisma.debitNote.findMany({ where: { orgId, partyId }, orderBy: { date: "desc" }, take: 100 }),
  ]);
  return [
    ...goodsReceipts.map((r) => ({ id: r.id, kind: "goods_receipt" as const, number: r.number, date: r.date, total: r.total, href: `/goods-receipts/${r.id}` })),
    ...debitNotes.map((r) => ({ id: r.id, kind: "debit_note" as const, number: r.number, date: r.date, total: r.total, href: `/debit-notes/${r.id}` })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
}
