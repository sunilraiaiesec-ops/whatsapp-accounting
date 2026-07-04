import { prisma } from "@/lib/prisma";

// Live counts shown as badges next to each sidebar module, mirroring manager.io.
// Modules not yet implemented report 0.
export type SidebarCounts = Record<string, number>;

export async function getSidebarCounts(orgId: string): Promise<SidebarCounts> {
  const [
    bankCash,
    receipts,
    payments,
    customers,
    suppliers,
    salesInvoices,
    salesReceipts,
    purchaseInvoices,
    transfers,
    creditNotes,
    refundReceipts,
    debitNotes,
    goodsReceipts,
    inventoryItems,
    inventoryWriteOffs,
    inventoryAdjustments,
    journalEntries,
  ] = await Promise.all([
    prisma.account.count({ where: { orgId, subtype: { in: ["bank", "cash"] } } }),
    prisma.receipt.count({ where: { orgId } }),
    prisma.payment.count({ where: { orgId } }),
    prisma.party.count({ where: { orgId, type: { in: ["customer", "both"] } } }),
    prisma.party.count({ where: { orgId, type: { in: ["supplier", "both"] } } }),
    prisma.salesInvoice.count({ where: { orgId } }),
    prisma.salesReceipt.count({ where: { orgId } }),
    prisma.purchaseInvoice.count({ where: { orgId } }),
    prisma.interAccountTransfer.count({ where: { orgId } }),
    prisma.creditNote.count({ where: { orgId } }),
    prisma.refundReceipt.count({ where: { orgId } }),
    prisma.debitNote.count({ where: { orgId } }),
    prisma.goodsReceipt.count({ where: { orgId } }),
    prisma.inventoryItem.count({ where: { orgId } }),
    prisma.inventoryWriteOff.count({ where: { orgId } }),
    prisma.inventoryAdjustment.count({ where: { orgId } }),
    prisma.journalEntry.count({ where: { orgId, sourceType: "manual" } }),
  ]);

  return {
    "/bank-and-cash-accounts": bankCash,
    "/receipts": receipts,
    "/payments": payments,
    "/customers": customers,
    "/suppliers": suppliers,
    "/sales-invoices": salesInvoices,
    "/sales-receipts": salesReceipts,
    "/purchase-invoices": purchaseInvoices,
    "/inter-account-transfers": transfers,
    "/credit-notes": creditNotes,
    "/refund-receipts": refundReceipts,
    "/debit-notes": debitNotes,
    "/goods-receipts": goodsReceipts,
    "/inventory-items": inventoryItems,
    "/inventory-write-offs": inventoryWriteOffs,
    "/inventory-adjustments": inventoryAdjustments,
    "/journal": journalEntries,
  };
}
