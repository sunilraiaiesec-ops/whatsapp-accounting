import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { postEntryWithin, LedgerError } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/numbering";
import {
  receivableAccount,
  payableAccount,
  inventoryAccount,
  cogsAccount,
  ensureTaxRecoverableAccount,
  ensureTaxPayableAccount,
} from "@/lib/accounts";

export class DocumentError extends Error {}

// A category line: a plain expense/income account and a net amount (base
// currency minor units). Optional per-line sales tax rate (percent).
type LineInput = {
  accountId: string;
  amount: bigint;
  memo?: string | null;
  className?: string | null;
  taxRate?: number | null;
};

// An inventory item line on a payment — buys stock at a unit cost. Posts to
// the Inventory control account and increases the item's quantity/value.
export type CashItemLineInput = {
  itemId: string;
  quantity: string; // decimal string
  unitCost: bigint; // base currency minor units
  memo?: string | null;
  className?: string | null;
  taxRate?: number | null;
};

// Tax on a net amount at a percentage rate, rounded to whole minor units.
export function computeTax(net: bigint, rate?: number | null): bigint {
  if (!rate || rate <= 0 || net <= 0n) return 0n;
  return BigInt(
    new Prisma.Decimal(net.toString()).times(rate).div(100).toFixed(0),
  );
}

export function normalizeCurrency(
  currency?: string | null,
  exchangeRate?: number | string | null,
): { currency: string | null; exchangeRate: Prisma.Decimal | null } {
  const code = (currency ?? "").trim().toUpperCase();
  if (!code) return { currency: null, exchangeRate: null };
  const rate = exchangeRate != null ? new Prisma.Decimal(exchangeRate) : null;
  return {
    currency: code,
    exchangeRate: rate && rate.gt(0) ? rate : null,
  };
}

export async function assertCashDocLines(
  tx: Prisma.TransactionClient,
  orgId: string,
  bankAccountId: string,
  lines: LineInput[],
  kind: "receipt" | "payment",
) {
  if (lines.some((l) => l.accountId === bankAccountId)) {
    throw new DocumentError(
      kind === "receipt"
        ? "The receiving account cannot be the same as a line account. Choose income or accounts receivable for the credit line."
        : "The paying account cannot be the same as a line account. Choose an expense or accounts payable for the debit line.",
    );
  }

  const bankCash = await tx.account.findMany({
    where: {
      orgId,
      id: { in: lines.map((l) => l.accountId) },
      subtype: { in: ["bank", "cash"] },
    },
    select: { name: true },
  });
  if (bankCash.length > 0) {
    throw new DocumentError(
      `Line accounts must be income, receivable, expense, or payable — not "${bankCash[0].name}".`,
    );
  }
}

// ---------------------------------------------------------------------------
// Receipt — money received into a bank/cash account.
// Dr bankAccount (total) ; Cr each line account.
// ---------------------------------------------------------------------------
export async function createReceipt(
  orgId: string,
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
  },
) {
  const lines = input.lines
    .filter((l) => l.accountId && l.amount > 0n)
    .map((l) => ({ ...l, tax: computeTax(l.amount, l.taxRate) }));
  if (lines.length === 0) throw new DocumentError("Add at least one line");
  const subtotal = lines.reduce((s, l) => s + l.amount, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  const fx = normalizeCurrency(input.currency, input.exchangeRate);

  return prisma.$transaction(async (tx) => {
    await assertCashDocLines(tx, orgId, input.bankAccountId, lines, "receipt");

    const accounts = await tx.account.findMany({
      where: { orgId, id: { in: lines.map((l) => l.accountId) } },
      select: { id: true, isControl: true },
    });
    const controlIds = new Set(accounts.filter((a) => a.isControl).map((a) => a.id));

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
      lines: entryLines,
    });

    const number = await nextDocNumber(tx, orgId, "REC");
    const receipt = await tx.receipt.create({
      data: {
        orgId,
        number,
        date: input.date,
        reference: input.reference ?? null,
        description: input.description ?? null,
        paymentMethod: input.paymentMethod ?? null,
        tags: input.tags ?? [],
        currency: fx.currency,
        exchangeRate: fx.exchangeRate,
        bankAccountId: input.bankAccountId,
        partyId: input.partyId ?? null,
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

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: receipt.id },
    });
    return receipt;
  });
}

