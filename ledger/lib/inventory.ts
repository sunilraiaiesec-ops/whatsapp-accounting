import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { postEntryWithin, removeEntryWithin } from "@/lib/ledger";
import { inventoryAccount, payableAccount } from "@/lib/accounts";
import { DocumentError, type DocNav } from "@/lib/documents";

function formatNumber(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

function round(decimal: Prisma.Decimal): bigint {
  return BigInt(decimal.toFixed(0));
}

// --- Items -------------------------------------------------------------------

export async function listInventoryItems(orgId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { orgId },
    orderBy: { code: "asc" },
  });
  return items.map((it) => {
    const qty = new Prisma.Decimal(it.qtyOnHand);
    const avgCost = qty.gt(0)
      ? round(new Prisma.Decimal(it.valueOnHand.toString()).div(qty))
      : 0n;
    return { ...it, avgCost };
  });
}

export function createInventoryItem(
  orgId: string,
  input: { code: string; name: string; salePrice: bigint },
) {
  if (!input.code.trim() || !input.name.trim()) {
    throw new DocumentError("Code and name are required");
  }
  return prisma.inventoryItem.create({
    data: {
      orgId,
      code: input.code.trim(),
      name: input.name.trim(),
      salePrice: input.salePrice,
    },
  });
}

// --- Goods receipt (buy stock) ----------------------------------------------

type ReceiptLineInput = { itemId: string; quantity: string; unitCost: bigint };

export async function receiveGoods(
  orgId: string,
  input: {
    partyId: string;
    date: Date;
    reference?: string | null;
    notes?: string | null;
    lines: ReceiptLineInput[];
  },
) {
  if (!input.partyId) throw new DocumentError("Choose a supplier");
  const raw = input.lines.filter(
    (l) => l.itemId && new Prisma.Decimal(l.quantity || "0").gt(0),
  );
  if (raw.length === 0) throw new DocumentError("Add at least one item");

  const lines = raw.map((l) => {
    const qty = new Prisma.Decimal(l.quantity);
    const lineTotal = round(qty.times(l.unitCost.toString()));
    return { itemId: l.itemId, qty, unitCost: l.unitCost, lineTotal };
  });
  const total = lines.reduce((s, l) => s + l.lineTotal, 0n);
  if (total <= 0n) throw new DocumentError("Receipt total must be positive");

  return prisma.$transaction(async (tx) => {
    const inv = await inventoryAccount(orgId);
    const ap = await payableAccount(orgId);

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.reference ?? null,
      sourceType: "goods_receipt",
      lines: [
        { accountId: inv.id, debit: total },
        { accountId: ap.id, credit: total, partyId: input.partyId },
      ],
    });

    const number = formatNumber(
      "GRN",
      await tx.goodsReceipt.count({ where: { orgId } }),
    );
    const receipt = await tx.goodsReceipt.create({
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
            itemId: l.itemId,
            quantity: l.qty,
            unitCost: l.unitCost,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });

    for (const l of lines) {
      const item = await tx.inventoryItem.findFirstOrThrow({
        where: { id: l.itemId, orgId },
      });
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: {
          qtyOnHand: new Prisma.Decimal(item.qtyOnHand).plus(l.qty),
          valueOnHand: item.valueOnHand + l.lineTotal,
        },
      });
    }

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: receipt.id },
    });
    return receipt;
  });
}

// --- Write-off (remove stock at average cost) -------------------------------

type WriteOffLineInput = { itemId: string; quantity: string };

