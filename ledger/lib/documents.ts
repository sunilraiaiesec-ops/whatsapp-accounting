import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { postEntryWithin, LedgerError } from "@/lib/ledger";
import {
  receivableAccount,
  payableAccount,
  inventoryAccount,
  cogsAccount,
} from "@/lib/accounts";

export class DocumentError extends Error {}

function formatNumber(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

type LineInput = {
  accountId: string;
  amount: bigint;
  memo?: string | null;
  className?: string | null;
};

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
    lines: LineInput[];
  },
) {
  const lines = input.lines.filter((l) => l.accountId && l.amount > 0n);
  if (lines.length === 0) throw new DocumentError("Add at least one line");
  const total = lines.reduce((s, l) => s + l.amount, 0n);

  return prisma.$transaction(async (tx) => {
    await assertCashDocLines(tx, orgId, input.bankAccountId, lines, "receipt");

    const accounts = await tx.account.findMany({
      where: { orgId, id: { in: lines.map((l) => l.accountId) } },
      select: { id: true, isControl: true },
    });
    const controlIds = new Set(accounts.filter((a) => a.isControl).map((a) => a.id));

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.description ?? null,
      reference: input.reference ?? null,
      sourceType: "receipt",
      lines: [
        { accountId: input.bankAccountId, debit: total },
        ...lines.map((l) => ({
          accountId: l.accountId,
          credit: l.amount,
          partyId: controlIds.has(l.accountId) ? input.partyId ?? null : null,
          memo: l.memo ?? null,
        })),
      ],
    });

    const number = formatNumber("REC", await tx.receipt.count({ where: { orgId } }));
    const receipt = await tx.receipt.create({
      data: {
        orgId,
        number,
        date: input.date,
        reference: input.reference ?? null,
        description: input.description ?? null,
        paymentMethod: input.paymentMethod ?? null,
        tags: input.tags ?? [],
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
    lines: LineInput[];
  },
) {
  const lines = input.lines.filter((l) => l.accountId && l.amount > 0n);
  if (lines.length === 0) throw new DocumentError("Add at least one line");
  const total = lines.reduce((s, l) => s + l.amount, 0n);

  return prisma.$transaction(async (tx) => {
    await assertCashDocLines(tx, orgId, input.bankAccountId, lines, "payment");

    const accounts = await tx.account.findMany({
      where: { orgId, id: { in: lines.map((l) => l.accountId) } },
      select: { id: true, isControl: true },
    });
    const controlIds = new Set(accounts.filter((a) => a.isControl).map((a) => a.id));

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.description ?? null,
      reference: input.reference ?? null,
      sourceType: "payment",
      lines: [
        { accountId: input.bankAccountId, credit: total },
        ...lines.map((l) => ({
          accountId: l.accountId,
          debit: l.amount,
          partyId: controlIds.has(l.accountId) ? input.partyId ?? null : null,
          memo: l.memo ?? null,
        })),
      ],
    });

    const number = formatNumber("PAY", await tx.payment.count({ where: { orgId } }));
    const payment = await tx.payment.create({
      data: {
        orgId,
        number,
        date: input.date,
        reference: input.reference ?? null,
        description: input.description ?? null,
        paymentMethod: input.paymentMethod ?? null,
        tags: input.tags ?? [],
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
          })),
        },
      },
    });

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
};

function computeLineTotal(quantity: string, unitPrice: bigint): bigint {
  const qty = new Prisma.Decimal(quantity || "0");
  const total = qty.times(unitPrice.toString());
  return BigInt(total.toFixed(0));
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

  const lines = rawLines.map((l) => ({
    ...l,
    lineTotal: computeLineTotal(l.quantity, l.unitPrice),
  }));
  const total = lines.reduce((s, l) => s + l.lineTotal, 0n);
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

    const number = formatNumber(
      "INV",
      await tx.salesInvoice.count({ where: { orgId } }),
    );
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

  const lines = rawLines.map((l) => ({
    ...l,
    lineTotal: computeLineTotal(l.quantity, l.unitPrice),
  }));
  const total = lines.reduce((s, l) => s + l.lineTotal, 0n);
  if (total <= 0n) throw new DocumentError("Bill total must be positive");

  return prisma.$transaction(async (tx) => {
    const ap = await payableAccount(orgId);

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.supplierRef ?? null,
      sourceType: "purchase_invoice",
      lines: [
        ...lines.map((l) => ({ accountId: l.accountId, debit: l.lineTotal })),
        { accountId: ap.id, credit: total, partyId: input.partyId },
      ],
    });

    const number = formatNumber(
      "BILL",
      await tx.purchaseInvoice.count({ where: { orgId } }),
    );
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

    const number = formatNumber(
      "TRF",
      await tx.interAccountTransfer.count({ where: { orgId } }),
    );
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

  const lines = rawLines.map((l) => ({
    ...l,
    lineTotal: computeLineTotal(l.quantity, l.unitPrice),
  }));
  const total = lines.reduce((s, l) => s + l.lineTotal, 0n);
  if (total <= 0n) throw new DocumentError("Credit note total must be positive");

  return prisma.$transaction(async (tx) => {
    const ar = await receivableAccount(orgId);

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.reference ?? null,
      sourceType: "credit_note",
      lines: [
        ...lines.map((l) => ({ accountId: l.accountId, debit: l.lineTotal })),
        { accountId: ar.id, credit: total, partyId: input.partyId },
      ],
    });

    const number = formatNumber(
      "CN",
      await tx.creditNote.count({ where: { orgId } }),
    );
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
          create: lines.map((l) => ({
            description: l.description.trim(),
            quantity: new Prisma.Decimal(l.quantity || "0"),
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            accountId: l.accountId,
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

  const lines = rawLines.map((l) => ({
    ...l,
    lineTotal: computeLineTotal(l.quantity, l.unitPrice),
  }));
  const total = lines.reduce((s, l) => s + l.lineTotal, 0n);
  if (total <= 0n) throw new DocumentError("Debit note total must be positive");

  return prisma.$transaction(async (tx) => {
    const ap = await payableAccount(orgId);

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.supplierRef ?? null,
      sourceType: "debit_note",
      lines: [
        { accountId: ap.id, debit: total, partyId: input.partyId },
        ...lines.map((l) => ({ accountId: l.accountId, credit: l.lineTotal })),
      ],
    });

    const number = formatNumber(
      "DN",
      await tx.debitNote.count({ where: { orgId } }),
    );
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
    include: { lines: { include: { account: true } }, party: true, bankAccount: true },
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
    lines: r.lines.map((l) => ({
      accountId: l.accountId,
      amount: l.amount,
      memo: l.memo,
      className: l.className,
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
    lines: p.lines.map((l) => ({
      accountId: l.accountId,
      amount: l.amount,
      memo: l.memo,
      className: l.className,
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
    include: { bankAccount: true, party: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export function listSalesInvoices(orgId: string) {
  return prisma.salesInvoice.findMany({
    where: { orgId },
    include: { party: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export { LedgerError };