// ---------------------------------------------------------------------------
// Payment — money paid out of a bank/cash account.
// Cr bankAccount (total) ; Dr each line account.
// ---------------------------------------------------------------------------
export async function createPayment(
  orgId: string,
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
  },
) {
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
    if (lines.length > 0) {
      await assertCashDocLines(tx, orgId, input.bankAccountId, lines, "payment");
    }

    const accounts = await tx.account.findMany({
      where: { orgId, id: { in: lines.map((l) => l.accountId) } },
      select: { id: true, isControl: true },
    });
    const controlIds = new Set(accounts.filter((a) => a.isControl).map((a) => a.id));

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
      lines: entryLines,
    });

    const number = await nextDocNumber(tx, orgId, "PAY");
    const payment = await tx.payment.create({
      data: {
        orgId,
        number,
        date: input.date,
        reference: input.reference ?? null,
        description: input.description ?? null,
        paymentMethod: input.paymentMethod ?? null,
        tags: input.tags ?? [],
        currency: fx.currency,
        exchangeRate: fx.exchangeRate,
        bankAccountId: input.bankAccountId,
        partyId: input.partyId ?? null,
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

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: payment.id },
    });
    return payment;
  });
}

// ---------------------------------------------------------------------------
// Sales invoice — credit sale to a customer.
// Dr Accounts receivable (total, party) ; Cr each income line.
// ---------------------------------------------------------------------------
type InvoiceLineInput = {
  description: string;
  quantity: string; // decimal string
  unitPrice: bigint; // minor units
  accountId: string;
  itemId?: string | null; // inventory item — triggers COGS posting
  taxRate?: number | null; // exclusive percentage, e.g. 15 for 15%
};

// Attach net line total + tax (exclusive, on top of net) to each raw line.
function withLineTax<T extends { quantity: string; unitPrice: bigint; taxRate?: number | null }>(
  line: T,
): T & { lineTotal: bigint; tax: bigint } {
  const lineTotal = computeLineTotal(line.quantity, line.unitPrice);
  return { ...line, lineTotal, tax: computeTax(lineTotal, line.taxRate) };
}

function computeLineTotal(quantity: string, unitPrice: bigint): bigint {
  const qty = new Prisma.Decimal(quantity || "0");
  const total = qty.times(unitPrice.toString());
  return BigInt(total.toFixed(0));
}

// Cost basis for goods coming back into stock on a return. Normally the item's
// current weighted-average cost; if nothing is on hand (average undefined) we
// fall back to the most recent purchase cost so the returned units re-enter at
// a sensible value rather than zero.
async function lastKnownUnitCost(
  tx: Prisma.TransactionClient,
  orgId: string,
  itemId: string,
): Promise<Prisma.Decimal> {
  const gr = await tx.goodsReceiptLine.findFirst({
    where: { itemId, receipt: { orgId } },
    orderBy: { receipt: { date: "desc" } },
    select: { unitCost: true },
  });
  if (gr) return new Prisma.Decimal(gr.unitCost.toString());
  const pl = await tx.paymentLine.findFirst({
    where: { itemId, unitCost: { not: null }, payment: { orgId } },
    orderBy: { payment: { date: "desc" } },
    select: { unitCost: true },
  });
  if (pl?.unitCost != null) return new Prisma.Decimal(pl.unitCost.toString());
  return new Prisma.Decimal(0);
}