export async function writeOffInventory(
  orgId: string,
  input: {
    date: Date;
    expenseAccountId: string;
    notes?: string | null;
    lines: WriteOffLineInput[];
  },
) {
  if (!input.expenseAccountId) throw new DocumentError("Choose an expense account");
  const raw = input.lines.filter(
    (l) => l.itemId && new Prisma.Decimal(l.quantity || "0").gt(0),
  );
  if (raw.length === 0) throw new DocumentError("Add at least one item");

  return prisma.$transaction(async (tx) => {
    const inv = await inventoryAccount(orgId);

    const computed: { itemId: string; qty: Prisma.Decimal; costValue: bigint }[] = [];
    for (const l of raw) {
      const item = await tx.inventoryItem.findFirstOrThrow({
        where: { id: l.itemId, orgId },
      });
      const qty = new Prisma.Decimal(l.quantity);
      const onHand = new Prisma.Decimal(item.qtyOnHand);
      if (qty.gt(onHand)) {
        throw new DocumentError(
          `Not enough stock of ${item.name}: have ${onHand.toString()}, writing off ${qty.toString()}`,
        );
      }
      // Proportional value so the subledger never drifts from the ledger.
      const costValue = onHand.gt(0)
        ? round(new Prisma.Decimal(item.valueOnHand.toString()).times(qty).div(onHand))
        : 0n;
      computed.push({ itemId: item.id, qty, costValue });
    }
    const total = computed.reduce((s, l) => s + l.costValue, 0n);
    if (total <= 0n) throw new DocumentError("Nothing to write off");

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      sourceType: "inventory_write_off",
      lines: [
        { accountId: input.expenseAccountId, debit: total },
        { accountId: inv.id, credit: total },
      ],
    });

    const number = formatNumber(
      "WO",
      await tx.inventoryWriteOff.count({ where: { orgId } }),
    );
    const writeOff = await tx.inventoryWriteOff.create({
      data: {
        orgId,
        number,
        date: input.date,
        expenseAccountId: input.expenseAccountId,
        notes: input.notes ?? null,
        total,
        journalEntryId: entry.id,
        lines: {
          create: computed.map((l) => ({
            itemId: l.itemId,
            quantity: l.qty,
            costValue: l.costValue,
          })),
        },
      },
    });

    for (const l of computed) {
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: {
          qtyOnHand: new Prisma.Decimal(item.qtyOnHand).minus(l.qty),
          valueOnHand: item.valueOnHand - l.costValue,
        },
      });
    }

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { sourceId: writeOff.id },
    });
    return writeOff;
  });
}

// --- Edit (reverse stock, repost journal) ------------------------------------

export async function updateGoodsReceipt(
  orgId: string,
  id: string,
  input: {
    partyId: string;
    date: Date;
    reference?: string | null;
    notes?: string | null;
    lines: ReceiptLineInput[];
  },
) {
  const existing = await prisma.goodsReceipt.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Goods receipt not found");

  const raw = input.lines.filter(
    (l) => l.itemId && new Prisma.Decimal(l.quantity || "0").gt(0),
  );
  if (raw.length === 0) throw new DocumentError("Add at least one item");

  const lines = raw.map((l) => {
    const qty = new Prisma.Decimal(l.quantity);
    const lineTotal = round(qty.times(l.unitCost.toString()));
    return { itemId: l.itemId, qty, unitCost: l.unitCost, lineTotal };
  });
  const total = lines.reduce((s, l) => s + l.lineTotal, 0n);
  if (total <= 0n) throw new DocumentError("Receipt total must be positive");

  return prisma.$transaction(async (tx) => {
    for (const l of existing.lines) {
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
      const newQty = new Prisma.Decimal(item.qtyOnHand).minus(l.quantity);
      if (newQty.lt(0)) {
        throw new DocumentError(
          `Edit would leave negative stock for ${item.name}`,
        );
      }
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: {
          qtyOnHand: newQty,
          valueOnHand: item.valueOnHand - l.lineTotal,
        },
      });
    }

    const inv = await inventoryAccount(orgId);
    const ap = await payableAccount(orgId);

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      reference: input.reference ?? null,
      sourceType: "goods_receipt",
      sourceId: id,
      lines: [
        { accountId: inv.id, debit: total },
        { accountId: ap.id, credit: total, partyId: input.partyId },
      ],
    });

    await tx.goodsReceiptLine.deleteMany({ where: { receiptId: id } });
    const receipt = await tx.goodsReceipt.update({
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
            itemId: l.itemId,
            quantity: l.qty,
            unitCost: l.unitCost,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });

    for (const l of lines) {
      const item = await tx.inventoryItem.findFirstOrThrow({
        where: { id: l.itemId, orgId },
      });
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: {
          qtyOnHand: new Prisma.Decimal(item.qtyOnHand).plus(l.qty),
          valueOnHand: item.valueOnHand + l.lineTotal,
        },
      });
    }

    await removeEntryWithin(tx, existing.journalEntryId);
    return receipt;
  });
}

