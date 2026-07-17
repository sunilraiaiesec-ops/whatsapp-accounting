import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { postEntryWithin, removeEntryWithin } from "@/lib/ledger";
import {
  receivableAccount,
  payableAccount,
  inventoryAccount,
  cogsAccount,
  ensureTaxRecoverableAccount,
  ensureTaxPayableAccount,
} from "@/lib/accounts";
import {
  DocumentError,
  assertCashDocLines,
  computeTax,
  normalizeCurrency,
  type CashItemLineInput,
} from "@/lib/documents";
import {
  applyReceiptAllocations,
  reverseReceiptAllocations,
  applyPaymentAllocations,
  reversePaymentAllocations,
  type AllocationInput,
} from "@/lib/invoice-lifecycle";

type LineInput = {
  accountId: string;
  amount: bigint;
  memo?: string | null;
  className?: string | null;
  taxRate?: number | null;
};

type InvoiceLineInput = {
  description: string;
  quantity: string;
  unitPrice: bigint;
  accountId: string;
  itemId?: string | null;
  taxRate?: number | null;
};

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

async function controlIdsFor(
  tx: Prisma.TransactionClient,
  orgId: string,
  accountIds: string[],
) {
  const accounts = await tx.account.findMany({
    where: { orgId, id: { in: accountIds } },
    select: { id: true, isControl: true },
  });
  return new Set(accounts.filter((a) => a.isControl).map((a) => a.id));
}

// Exported for reuse by lib/invoice-lifecycle.ts's postSalesInvoiceDraft and
// voidSalesInvoice, which need this exact stock-movement logic.
export async function reverseSalesInvoiceStock(
  tx: Prisma.TransactionClient,
  oldLines: { itemId: string | null; quantity: Prisma.Decimal; cost: bigint }[],
) {
  for (const l of oldLines) {
    if (!l.itemId || l.cost <= 0n) continue;
    const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
    await tx.inventoryItem.update({
      where: { id: l.itemId },
      data: {
        qtyOnHand: new Prisma.Decimal(item.qtyOnHand).plus(l.quantity),
        valueOnHand: item.valueOnHand + l.cost,
      },
    });
  }
}

export async function applySalesInvoiceStock(
  tx: Prisma.TransactionClient,
  orgId: string,
  lines: { quantity: string; itemId?: string | null }[],
) {
  const itemState = new Map<string, { qty: Prisma.Decimal; value: bigint }>();
  const lineCosts: bigint[] = [];
  let cogsTotal = 0n;

  for (const l of lines) {
    if (!l.itemId) {
      lineCosts.push(0n);
      continue;
    }
    let state = itemState.get(l.itemId);
    if (!state) {
      const item = await tx.inventoryItem.findFirstOrThrow({
        where: { id: l.itemId, orgId },
      });
      state = { qty: new Prisma.Decimal(item.qtyOnHand), value: item.valueOnHand };
      itemState.set(l.itemId, state);
    }
    const qty = new Prisma.Decimal(l.quantity || "0");
    if (qty.gt(state.qty)) {
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
      throw new DocumentError(
        `Not enough stock of ${item.name}: have ${state.qty.toString()}, selling ${qty.toString()}`,
      );
    }
    const cost = state.qty.gt(0)
      ? BigInt(
          new Prisma.Decimal(state.value.toString()).times(qty).div(state.qty).toFixed(0),
        )
      : 0n;
    state.qty = state.qty.minus(qty);
    state.value -= cost;
    lineCosts.push(cost);
    cogsTotal += cost;
  }

  for (const [itemId, state] of itemState) {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { qtyOnHand: state.qty, valueOnHand: state.value },
    });
  }

  return { lineCosts, cogsTotal };
}

