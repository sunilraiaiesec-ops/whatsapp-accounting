import { Prisma, type InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { postEntryWithin, removeEntryWithin } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/numbering";
import {
  receivableAccount,
  payableAccount,
  inventoryAccount,
  cogsAccount,
  ensureTaxRecoverableAccount,
  ensureTaxPayableAccount,
} from "@/lib/accounts";
import { DocumentError, computeTax, type InvoiceLineInput } from "@/lib/documents";
import { reverseSalesInvoiceStock, applySalesInvoiceStock } from "@/lib/document-update";

// ---------------------------------------------------------------------------
// Pure status/date logic — the single source of truth so it's never
// duplicated/drifted across create/update/allocate/void call sites.
// ---------------------------------------------------------------------------

// Never call this against a DRAFT or VOIDED invoice — those two statuses are
// NOT derived from amountPaid and must be preserved by the caller (a draft
// can't have payments applied; a voided invoice is locked and ignores
// amountPaid entirely once voided).
export function deriveInvoiceStatus(
  total: bigint,
  amountPaid: bigint,
): "UNPAID" | "PARTIALLY_PAID" | "PAID" {
  if (amountPaid <= 0n) return "UNPAID";
  if (amountPaid >= total) return "PAID";
  return "PARTIALLY_PAID";
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// "Overdue" is intentionally not a stored status (see prisma/schema.prisma's
// InvoiceStatus enum comment) — it's a derived date-based overlay computed
// here, so it never needs a background job to keep in sync.
export function isOverdue(
  status: InvoiceStatus,
  dueDate: Date | null,
  asOf: Date = new Date(),
): boolean {
  if (status !== "UNPAID" && status !== "PARTIALLY_PAID") return false;
  if (!dueDate) return false;
  return startOfUtcDay(dueDate).getTime() < startOfUtcDay(asOf).getTime();
}

// ---------------------------------------------------------------------------
// Read-only, org-scoped query — powers the "Apply to invoices" picker in
// CashDocForm once a party is selected.
// ---------------------------------------------------------------------------

export type OpenInvoice = {
  id: string;
  number: string;
  date: Date;
  dueDate: Date | null;
  total: bigint;
  amountPaid: bigint;
  balance: bigint;
};

export async function listOpenInvoicesForParty(
  orgId: string,
  partyId: string,
  type: "sales" | "purchase",
): Promise<OpenInvoice[]> {
  const where = {
    orgId,
    partyId,
    status: { in: ["UNPAID", "PARTIALLY_PAID"] as InvoiceStatus[] },
  };
  const rows =
    type === "sales"
      ? await prisma.salesInvoice.findMany({
          where,
          select: { id: true, number: true, date: true, dueDate: true, total: true, amountPaid: true },
          orderBy: [{ dueDate: "asc" }, { date: "asc" }],
        })
      : await prisma.purchaseInvoice.findMany({
          where,
          select: { id: true, number: true, date: true, dueDate: true, total: true, amountPaid: true },
          orderBy: [{ dueDate: "asc" }, { date: "asc" }],
        });
  return rows.map((r) => ({ ...r, balance: r.total - r.amountPaid }));
}

// ---------------------------------------------------------------------------
// Payment allocation — links a Receipt/Payment to the specific invoice(s) it
// settles. Does NOT require full allocation of the receipt/payment's total
// (a customer can overpay, or pay for a mix of invoiced and non-invoiced
// items) — only per-invoice over-allocation is rejected. All functions here
// take `tx` and must be called from within an existing prisma.$transaction.
// ---------------------------------------------------------------------------

export type AllocationInput = { invoiceId: string; amount: bigint };

export async function applyReceiptAllocations(
  tx: Prisma.TransactionClient,
  orgId: string,
  receiptId: string,
  allocations: AllocationInput[],
) {
  const valid = allocations.filter((a) => a.invoiceId && a.amount > 0n);
  if (valid.length === 0) return [];

  const invoices = await tx.salesInvoice.findMany({
    where: { orgId, id: { in: valid.map((a) => a.invoiceId) } },
  });
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  const runningPaid = new Map(invoices.map((inv) => [inv.id, inv.amountPaid]));

  const created = [];
  for (const alloc of valid) {
    const invoice = byId.get(alloc.invoiceId);
    if (!invoice) throw new DocumentError("Invoice not found");
    if (invoice.status === "DRAFT" || invoice.status === "VOIDED") {
      throw new DocumentError(
        `Cannot apply a payment to invoice ${invoice.number} — it is ${invoice.status.toLowerCase()}.`,
      );
    }
    const alreadyPaid = runningPaid.get(invoice.id)!;
    const remaining = invoice.total - alreadyPaid;
    if (alloc.amount > remaining) {
      throw new DocumentError(
        `Cannot apply more than the remaining balance for invoice ${invoice.number}.`,
      );
    }
    const newPaid = alreadyPaid + alloc.amount;
    runningPaid.set(invoice.id, newPaid);

    created.push(
      await tx.receiptAllocation.create({
        data: { orgId, receiptId, salesInvoiceId: invoice.id, amountApplied: alloc.amount },
      }),
    );
    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { amountPaid: newPaid, status: deriveInvoiceStatus(invoice.total, newPaid) },
    });
  }
  return created;
}