// For a sales return (credit note / refund receipt), put any inventory-item
// lines back into stock at weighted-average cost and report the per-line cost
// so the caller can post the matching Dr Inventory / Cr COGS reversal. Updates
// the item subledger in place. Returns aligned per-line costs (0 for non-item
// lines) and their total.
async function restockReturnedItems(
  tx: Prisma.TransactionClient,
  orgId: string,
  lines: { itemId?: string | null; quantity: string }[],
): Promise<{ lineCosts: bigint[]; restockTotal: bigint }> {
  const itemState = new Map<string, { qty: Prisma.Decimal; value: bigint }>();
  const lineCosts: bigint[] = [];
  let restockTotal = 0n;

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
    const unitCost = state.qty.gt(0)
      ? new Prisma.Decimal(state.value.toString()).div(state.qty)
      : await lastKnownUnitCost(tx, orgId, l.itemId);
    const cost = BigInt(unitCost.times(qty).toFixed(0));
    state.qty = state.qty.plus(qty);
    state.value += cost;
    lineCosts.push(cost);
    restockTotal += cost;
  }

  for (const [itemId, state] of itemState) {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { qtyOnHand: state.qty, valueOnHand: state.value },
    });
  }

  return { lineCosts, restockTotal };
}

export async function createSalesInvoice(
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
  const rawLines = input.lines.filter(
    (l) => l.description.trim() && l.accountId,
  );
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Invoice total must be positive");

  return prisma.$transaction(async (tx) => {
    const ar = await receivableAccount(orgId);

    // For inventory-item lines, compute COGS at weighted-average cost and
    // decrement stock. Removing value proportionally keeps the inventory
    // subledger exactly in step with the Inventory control account.
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
            new Prisma.Decimal(state.value.toString())
              .times(qty)
              .div(state.qty)
              .toFixed(0),
          )
        : 0n;
      state.qty = state.qty.minus(qty);
      state.value -= cost;
      lineCosts.push(cost);
      cogsTotal += cost;
    }

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
      memo?: string | null;
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
      lines: entryLines,
    });

    const number = await nextDocNumber(tx, orgId, "INV");
    const invoice = await tx.salesInvoice.create({
      data: {
        orgId,
        number,
        partyId: input.partyId,
        date: input.date,
        dueDate: input.dueDate ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        total,
        status: "unpaid",
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

    for (const [itemId, state] of itemState) {
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { qtyOnHand: state.qty, valueOnHand: state.value },
      });
    }

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: invoice.id },
    });
    return invoice;
  });
}

// ---------------------------------------------------------------------------
// Sales receipt — cash sale, paid immediately into a bank/cash account.
// Dr bank/cash (total) ; Cr each income line ; Dr COGS / Cr Inventory on items.
// ---------------------------------------------------------------------------
export async function createSalesReceipt(
  orgId: string,
  input: {
    bankAccountId: string;
    partyId?: string | null;
    date: Date;
    reference?: string | null;
    notes?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  if (!input.bankAccountId) throw new DocumentError("Choose a deposit account");
  const rawLines = input.lines.filter((l) => l.description.trim() && l.accountId);
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Sales receipt total must be positive");

  return prisma.$transaction(async (tx) => {
    // COGS at weighted-average cost for inventory items, decrementing stock.
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
            new Prisma.Decimal(state.value.toString())
              .times(qty)
              .div(state.qty)
              .toFixed(0),
          )
        : 0n;
      state.qty = state.qty.minus(qty);
      state.value -= cost;
      lineCosts.push(cost);
      cogsTotal += cost;
    }

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
      partyId?: string | null;
      memo?: string | null;
    }[] = [
      { accountId: input.bankAccountId, debit: total },
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
      sourceType: "sales_receipt",
      lines: entryLines,
    });

    const number = await nextDocNumber(tx, orgId, "SR");
    const receipt = await tx.salesReceipt.create({
      data: {
        orgId,
        number,
        partyId: input.partyId ?? null,
        bankAccountId: input.bankAccountId,
        date: input.date,
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

    for (const [itemId, state] of itemState) {
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { qtyOnHand: state.qty, valueOnHand: state.value },
      });
    }

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: receipt.id },
    });
    return receipt;
  });
}