// --- Receipt -----------------------------------------------------------------
export async function updateReceipt(
  orgId: string,
  id: string,
  input: {
    date: Date;
    bankAccountId: string;
    partyId?: string | null;
    reference?: string | null;
    description?: string | null;
    paymentMethod?: string | null;
    tags?: string[];
    currency?: string | null;
    exchangeRate?: number | string | null;
    lines: LineInput[];
    allocations?: AllocationInput[];
  },
) {
  const existing = await prisma.receipt.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Receipt not found");

  const lines = input.lines
    .filter((l) => l.accountId && l.amount > 0n)
    .map((l) => ({ ...l, tax: computeTax(l.amount, l.taxRate) }));
  if (lines.length === 0) throw new DocumentError("Add at least one line");
  const subtotal = lines.reduce((s, l) => s + l.amount, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  const fx = normalizeCurrency(input.currency, input.exchangeRate);

  return prisma.$transaction(async (tx) => {
    // Reverse the receipt's existing allocations first, so the invoice
    // balances the new allocation set validates against reflect the
    // pre-edit state (not double-counted against this same receipt).
    await reverseReceiptAllocations(tx, orgId, id);

    await assertCashDocLines(tx, orgId, input.bankAccountId, lines, "receipt");

    const controlIds = await controlIdsFor(
      tx,
      orgId,
      lines.map((l) => l.accountId),
    );

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
      memo?: string | null;
    }[] = [
      { accountId: input.bankAccountId, debit: total },
      ...lines.map((l) => ({
        accountId: l.accountId,
        credit: l.amount,
        partyId: controlIds.has(l.accountId) ? input.partyId ?? null : null,
        memo: l.memo ?? null,
      })),
    ];
    if (taxTotal > 0n) {
      const tax = await ensureTaxPayableAccount(tx, orgId);
      entryLines.push({ accountId: tax.id, credit: taxTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.description ?? null,
      reference: input.reference ?? null,
      sourceType: "receipt",
      sourceId: id,
      lines: entryLines,
    });

    await tx.receiptLine.deleteMany({ where: { receiptId: id } });
    const receipt = await tx.receipt.update({
      where: { id },
      data: {
        date: input.date,
        bankAccountId: input.bankAccountId,
        partyId: input.partyId ?? null,
        reference: input.reference ?? null,
        description: input.description ?? null,
        paymentMethod: input.paymentMethod ?? null,
        tags: input.tags ?? [],
        currency: fx.currency,
        exchangeRate: fx.exchangeRate,
        total,
        journalEntryId: entry.id,
        lines: {
          create: lines.map((l) => ({
            accountId: l.accountId,
            amount: l.amount,
            memo: l.memo ?? null,
            className: l.className ?? null,
            taxRate: l.taxRate != null ? new Prisma.Decimal(l.taxRate) : null,
            taxAmount: l.tax,
          })),
        },
      },
    });

    await removeEntryWithin(tx, existing.journalEntryId);

    if (input.allocations?.length) {
      await applyReceiptAllocations(tx, orgId, id, input.allocations);
    }
    return receipt;
  });
}

// --- Payment -----------------------------------------------------------------
export async function updatePayment(
  orgId: string,
  id: string,
  input: {
    date: Date;
    bankAccountId: string;
    partyId?: string | null;
    reference?: string | null;
    description?: string | null;
    paymentMethod?: string | null;
    tags?: string[];
    currency?: string | null;
    exchangeRate?: number | string | null;
    lines: LineInput[];
    itemLines?: CashItemLineInput[];
    allocations?: AllocationInput[];
  },
) {
  const existing = await prisma.payment.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Payment not found");

  const lines = input.lines
    .filter((l) => l.accountId && l.amount > 0n)
    .map((l) => ({ ...l, tax: computeTax(l.amount, l.taxRate) }));

  const itemLines = (input.itemLines ?? [])
    .filter((l) => l.itemId && new Prisma.Decimal(l.quantity || "0").gt(0))
    .map((l) => {
      const qty = new Prisma.Decimal(l.quantity);
      const net = BigInt(qty.times(l.unitCost.toString()).toFixed(0));
      return { ...l, qty, net, tax: computeTax(net, l.taxRate) };
    })
    .filter((l) => l.net > 0n);

  if (lines.length === 0 && itemLines.length === 0) {
    throw new DocumentError("Add at least one line");
  }

  const subtotal =
    lines.reduce((s, l) => s + l.amount, 0n) +
    itemLines.reduce((s, l) => s + l.net, 0n);
  const taxTotal =
    lines.reduce((s, l) => s + l.tax, 0n) +
    itemLines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  const fx = normalizeCurrency(input.currency, input.exchangeRate);

  return prisma.$transaction(async (tx) => {
    // Reverse the payment's existing allocations first, so the invoice
    // balances the new allocation set validates against reflect the
    // pre-edit state (not double-counted against this same payment).
    await reversePaymentAllocations(tx, orgId, id);

    // Roll back the stock the original item lines added before re-applying.
    for (const l of existing.lines) {
      if (!l.itemId) continue;
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
      const newQty = new Prisma.Decimal(item.qtyOnHand).minus(l.quantity ?? 0);
      if (newQty.lt(0)) {
        throw new DocumentError(`Edit would leave negative stock for ${item.name}`);
      }
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: { qtyOnHand: newQty, valueOnHand: item.valueOnHand - l.amount },
      });
    }

    if (lines.length > 0) {
      await assertCashDocLines(tx, orgId, input.bankAccountId, lines, "payment");
    }

    const controlIds = await controlIdsFor(
      tx,
      orgId,
      lines.map((l) => l.accountId),
    );

    const inv = itemLines.length > 0 ? await inventoryAccount(orgId) : null;

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
      memo?: string | null;
    }[] = [
      { accountId: input.bankAccountId, credit: total },
      ...lines.map((l) => ({
        accountId: l.accountId,
        debit: l.amount,
        partyId: controlIds.has(l.accountId) ? input.partyId ?? null : null,
        memo: l.memo ?? null,
      })),
    ];
    if (inv) {
      for (const l of itemLines) {
        entryLines.push({ accountId: inv.id, debit: l.net, memo: l.memo ?? null });
      }
    }
    if (taxTotal > 0n) {
      const tax = await ensureTaxRecoverableAccount(tx, orgId);
      entryLines.push({ accountId: tax.id, debit: taxTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.description ?? null,
      reference: input.reference ?? null,
      sourceType: "payment",
      sourceId: id,
      lines: entryLines,
    });

    await tx.paymentLine.deleteMany({ where: { paymentId: id } });
    const payment = await tx.payment.update({
      where: { id },
      data: {
        date: input.date,
        bankAccountId: input.bankAccountId,
        partyId: input.partyId ?? null,
        reference: input.reference ?? null,
        description: input.description ?? null,
        paymentMethod: input.paymentMethod ?? null,
        tags: input.tags ?? [],
        currency: fx.currency,
        exchangeRate: fx.exchangeRate,
        total,
        journalEntryId: entry.id,
        lines: {
          create: [
            ...lines.map((l) => ({
              accountId: l.accountId,
              amount: l.amount,
              memo: l.memo ?? null,
              className: l.className ?? null,
              taxRate: l.taxRate != null ? new Prisma.Decimal(l.taxRate) : null,
              taxAmount: l.tax,
            })),
            ...itemLines.map((l) => ({
              accountId: inv!.id,
              amount: l.net,
              memo: l.memo ?? null,
              className: l.className ?? null,
              taxRate: l.taxRate != null ? new Prisma.Decimal(l.taxRate) : null,
              taxAmount: l.tax,
              itemId: l.itemId,
              quantity: l.qty,
              unitCost: l.unitCost,
            })),
          ],
        },
      },
    });

    for (const l of itemLines) {
      const item = await tx.inventoryItem.findFirstOrThrow({
        where: { id: l.itemId, orgId },
      });
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: {
          qtyOnHand: new Prisma.Decimal(item.qtyOnHand).plus(l.qty),
          valueOnHand: item.valueOnHand + l.net,
        },
      });
    }

    await removeEntryWithin(tx, existing.journalEntryId);

    if (input.allocations?.length) {
      await applyPaymentAllocations(tx, orgId, id, input.allocations);
    }
    return payment;
  });
}