export async function reverseReceiptAllocations(
  tx: Prisma.TransactionClient,
  orgId: string,
  receiptId: string,
) {
  const existing = await tx.receiptAllocation.findMany({ where: { orgId, receiptId } });
  if (existing.length === 0) return;

  for (const alloc of existing) {
    const invoice = await tx.salesInvoice.findFirst({
      where: { orgId, id: alloc.salesInvoiceId },
    });
    if (!invoice) continue;
    const newPaid = invoice.amountPaid - alloc.amountApplied;
    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: newPaid < 0n ? 0n : newPaid,
        status: deriveInvoiceStatus(invoice.total, newPaid < 0n ? 0n : newPaid),
      },
    });
  }
  await tx.receiptAllocation.deleteMany({ where: { orgId, receiptId } });
}

export async function applyPaymentAllocations(
  tx: Prisma.TransactionClient,
  orgId: string,
  paymentId: string,
  allocations: AllocationInput[],
) {
  const valid = allocations.filter((a) => a.invoiceId && a.amount > 0n);
  if (valid.length === 0) return [];

  const invoices = await tx.purchaseInvoice.findMany({
    where: { orgId, id: { in: valid.map((a) => a.invoiceId) } },
  });
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  const runningPaid = new Map(invoices.map((inv) => [inv.id, inv.amountPaid]));

  const created = [];
  for (const alloc of valid) {
    const invoice = byId.get(alloc.invoiceId);
    if (!invoice) throw new DocumentError("Bill not found");
    if (invoice.status === "DRAFT" || invoice.status === "VOIDED") {
      throw new DocumentError(
        `Cannot apply a payment to bill ${invoice.number} — it is ${invoice.status.toLowerCase()}.`,
      );
    }
    const alreadyPaid = runningPaid.get(invoice.id)!;
    const remaining = invoice.total - alreadyPaid;
    if (alloc.amount > remaining) {
      throw new DocumentError(
        `Cannot apply more than the remaining balance for bill ${invoice.number}.`,
      );
    }
    const newPaid = alreadyPaid + alloc.amount;
    runningPaid.set(invoice.id, newPaid);

    created.push(
      await tx.paymentAllocation.create({
        data: { orgId, paymentId, purchaseInvoiceId: invoice.id, amountApplied: alloc.amount },
      }),
    );
    await tx.purchaseInvoice.update({
      where: { id: invoice.id },
      data: { amountPaid: newPaid, status: deriveInvoiceStatus(invoice.total, newPaid) },
    });
  }
  return created;
}

export async function reversePaymentAllocations(
  tx: Prisma.TransactionClient,
  orgId: string,
  paymentId: string,
) {
  const existing = await tx.paymentAllocation.findMany({ where: { orgId, paymentId } });
  if (existing.length === 0) return;

  for (const alloc of existing) {
    const invoice = await tx.purchaseInvoice.findFirst({
      where: { orgId, id: alloc.purchaseInvoiceId },
    });
    if (!invoice) continue;
    const newPaid = invoice.amountPaid - alloc.amountApplied;
    await tx.purchaseInvoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: newPaid < 0n ? 0n : newPaid,
        status: deriveInvoiceStatus(invoice.total, newPaid < 0n ? 0n : newPaid),
      },
    });
  }
  await tx.paymentAllocation.deleteMany({ where: { orgId, paymentId } });
}