// ---------------------------------------------------------------------------
// Refund receipt — money refunded to a customer, paid out of a bank/cash
// account. Dr each income/returns line ; Cr bank/cash (total).
// ---------------------------------------------------------------------------
export async function createRefundReceipt(
  orgId: string,
  input: {
    bankAccountId: string;
    partyId?: string | null;
    date: Date;
    reference?: string | null;
    notes?: string | null;
    lines: InvoiceLineInput[];
  },
) {
  if (!input.bankAccountId) throw new DocumentError("Choose a refund account");
  const rawLines = input.lines.filter((l) => l.description.trim() && l.accountId);
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Refund total must be positive");

  return prisma.$transaction(async (tx) => {
    // Returned goods go back into stock; reverse their cost of goods sold.
    const { lineCosts, restockTotal } = await restockReturnedItems(tx, orgId, lines);

    const entryLines: {
      accountId: string;
      debit?: bigint;
      credit?: bigint;
    }[] = [
      ...lines.map((l) => ({ accountId: l.accountId, debit: l.lineTotal })),
      { accountId: input.bankAccountId, credit: total },
    ];
    if (taxTotal > 0n) {
      const tax = await ensureTaxPayableAccount(tx, orgId);
      entryLines.push({ accountId: tax.id, debit: taxTotal });
    }
    if (restockTotal > 0n) {
      const cogs = await cogsAccount(orgId);
      const inv = await inventoryAccount(orgId);
      entryLines.push({ accountId: inv.id, debit: restockTotal });
      entryLines.push({ accountId: cogs.id, credit: restockTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.reference ?? null,
      sourceType: "refund_receipt",
      lines: entryLines,
    });

    const number = await nextDocNumber(tx, orgId, "RR");
    const refund = await tx.refundReceipt.create({
      data: {
        orgId,
        number,
        partyId: input.partyId ?? null,
        bankAccountId: input.bankAccountId,
        date: input.date,
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

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: refund.id },
    });
    return refund;
  });
}

// ---------------------------------------------------------------------------
// Purchase invoice — credit purchase (bill) from a supplier.
// Dr each expense/asset line ; Cr Accounts payable (total, party).
// ---------------------------------------------------------------------------
export async function createPurchaseInvoice(
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
  const rawLines = input.lines.filter(
    (l) => l.description.trim() && l.accountId,
  );
  if (rawLines.length === 0) throw new DocumentError("Add at least one line");

  const lines = rawLines.map(withLineTax);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0n);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0n);
  const total = subtotal + taxTotal;
  if (total <= 0n) throw new DocumentError("Bill total must be positive");

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
      lines: entryLines,
    });

    const number = await nextDocNumber(tx, orgId, "BILL");
    const invoice = await tx.purchaseInvoice.create({
      data: {
        orgId,
        number,
        partyId: input.partyId,
        date: input.date,
        dueDate: input.dueDate ?? null,
        supplierRef: input.supplierRef ?? null,
        notes: input.notes ?? null,
        total,
        status: "unpaid",
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

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: invoice.id },
    });
    return invoice;
  });
}

// ---------------------------------------------------------------------------
// Inter-account transfer — move money between two bank/cash accounts.
// Dr destination (toAccount) ; Cr source (fromAccount).
// ---------------------------------------------------------------------------
export async function createInterAccountTransfer(
  orgId: string,
  input: {
    date: Date;
    fromAccountId: string;
    toAccountId: string;
    amount: bigint;
    reference?: string | null;
    description?: string | null;
  },
) {
  if (!input.fromAccountId || !input.toAccountId) {
    throw new DocumentError("Choose both accounts");
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new DocumentError("From and to accounts must be different");
  }
  if (input.amount <= 0n) {
    throw new DocumentError("Amount must be positive");
  }

  return prisma.$transaction(async (tx) => {
    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.description ?? null,
      reference: input.reference ?? null,
      sourceType: "transfer",
      lines: [
        { accountId: input.toAccountId, debit: input.amount },
        { accountId: input.fromAccountId, credit: input.amount },
      ],
    });

    const number = await nextDocNumber(tx, orgId, "TRF");
    const transfer = await tx.interAccountTransfer.create({
      data: {
        orgId,
        number,
        date: input.date,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount,
        reference: input.reference ?? null,
        description: input.description ?? null,
        journalEntryId: entry.id,
      },
    });

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: transfer.id },
    });
    return transfer;
  });
}