// --- Inter-account transfer --------------------------------------------------
export async function updateInterAccountTransfer(
  orgId: string,
  id: string,
  input: {
    date: Date;
    fromAccountId: string;
    toAccountId: string;
    amount: bigint;
    reference?: string | null;
    description?: string | null;
  },
) {
  const existing = await prisma.interAccountTransfer.findFirst({
    where: { orgId, id },
  });
  if (!existing) throw new DocumentError("Transfer not found");
  if (input.fromAccountId === input.toAccountId) {
    throw new DocumentError("From and to accounts must be different");
  }
  if (input.amount <= 0n) throw new DocumentError("Amount must be positive");

  return prisma.$transaction(async (tx) => {
    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.description ?? null,
      reference: input.reference ?? null,
      sourceType: "transfer",
      sourceId: id,
      lines: [
        { accountId: input.toAccountId, debit: input.amount },
        { accountId: input.fromAccountId, credit: input.amount },
      ],
    });

    const transfer = await tx.interAccountTransfer.update({
      where: { id },
      data: {
        date: input.date,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount,
        reference: input.reference ?? null,
        description: input.description ?? null,
        journalEntryId: entry.id,
      },
    });

    await removeEntryWithin(tx, existing.journalEntryId);
    return transfer;
  });
}

// --- Sales invoice -----------------------------------------------------------
export async function updateSalesInvoice(
  orgId: string,
  id: string,
  input: {
    partyId: string;
    date: Date;
    dueDate?: Date | null;
    reference?: string | null;
    notes?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  const existing = await prisma.salesInvoice.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Invoice not found");
  if (existing.status === "VOIDED") throw new DocumentError("Voided invoices cannot be edited");

  const rawLines = input.lines.filter((l) => l.description.trim() && l.accountId);
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Invoice total must be positive");

  // A Draft never posted to the ledger or touched stock, so editing one just
  // updates the record in place — no reversal/repost, stays a Draft.
  if (existing.status === "DRAFT") {
    return prisma.$transaction(async (tx) => {
      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: id } });
      return tx.salesInvoice.update({
        where: { id },
        data: {
          partyId: input.partyId,
          date: input.date,
          dueDate: input.dueDate ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          total,
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

  return prisma.$transaction(async (tx) => {
    await reverseSalesInvoiceStock(tx, existing.lines);

    const { lineCosts, cogsTotal } = await applySalesInvoiceStock(tx, orgId, lines);

    const ar = await receivableAccount(orgId);
    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
    }[] = [
      { accountId: ar.id, debit: total, partyId: input.partyId },
      ...lines.map((l) => ({ accountId: l.accountId, credit: l.lineTotal })),
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
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.reference ?? null,
      sourceType: "sales_invoice",
      sourceId: id,
      lines: entryLines,
    });

    await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: id } });
    const invoice = await tx.salesInvoice.update({
      where: { id },
      data: {
        partyId: input.partyId,
        date: input.date,
        dueDate: input.dueDate ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        total,
        journalEntryId: entry.id,
        lines: {
          create: lines.map((l, i) => ({
            description: l.description.trim(),
            quantity: new Prisma.Decimal(l.quantity || "0"),
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            accountId: l.accountId,
            itemId: l.itemId ?? null,
            cost: lineCosts[i],
            taxRate: l.taxRate != null ? new Prisma.Decimal(l.taxRate) : null,
            taxAmount: l.tax,
          })),
        },
      },
    });

    // DRAFT/VOIDED were already excluded above, so a posted invoice always
    // has a journalEntryId here — the guard is for type-safety only.
    if (existing.journalEntryId) await removeEntryWithin(tx, existing.journalEntryId);
    return invoice;
  });
}

