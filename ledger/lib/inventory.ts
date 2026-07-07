import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { postEntryWithin, removeEntryWithin } from "@/lib/ledger";
import { inventoryAccount, payableAccount } from "@/lib/accounts";
import { DocumentError, type DocNav } from "@/lib/documents";
import { nextDocNumber } from "@/lib/numbering";

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
  input: {
    code: string;
    name: string;
    salePrice: bigint;
    barcode?: string | null;
    unit?: string | null;
    reorderLevel?: number | string | null;
    defaultTaxRate?: number | null;
  },
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
      barcode: input.barcode?.trim() || null,
      unit: input.unit?.trim() || null,
      reorderLevel:
        input.reorderLevel != null && String(input.reorderLevel).trim() !== ""
          ? new Prisma.Decimal(input.reorderLevel)
          : null,
      defaultTaxRate:
        input.defaultTaxRate != null ? new Prisma.Decimal(input.defaultTaxRate) : null,
    },
  });
}

// --- Goods receipt (buy stock) ----------------------------------------------

// Exported so lib/approvals/payloads.ts can type the exact staged-payload
// shape for receiveGoods without re-declaring it.
export type ReceiptLineInput = { itemId: string; quantity: string; unitCost: bigint };

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

    const number = await nextDocNumber(tx, orgId, "GRN");
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

    const number = await nextDocNumber(tx, orgId, "WO");
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

// --- Quantity adjustment (correct stock up or down) -------------------------

// Exported so lib/approvals/payloads.ts can type the exact staged-payload
// shape for adjustInventory without re-declaring it.
export type AdjustmentLineInput = { itemId: string; newQuantity: string };

export async function adjustInventory(
  orgId: string,
  input: {
    date: Date;
    adjustmentAccountId: string;
    notes?: string | null;
    lines: AdjustmentLineInput[];
  },
) {
  if (!input.adjustmentAccountId) {
    throw new DocumentError("Choose an adjustment account");
  }
  const raw = input.lines.filter(
    (l) => l.itemId && String(l.newQuantity ?? "").trim() !== "",
  );
  if (raw.length === 0) throw new DocumentError("Add at least one item");

  return prisma.$transaction(async (tx) => {
    const inv = await inventoryAccount(orgId);

    const computed: {
      itemId: string;
      before: Prisma.Decimal;
      after: Prisma.Decimal;
      valueChange: bigint;
    }[] = [];

    for (const l of raw) {
      const item = await tx.inventoryItem.findFirstOrThrow({
        where: { id: l.itemId, orgId },
      });
      const before = new Prisma.Decimal(item.qtyOnHand);
      const after = new Prisma.Decimal(l.newQuantity);
      if (after.lt(0)) {
        throw new DocumentError(
          `New quantity for ${item.name} cannot be negative`,
        );
      }
      const delta = after.minus(before);
      if (delta.isZero()) continue;

      let valueChange: bigint;
      if (delta.gt(0)) {
        // Increase valued at the item's current average unit cost.
        const avgCost = before.gt(0)
          ? new Prisma.Decimal(item.valueOnHand.toString()).div(before)
          : new Prisma.Decimal(0);
        valueChange = round(avgCost.times(delta));
      } else {
        // Decrease removes value proportionally so the subledger stays aligned.
        const dec = delta.abs();
        valueChange = before.gt(0)
          ? -round(new Prisma.Decimal(item.valueOnHand.toString()).times(dec).div(before))
          : 0n;
      }
      computed.push({ itemId: item.id, before, after, valueChange });
    }

    if (computed.length === 0) {
      throw new DocumentError("No quantity changes to record");
    }

    const netValue = computed.reduce((s, l) => s + l.valueChange, 0n);

    // Only post to the ledger when the net inventory value actually changes.
    let entryId: string | null = null;
    if (netValue !== 0n) {
      const lines =
        netValue > 0n
          ? [
              { accountId: inv.id, debit: netValue },
              { accountId: input.adjustmentAccountId, credit: netValue },
            ]
          : [
              { accountId: input.adjustmentAccountId, debit: -netValue },
              { accountId: inv.id, credit: -netValue },
            ];
      const entry = await postEntryWithin(tx, {
        orgId,
        entryDate: input.date,
        description: input.notes ?? null,
        sourceType: "inventory_adjustment",
        lines,
      });
      entryId = entry.id;
    }

    const number = await nextDocNumber(tx, orgId, "ADJ");
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        orgId,
        number,
        date: input.date,
        adjustmentAccountId: input.adjustmentAccountId,
        notes: input.notes ?? null,
        total: netValue,
        journalEntryId: entryId,
        lines: {
          create: computed.map((l) => ({
            itemId: l.itemId,
            quantityBefore: l.before,
            quantityAfter: l.after,
            valueChange: l.valueChange,
          })),
        },
      },
    });

    for (const l of computed) {
      const item = await tx.inventoryItem.findFirstOrThrow({ where: { id: l.itemId } });
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: {
          qtyOnHand: l.after,
          valueOnHand: item.valueOnHand + l.valueChange,
        },
      });
    }

    if (entryId) {
      await tx.journalEntry.update({
        where: { id: entryId },
        data: { sourceId: adjustment.id },
      });
    }
    return adjustment;
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

export function listInventoryAdjustments(orgId: string) {
  return prisma.inventoryAdjustment.findMany({
    where: { orgId },
    include: { adjustmentAccount: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function getInventoryAdjustment(orgId: string, id: string) {
  const adjustment = await prisma.inventoryAdjustment.findFirst({
    where: { orgId, id },
    include: { lines: { include: { item: true } }, adjustmentAccount: true },
  });
  if (!adjustment) return null;
  const [entry, total, before, prev, next] = await Promise.all([
    adjustment.journalEntryId ? journalFor(adjustment.journalEntryId) : null,
    prisma.inventoryAdjustment.count({ where: { orgId } }),
    prisma.inventoryAdjustment.count({
      where: { orgId, createdAt: { lt: adjustment.createdAt } },
    }),
    prisma.inventoryAdjustment.findFirst({
      where: { orgId, createdAt: { lt: adjustment.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.inventoryAdjustment.findFirst({
      where: { orgId, createdAt: { gt: adjustment.createdAt } },
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
  return { adjustment, entry, nav };
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