export async function updateWriteOff(
  orgId: string,
  id: string,
  input: {
    date: Date;
    expenseAccountId: string;
    notes?: string | null;
    lines: WriteOffLineInput[];
  },
) {
  const existing = await prisma.inventoryWriteOff.findFirst({
    where: { orgId, id },
    include: { lines: true },
  });
  if (!existing) throw new DocumentError("Write-off not found");

  const raw = input.lines.filter(
    (l) => l.itemId && new Prisma.Decimal(l.quantity || "0").gt(0),
  );
  if (raw.length === 0) throw new DocumentError("Add at least one item");

  return prisma.$transaction(async (tx) => {
    for (const l of existing.lines) {
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: {
          qtyOnHand: new Prisma.Decimal(item.qtyOnHand).plus(l.quantity),
          valueOnHand: item.valueOnHand + l.costValue,
        },
      });
    }

    const inv = await inventoryAccount(orgId);
    const computed: { itemId: string; qty: Prisma.Decimal; costValue: bigint }[] = [];
    for (const l of raw) {
      const item = await tx.inventoryItem.findFirstOrThrow({
        where: { id: l.itemId, orgId },
      });
      const qty = new Prisma.Decimal(l.quantity);
      const onHand = new Prisma.Decimal(item.qtyOnHand);
      if (qty.gt(onHand)) {
        throw new DocumentError(
          `Not enough stock of ${item.name}: have ${onHand.toString()}, writing off ${qty.toString()}`,
        );
      }
      const costValue = onHand.gt(0)
        ? round(new Prisma.Decimal(item.valueOnHand.toString()).times(qty).div(onHand))
        : 0n;
      computed.push({ itemId: item.id, qty, costValue });
    }
    const total = computed.reduce((s, l) => s + l.costValue, 0n);
    if (total <= 0n) throw new DocumentError("Nothing to write off");

    const entry = await postEntryWithin(tx, {
      orgId,
      entryDate: input.date,
      description: input.notes ?? null,
      sourceType: "inventory_write_off",
      sourceId: id,
      lines: [
        { accountId: input.expenseAccountId, debit: total },
        { accountId: inv.id, credit: total },
      ],
    });

    await tx.inventoryWriteOffLine.deleteMany({ where: { writeOffId: id } });
    const writeOff = await tx.inventoryWriteOff.update({
      where: { id },
      data: {
        date: input.date,
        expenseAccountId: input.expenseAccountId,
        notes: input.notes ?? null,
        total,
        journalEntryId: entry.id,
        lines: {
          create: computed.map((l) => ({
            itemId: l.itemId,
            quantity: l.qty,
            costValue: l.costValue,
          })),
        },
      },
    });

    for (const l of computed) {
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: {
          qtyOnHand: new Prisma.Decimal(item.qtyOnHand).minus(l.qty),
          valueOnHand: item.valueOnHand - l.costValue,
        },
      });
    }

    await removeEntryWithin(tx, existing.journalEntryId);
    return writeOff;
  });
}

// --- Getters & lists ---------------------------------------------------------

async function journalFor(journalEntryId: string) {
  return prisma.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: { include: { account: true, party: true } } },
  });
}

export function listGoodsReceipts(orgId: string) {
  return prisma.goodsReceipt.findMany({
    where: { orgId },
    include: { party: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export function listInventoryWriteOffs(orgId: string) {
  return prisma.inventoryWriteOff.findMany({
    where: { orgId },
    include: { expenseAccount: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function getGoodsReceipt(orgId: string, id: string) {
  const receipt = await prisma.goodsReceipt.findFirst({
    where: { orgId, id },
    include: { lines: { include: { item: true } }, party: true },
  });
  if (!receipt) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(receipt.journalEntryId),
    prisma.goodsReceipt.count({ where: { orgId } }),
    prisma.goodsReceipt.count({ where: { orgId, createdAt: { lt: receipt.createdAt } } }),
    prisma.goodsReceipt.findFirst({
      where: { orgId, createdAt: { lt: receipt.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.goodsReceipt.findFirst({
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

export async function getInventoryWriteOff(orgId: string, id: string) {
  const writeOff = await prisma.inventoryWriteOff.findFirst({
    where: { orgId, id },
    include: { lines: { include: { item: true } }, expenseAccount: true },
  });
  if (!writeOff) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    journalFor(writeOff.journalEntryId),
    prisma.inventoryWriteOff.count({ where: { orgId } }),
    prisma.inventoryWriteOff.count({
      where: { orgId, createdAt: { lt: writeOff.createdAt } },
    }),
    prisma.inventoryWriteOff.findFirst({
      where: { orgId, createdAt: { lt: writeOff.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.inventoryWriteOff.findFirst({
      where: { orgId, createdAt: { gt: writeOff.createdAt } },
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
  return { writeOff, entry, nav };
}