// ---------------------------------------------------------------------------
// Credit note — issued to a customer (sales return / refund).
// Dr each income/returns line ; Cr Accounts receivable (total, party).
// ---------------------------------------------------------------------------
export async function createCreditNote(
  orgId: string,
  input: {
    partyId: string;
    date: Date;
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
  if (total <= 0n) throw new DocumentError("Credit note total must be positive");

  return prisma.$transaction(async (tx) => {
    const ar = await receivableAccount(orgId);

    // Returned goods go back into stock; reverse their cost of goods sold.
    const { lineCosts, restockTotal } = await restockReturnedItems(tx, orgId, lines);

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
    if (restockTotal > 0n) {
      const cogs = await cogsAccount(orgId);
      const inv = await inventoryAccount(orgId);
      entryLines.push({ accountId: inv.id, debit: restockTotal });
      entryLines.push({ accountId: cogs.id, credit: restockTotal });
    }

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.reference ?? null,
      sourceType: "credit_note",
      lines: entryLines,
    });

    const number = await nextDocNumber(tx, orgId, "CN");
    const note = await tx.creditNote.create({
      data: {
        orgId,
        number,
        partyId: input.partyId,
        date: input.date,
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

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: note.id },
    });
    return note;
  });
}

// ---------------------------------------------------------------------------
// Debit note — issued to a supplier (purchase return).
// Dr Accounts payable (total, party) ; Cr each expense/purchases line.
// ---------------------------------------------------------------------------
export async function createDebitNote(
  orgId: string,
  input: {
    partyId: string;
    date: Date;
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
      lines: entryLines,
    });

    const number = await nextDocNumber(tx, orgId, "DN");
    const note = await tx.debitNote.create({
      data: {
        orgId,
        number,
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

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: note.id },
    });
    return note;
  });
}

// --- Single-document fetch (with journal entry + prev/next navigation) -------

export type DocNav = {
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
};

async function journalFor(journalEntryId: string) {
  return prisma.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: { include: { account: true, party: true } } },
  });
}