// ---------------------------------------------------------------------------
// Draft / Post — a Draft invoice is saved but never posts to the ledger or
// moves stock until explicitly finalized via postSalesInvoiceDraft/
// postPurchaseInvoiceDraft. Invoice numbering is still assigned at creation
// regardless of Draft/Posted (no deferred numbering).
// ---------------------------------------------------------------------------

function computeLineTotal(quantity: string, unitPrice: bigint): bigint {
  const qty = new Prisma.Decimal(quantity || "0");
  return BigInt(qty.times(unitPrice.toString()).toFixed(0));
}

function withLineTax<T extends { quantity: string; unitPrice: bigint; taxRate?: number | null }>(
  line: T,
): T & { lineTotal: bigint; tax: bigint } {
  const lineTotal = computeLineTotal(line.quantity, line.unitPrice);
  return { ...line, lineTotal, tax: computeTax(lineTotal, line.taxRate) };
}

export async function createSalesInvoiceDraft(
  orgId: string,
  input: {
    partyId: string;
    date: Date;
    dueDate?: Date | null;
    reference?: string | null;
    notes?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  const rawLines = input.lines.filter((l) => l.description.trim() && l.accountId);
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Invoice total must be positive");

  return prisma.$transaction(async (tx) => {
    const number = await nextDocNumber(tx, orgId, "INV");
    return tx.salesInvoice.create({
      data: {
        orgId,
        number,
        partyId: input.partyId,
        date: input.date,
        dueDate: input.dueDate ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        total,
        status: "DRAFT",
        journalEntryId: null,
        lines: {
          create: lines.map((l) => ({
            description: l.description.trim(),
            quantity: new Prisma.Decimal(l.quantity || "0"),
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            accountId: l.accountId,
            itemId: l.itemId ?? null,
            cost: 0n,
            taxRate: l.taxRate != null ? new Prisma.Decimal(l.taxRate) : null,
            taxAmount: l.tax,
          })),
        },
      },
    });
  });
}

export async function createPurchaseInvoiceDraft(
  orgId: string,
  input: {
    partyId: string;
    date: Date;
    dueDate?: Date | null;
    supplierRef?: string | null;
    notes?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  const rawLines = input.lines.filter((l) => l.description.trim() && l.accountId);
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Bill total must be positive");

  return prisma.$transaction(async (tx) => {
    const number = await nextDocNumber(tx, orgId, "BILL");
    return tx.purchaseInvoice.create({
      data: {
        orgId,
        number,
        partyId: input.partyId,
        date: input.date,
        dueDate: input.dueDate ?? null,
        supplierRef: input.supplierRef ?? null,
        notes: input.notes ?? null,
        total,
        status: "DRAFT",
        journalEntryId: null,
        lines: {
          create: lines.map((l) => ({
            description: l.description.trim(),
            quantity: new Prisma.Decimal(l.quantity || "0"),
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            accountId: l.accountId,
            taxRate: l.taxRate != null ? new Prisma.Decimal(l.taxRate) : null,
            taxAmount: l.tax,
          })),
        },
      },
    });
  });
}

// Finalizes a Draft: posts the ledger entry and moves stock/COGS exactly as
// createSalesInvoice does for an immediately-posted invoice, then flips
// status DRAFT -> UNPAID.
export async function postSalesInvoiceDraft(orgId: string, invoiceId: string) {
  const existing = await prisma.salesInvoice.findFirst({
    where: { orgId, id: invoiceId },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Invoice not found");
  if (existing.status !== "DRAFT") {
    throw new DocumentError("Only draft invoices can be posted");
  }

  return prisma.$transaction(async (tx) => {
    const ar = await receivableAccount(orgId);
    const { lineCosts, cogsTotal } = await applySalesInvoiceStock(
      tx,
      orgId,
      existing.lines.map((l) => ({ quantity: l.quantity.toString(), itemId: l.itemId })),
    );

    const taxTotal = existing.lines.reduce((s, l) => s + l.taxAmount, 0n);
    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
    }[] = [
      { accountId: ar.id, debit: existing.total, partyId: existing.partyId },
      ...existing.lines.map((l) => ({ accountId: l.accountId, credit: l.lineTotal })),
    ];
    if (taxTotal > 0n) {
      const tax = await ensureTaxPayableAccount(tx, orgId);
      entryLines.push({ accountId: tax.id, credit: taxTotal });
    }
    if (cogsTotal > 0n) {
      const cogs = await cogsAccount(orgId);
      const inv = await inventoryAccount(orgId);
      entryLines.push({ accountId: cogs.id, debit: cogsTotal });
      entryLines.push({ accountId: inv.id, credit: cogsTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: existing.date,
      description: existing.notes ?? null,
      reference: existing.reference ?? null,
      sourceType: "sales_invoice",
      sourceId: existing.id,
      lines: entryLines,
    });

    for (let i = 0; i < existing.lines.length; i++) {
      await tx.salesInvoiceLine.update({
        where: { id: existing.lines[i]!.id },
        data: { cost: lineCosts[i] },
      });
    }

    return tx.salesInvoice.update({
      where: { id: invoiceId },
      data: { status: "UNPAID", journalEntryId: entry.id },
    });
  });
}

export async function postPurchaseInvoiceDraft(orgId: string, invoiceId: string) {
  const existing = await prisma.purchaseInvoice.findFirst({
    where: { orgId, id: invoiceId },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Bill not found");
  if (existing.status !== "DRAFT") {
    throw new DocumentError("Only draft bills can be posted");
  }

  return prisma.$transaction(async (tx) => {
    const ap = await payableAccount(orgId);
    const taxTotal = existing.lines.reduce((s, l) => s + l.taxAmount, 0n);

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
    }[] = [
      ...existing.lines.map((l) => ({ accountId: l.accountId, debit: l.lineTotal })),
      { accountId: ap.id, credit: existing.total, partyId: existing.partyId },
    ];
    if (taxTotal > 0n) {
      const tax = await ensureTaxRecoverableAccount(tx, orgId);
      entryLines.push({ accountId: tax.id, debit: taxTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: existing.date,
      description: existing.notes ?? null,
      reference: existing.supplierRef ?? null,
      sourceType: "purchase_invoice",
      sourceId: existing.id,
      lines: entryLines,
    });

    return tx.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { status: "UNPAID", journalEntryId: entry.id },
    });
  });
}

// ---------------------------------------------------------------------------
// Void — reverses a posted invoice's ledger/stock effects while keeping the
// record for audit trail (never deleted). Only allowed once amountPaid is
// back to 0 (payments must be unapplied first). Voiding a never-posted Draft
// is a no-op reversal (nothing was posted).
// ---------------------------------------------------------------------------

export async function voidSalesInvoice(orgId: string, invoiceId: string) {
  const existing = await prisma.salesInvoice.findFirst({
    where: { orgId, id: invoiceId },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Invoice not found");
  if (existing.status === "VOIDED") throw new DocumentError("This invoice is already voided");
  if (existing.status !== "DRAFT" && existing.amountPaid > 0n) {
    throw new DocumentError(
      "Unapply payments against this invoice before voiding it.",
    );
  }

  return prisma.$transaction(async (tx) => {
    if (existing.status !== "DRAFT") {
      await reverseSalesInvoiceStock(tx, existing.lines);
      if (existing.journalEntryId) {
        await removeEntryWithin(tx, existing.journalEntryId);
      }
    }
    return tx.salesInvoice.update({
      where: { id: invoiceId },
      data: { status: "VOIDED", journalEntryId: null },
    });
  });
}

export async function voidPurchaseInvoice(orgId: string, invoiceId: string) {
  const existing = await prisma.purchaseInvoice.findFirst({
    where: { orgId, id: invoiceId },
  });
  if (!existing) throw new DocumentError("Bill not found");
  if (existing.status === "VOIDED") throw new DocumentError("This bill is already voided");
  if (existing.status !== "DRAFT" && existing.amountPaid > 0n) {
    throw new DocumentError("Unapply payments against this bill before voiding it.");
  }

  return prisma.$transaction(async (tx) => {
    if (existing.status !== "DRAFT" && existing.journalEntryId) {
      await removeEntryWithin(tx, existing.journalEntryId);
    }
    return tx.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { status: "VOIDED", journalEntryId: null },
    });
  });
}