// --- Purchase invoice --------------------------------------------------------
export async function updatePurchaseInvoice(
  orgId: string,
  id: string,
  input: {
    partyId: string;
    date: Date;
    dueDate?: Date | null;
    supplierRef?: string | null;
    notes?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  const existing = await prisma.purchaseInvoice.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Bill not found");
  if (existing.status === "VOIDED") throw new DocumentError("Voided bills cannot be edited");

  const rawLines = input.lines.filter((l) => l.description.trim() && l.accountId);
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Bill total must be positive");

  // A Draft never posted to the ledger, so editing one just updates the
  // record in place — no reversal/repost, stays a Draft. Purchase invoices
  // never move stock (only Goods Receipts do), so there's no stock branch
  // to worry about here unlike updateSalesInvoice.
  if (existing.status === "DRAFT") {
    return prisma.$transaction(async (tx) => {
      await tx.purchaseInvoiceLine.deleteMany({ where: { invoiceId: id } });
      return tx.purchaseInvoice.update({
        where: { id },
        data: {
          partyId: input.partyId,
          date: input.date,
          dueDate: input.dueDate ?? null,
          supplierRef: input.supplierRef ?? null,
          notes: input.notes ?? null,
          total,
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

  return prisma.$transaction(async (tx) => {
    const ap = await payableAccount(orgId);

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
    }[] = [
      ...lines.map((l) => ({ accountId: l.accountId, debit: l.lineTotal })),
      { accountId: ap.id, credit: total, partyId: input.partyId },
    ];
    if (taxTotal > 0n) {
      const tax = await ensureTaxRecoverableAccount(tx, orgId);
      entryLines.push({ accountId: tax.id, debit: taxTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.supplierRef ?? null,
      sourceType: "purchase_invoice",
      sourceId: id,
      lines: entryLines,
    });

    await tx.purchaseInvoiceLine.deleteMany({ where: { invoiceId: id } });
    const invoice = await tx.purchaseInvoice.update({
      where: { id },
      data: {
        partyId: input.partyId,
        date: input.date,
        dueDate: input.dueDate ?? null,
        supplierRef: input.supplierRef ?? null,
        notes: input.notes ?? null,
        total,
        journalEntryId: entry.id,
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

    // DRAFT/VOIDED were already excluded above, so a posted bill always has
    // a journalEntryId here — the guard is for type-safety only.
    if (existing.journalEntryId) await removeEntryWithin(tx, existing.journalEntryId);
    return invoice;
  });
}

// --- Credit note -------------------------------------------------------------
export async function updateCreditNote(
  orgId: string,
  id: string,
  input: {
    partyId: string;
    date: Date;
    reference?: string | null;
    notes?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  const existing = await prisma.creditNote.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Credit note not found");

  // Editing does not reverse/re-apply inventory restock, so refuse to touch a
  // credit note that moves stock. Delete and recreate it instead.
  if (existing.lines.some((l) => l.itemId) || input.lines.some((l) => l.itemId)) {
    throw new DocumentError(
      "This credit note returns inventory items and can't be edited. Delete it and create a new one.",
    );
  }

  const rawLines = input.lines.filter((l) => l.description.trim() && l.accountId);
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Credit note total must be positive");

  return prisma.$transaction(async (tx) => {
    const ar = await receivableAccount(orgId);

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
    }[] = [
      ...lines.map((l) => ({ accountId: l.accountId, debit: l.lineTotal })),
      { accountId: ar.id, credit: total, partyId: input.partyId },
    ];
    if (taxTotal > 0n) {
      const tax = await ensureTaxPayableAccount(tx, orgId);
      entryLines.push({ accountId: tax.id, debit: taxTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.reference ?? null,
      sourceType: "credit_note",
      sourceId: id,
      lines: entryLines,
    });

    await tx.creditNoteLine.deleteMany({ where: { noteId: id } });
    const note = await tx.creditNote.update({
      where: { id },
      data: {
        partyId: input.partyId,
        date: input.date,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        total,
        journalEntryId: entry.id,
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

    await removeEntryWithin(tx, existing.journalEntryId);
    return note;
  });
}

// --- Debit note --------------------------------------------------------------
export async function updateDebitNote(
  orgId: string,
  id: string,
  input: {
    partyId: string;
    date: Date;
    supplierRef?: string | null;
    notes?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  const existing = await prisma.debitNote.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Debit note not found");

  const rawLines = input.lines.filter((l) => l.description.trim() && l.accountId);
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Debit note total must be positive");

  return prisma.$transaction(async (tx) => {
    const ap = await payableAccount(orgId);

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
    }[] = [
      { accountId: ap.id, debit: total, partyId: input.partyId },
      ...lines.map((l) => ({ accountId: l.accountId, credit: l.lineTotal })),
    ];
    if (taxTotal > 0n) {
      const tax = await ensureTaxRecoverableAccount(tx, orgId);
      entryLines.push({ accountId: tax.id, credit: taxTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.supplierRef ?? null,
      sourceType: "debit_note",
      sourceId: id,
      lines: entryLines,
    });

    await tx.debitNoteLine.deleteMany({ where: { noteId: id } });
    const note = await tx.debitNote.update({
      where: { id },
      data: {
        partyId: input.partyId,
        date: input.date,
        supplierRef: input.supplierRef ?? null,
        notes: input.notes ?? null,
        total,
        journalEntryId: entry.id,
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

    await removeEntryWithin(tx, existing.journalEntryId);
    return note;
  });
}