export async function getReceipt(orgId: string, id: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { orgId, id },
    include: { lines: { include: { account: true } }, party: true, bankAccount: true },
  });
  if (!receipt) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(receipt.journalEntryId),
    prisma.receipt.count({ where: { orgId } }),
    prisma.receipt.count({ where: { orgId, createdAt: { lt: receipt.createdAt } } }),
    prisma.receipt.findFirst({
      where: { orgId, createdAt: { lt: receipt.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.receipt.findFirst({
      where: { orgId, createdAt: { gt: receipt.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { receipt, entry, nav };
}

export async function getPayment(orgId: string, id: string) {
  const payment = await prisma.payment.findFirst({
    where: { orgId, id },
    include: {
      lines: { include: { account: true, item: true } },
      party: true,
      bankAccount: true,
    },
  });
  if (!payment) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(payment.journalEntryId),
    prisma.payment.count({ where: { orgId } }),
    prisma.payment.count({ where: { orgId, createdAt: { lt: payment.createdAt } } }),
    prisma.payment.findFirst({
      where: { orgId, createdAt: { lt: payment.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.payment.findFirst({
      where: { orgId, createdAt: { gt: payment.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { payment, entry, nav };
}

// Distinct class/department labels used on existing cash-document lines.
// Powers the autocomplete datalist on the receipt/payment forms.
export async function listClassNames(orgId: string): Promise<string[]> {
  const [paymentClasses, receiptClasses] = await Promise.all([
    prisma.paymentLine.findMany({
      where: { payment: { orgId }, className: { not: null } },
      select: { className: true },
      distinct: ["className"],
      take: 200,
    }),
    prisma.receiptLine.findMany({
      where: { receipt: { orgId }, className: { not: null } },
      select: { className: true },
      distinct: ["className"],
      take: 200,
    }),
  ]);
  const set = new Set<string>();
  for (const row of [...paymentClasses, ...receiptClasses]) {
    if (row.className) set.add(row.className);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function getSalesInvoice(orgId: string, id: string) {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { orgId, id },
    include: { lines: { include: { account: true } }, party: true },
  });
  if (!invoice) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(invoice.journalEntryId),
    prisma.salesInvoice.count({ where: { orgId } }),
    prisma.salesInvoice.count({ where: { orgId, createdAt: { lt: invoice.createdAt } } }),
    prisma.salesInvoice.findFirst({
      where: { orgId, createdAt: { lt: invoice.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.salesInvoice.findFirst({
      where: { orgId, createdAt: { gt: invoice.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { invoice, entry, nav };
}

export async function getPurchaseInvoice(orgId: string, id: string) {
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { orgId, id },
    include: { lines: { include: { account: true } }, party: true },
  });
  if (!invoice) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(invoice.journalEntryId),
    prisma.purchaseInvoice.count({ where: { orgId } }),
    prisma.purchaseInvoice.count({
      where: { orgId, createdAt: { lt: invoice.createdAt } },
    }),
    prisma.purchaseInvoice.findFirst({
      where: { orgId, createdAt: { lt: invoice.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.purchaseInvoice.findFirst({
      where: { orgId, createdAt: { gt: invoice.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { invoice, entry, nav };
}

export async function getInterAccountTransfer(orgId: string, id: string) {
  const transfer = await prisma.interAccountTransfer.findFirst({
    where: { orgId, id },
    include: { fromAccount: true, toAccount: true },
  });
  if (!transfer) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(transfer.journalEntryId),
    prisma.interAccountTransfer.count({ where: { orgId } }),
    prisma.interAccountTransfer.count({
      where: { orgId, createdAt: { lt: transfer.createdAt } },
    }),
    prisma.interAccountTransfer.findFirst({
      where: { orgId, createdAt: { lt: transfer.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.interAccountTransfer.findFirst({
      where: { orgId, createdAt: { gt: transfer.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { transfer, entry, nav };
}

export async function getCreditNote(orgId: string, id: string) {
  const note = await prisma.creditNote.findFirst({
    where: { orgId, id },
    include: { lines: { include: { account: true } }, party: true },
  });
  if (!note) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(note.journalEntryId),
    prisma.creditNote.count({ where: { orgId } }),
    prisma.creditNote.count({ where: { orgId, createdAt: { lt: note.createdAt } } }),
    prisma.creditNote.findFirst({
      where: { orgId, createdAt: { lt: note.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.creditNote.findFirst({
      where: { orgId, createdAt: { gt: note.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { note, entry, nav };
}

export async function getDebitNote(orgId: string, id: string) {
  const note = await prisma.debitNote.findFirst({
    where: { orgId, id },
    include: { lines: { include: { account: true } }, party: true },
  });
  if (!note) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(note.journalEntryId),
    prisma.debitNote.count({ where: { orgId } }),
    prisma.debitNote.count({ where: { orgId, createdAt: { lt: note.createdAt } } }),
    prisma.debitNote.findFirst({
      where: { orgId, createdAt: { lt: note.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.debitNote.findFirst({
      where: { orgId, createdAt: { gt: note.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { note, entry, nav };
}

// --- Clone (duplicate a document as a new one dated today) -------------------

export async function cloneReceipt(orgId: string, id: string) {
  const r = await prisma.receipt.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!r) throw new DocumentError("Receipt not found");
  return createReceipt(orgId, {
    date: new Date(),
    bankAccountId: r.bankAccountId,
    partyId: r.partyId,
    reference: r.reference,
    description: r.description,
    paymentMethod: r.paymentMethod,
    tags: r.tags,
    currency: r.currency,
    exchangeRate: r.exchangeRate ? r.exchangeRate.toString() : null,
    lines: r.lines.map((l) => ({
      accountId: l.accountId,
      amount: l.amount,
      memo: l.memo,
      className: l.className,
      taxRate: l.taxRate ? Number(l.taxRate) : null,
    })),
  });
}

export async function clonePayment(orgId: string, id: string) {
  const p = await prisma.payment.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!p) throw new DocumentError("Payment not found");
  return createPayment(orgId, {
    date: new Date(),
    bankAccountId: p.bankAccountId,
    partyId: p.partyId,
    reference: p.reference,
    description: p.description,
    paymentMethod: p.paymentMethod,
    tags: p.tags,
    currency: p.currency,
    exchangeRate: p.exchangeRate ? p.exchangeRate.toString() : null,
    lines: p.lines
      .filter((l) => !l.itemId)
      .map((l) => ({
        accountId: l.accountId,
        amount: l.amount,
        memo: l.memo,
        className: l.className,
        taxRate: l.taxRate ? Number(l.taxRate) : null,
      })),
    itemLines: p.lines
      .filter((l) => l.itemId)
      .map((l) => ({
        itemId: l.itemId as string,
        quantity: (l.quantity ?? new Prisma.Decimal(0)).toString(),
        unitCost: l.unitCost ?? 0n,
        memo: l.memo,
        className: l.className,
        taxRate: l.taxRate ? Number(l.taxRate) : null,
      })),
  });
}

export async function cloneSalesInvoice(orgId: string, id: string) {
  const inv = await prisma.salesInvoice.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!inv) throw new DocumentError("Invoice not found");
  return createSalesInvoice(orgId, {
    partyId: inv.partyId,
    date: new Date(),
    reference: inv.reference,
    notes: inv.notes,
    lines: inv.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice,
      accountId: l.accountId,
      itemId: l.itemId,
      taxRate: l.taxRate != null ? Number(l.taxRate) : null,
    })),
  });
}

export async function clonePurchaseInvoice(orgId: string, id: string) {
  const inv = await prisma.purchaseInvoice.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!inv) throw new DocumentError("Bill not found");
  return createPurchaseInvoice(orgId, {
    partyId: inv.partyId,
    date: new Date(),
    supplierRef: inv.supplierRef,
    notes: inv.notes,
    lines: inv.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice,
      accountId: l.accountId,
      taxRate: l.taxRate != null ? Number(l.taxRate) : null,
    })),
  });
}

export function listPurchaseInvoices(orgId: string) {
  return prisma.purchaseInvoice.findMany({
    where: { orgId },
    include: { party: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function cloneInterAccountTransfer(orgId: string, id: string) {
  const t = await prisma.interAccountTransfer.findFirst({ where: { orgId, id } });
  if (!t) throw new DocumentError("Transfer not found");
  return createInterAccountTransfer(orgId, {
    date: new Date(),
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    amount: t.amount,
    reference: t.reference,
    description: t.description,
  });
}

export function listInterAccountTransfers(orgId: string) {
  return prisma.interAccountTransfer.findMany({
    where: { orgId },
    include: { fromAccount: true, toAccount: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function cloneCreditNote(orgId: string, id: string) {
  const n = await prisma.creditNote.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!n) throw new DocumentError("Credit note not found");
  return createCreditNote(orgId, {
    partyId: n.partyId,
    date: new Date(),
    reference: n.reference,
    notes: n.notes,
    lines: n.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice,
      accountId: l.accountId,
      itemId: l.itemId,
      taxRate: l.taxRate != null ? Number(l.taxRate) : null,
    })),
  });
}

export async function cloneDebitNote(orgId: string, id: string) {
  const n = await prisma.debitNote.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!n) throw new DocumentError("Debit note not found");
  return createDebitNote(orgId, {
    partyId: n.partyId,
    date: new Date(),
    supplierRef: n.supplierRef,
    notes: n.notes,
    lines: n.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice,
      accountId: l.accountId,
      taxRate: l.taxRate != null ? Number(l.taxRate) : null,
    })),
  });
}

export function listCreditNotes(orgId: string) {
  return prisma.creditNote.findMany({
    where: { orgId },
    include: { party: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export function listDebitNotes(orgId: string) {
  return prisma.debitNote.findMany({
    where: { orgId },
    include: { party: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export function listReceipts(orgId: string) {
  return prisma.receipt.findMany({
    where: { orgId },
    include: { bankAccount: true, party: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export function listPayments(orgId: string) {
  return prisma.payment.findMany({
    where: { orgId },
    include: {
      bankAccount: true,
      party: true,
      lines: { select: { memo: true, account: { select: { name: true } } } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export type MonthStats = { count: number; sum: bigint; avg: bigint; latest: Date | null };

type DocModelName =
  | "payment"
  | "receipt"
  | "salesInvoice"
  | "purchaseInvoice"
  | "interAccountTransfer"
  | "creditNote"
  | "debitNote"
  | "goodsReceipt"
  | "inventoryWriteOff"
  | "inventoryAdjustment"
  | "salesReceipt"
  | "refundReceipt";

// Current-month KPI aggregate (count + sum + average) plus the latest doc date.
// Aggregates over ALL rows, not just the capped list shown in the table.
export async function docMonthStats(orgId: string, model: DocModelName): Promise<MonthStats> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const amountField = model === "interAccountTransfer" ? "amount" : "total";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[model];
  const [agg, latest] = await Promise.all([
    delegate.aggregate({
      where: { orgId, date: { gte: start, lt: end } },
      _count: true,
      _sum: { [amountField]: true },
    }),
    delegate.findFirst({
      where: { orgId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { date: true },
    }),
  ]);

  const count: number = agg._count;
  const sum: bigint = agg._sum[amountField] ?? 0n;
  return {
    count,
    sum,
    avg: count > 0 ? sum / BigInt(count) : 0n,
    latest: (latest?.date as Date | undefined) ?? null,
  };
}

export function listSalesInvoices(orgId: string) {
  return prisma.salesInvoice.findMany({
    where: { orgId },
    include: { party: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export function listSalesReceipts(orgId: string) {
  return prisma.salesReceipt.findMany({
    where: { orgId },
    include: { party: true, bankAccount: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function getSalesReceipt(orgId: string, id: string) {
  const receipt = await prisma.salesReceipt.findFirst({
    where: { orgId, id },
    include: {
      lines: { include: { account: true, item: true } },
      party: true,
      bankAccount: true,
    },
  });
  if (!receipt) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(receipt.journalEntryId),
    prisma.salesReceipt.count({ where: { orgId } }),
    prisma.salesReceipt.count({ where: { orgId, createdAt: { lt: receipt.createdAt } } }),
    prisma.salesReceipt.findFirst({
      where: { orgId, createdAt: { lt: receipt.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.salesReceipt.findFirst({
      where: { orgId, createdAt: { gt: receipt.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { receipt, entry, nav };
}

export function listRefundReceipts(orgId: string) {
  return prisma.refundReceipt.findMany({
    where: { orgId },
    include: { party: true, bankAccount: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function getRefundReceipt(orgId: string, id: string) {
  const refund = await prisma.refundReceipt.findFirst({
    where: { orgId, id },
    include: {
      lines: { include: { account: true } },
      party: true,
      bankAccount: true,
    },
  });
  if (!refund) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(refund.journalEntryId),
    prisma.refundReceipt.count({ where: { orgId } }),
    prisma.refundReceipt.count({ where: { orgId, createdAt: { lt: refund.createdAt } } }),
    prisma.refundReceipt.findFirst({
      where: { orgId, createdAt: { lt: refund.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.refundReceipt.findFirst({
      where: { orgId, createdAt: { gt: refund.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const nav: DocNav = {
    index: before + 1,
    total,
    prevId: prev?.id ?? null,
    nextId: next?.id ?? null,
  };
  return { refund, entry, nav };
}

export { LedgerError };
