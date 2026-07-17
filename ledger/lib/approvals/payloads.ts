import { Prisma } from "@prisma/client";

import {
  createPayment,
  createReceipt,
  createSalesInvoice,
  createPurchaseInvoice,
  type LineInput,
  type CashItemLineInput,
  type InvoiceLineInput,
} from "@/lib/documents";
import { receiveGoods, adjustInventory, type ReceiptLineInput, type AdjustmentLineInput } from "@/lib/inventory";
import { ApprovalError, type PendingTransactionType } from "@/lib/approvals/types";
import type { AllocationInput } from "@/lib/invoice-lifecycle";

// ---------------------------------------------------------------------------
// The exact input shapes the 6 real posting functions expect (§10/§11: "the
// exact input shape the real creation function ... expects, so approval can
// call it unchanged"). "expense" and "supplier_payment" both use
// RawPaymentPayload/createPayment.
// ---------------------------------------------------------------------------

export type RawPaymentPayload = {
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
  // A Cashier-submitted receipt/payment can already name which invoice(s) it
  // settles — must survive the approval round-trip so a Manager's approval
  // doesn't silently drop the submitter's allocation intent.
  allocations?: AllocationInput[];
};

export type RawReceiptPayload = Omit<RawPaymentPayload, "itemLines">;

export type RawSalesInvoicePayload = {
  partyId: string;
  date: Date;
  dueDate?: Date | null;
  reference?: string | null;
  notes?: string | null;
  lines: InvoiceLineInput[];
};

export type RawPurchaseInvoicePayload = {
  partyId: string;
  date: Date;
  dueDate?: Date | null;
  supplierRef?: string | null;
  notes?: string | null;
  lines: InvoiceLineInput[];
};

export type RawGoodsReceiptPayload = {
  partyId: string;
  date: Date;
  reference?: string | null;
  notes?: string | null;
  lines: ReceiptLineInput[];
};

export type RawInventoryAdjustmentPayload = {
  date: Date;
  adjustmentAccountId: string;
  notes?: string | null;
  lines: AdjustmentLineInput[];
};

export type RawPayloadForType<T extends PendingTransactionType> = T extends "expense" | "supplier_payment"
  ? RawPaymentPayload
  : T extends "payment_received"
    ? RawReceiptPayload
    : T extends "sales_invoice"
      ? RawSalesInvoicePayload
      : T extends "purchase_invoice"
        ? RawPurchaseInvoicePayload
        : T extends "stock_receipt"
          ? RawGoodsReceiptPayload
          : RawInventoryAdjustmentPayload;

// ---------------------------------------------------------------------------
// JSON-safe "stored" mirrors (Prisma Json can't round-trip Date or BigInt) —
// dates become ISO strings, bigints become decimal strings. These are exactly
// what's persisted in PendingTransaction.payload.
// ---------------------------------------------------------------------------

type StoredLine = { accountId: string; amount: string; memo: string | null; className: string | null; taxRate: number | null };
type StoredItemLine = {
  itemId: string;
  quantity: string;
  unitCost: string;
  memo: string | null;
  className: string | null;
  taxRate: number | null;
};
type StoredInvoiceLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
  itemId: string | null;
  taxRate: number | null;
};
type StoredGoodsLine = { itemId: string; quantity: string; unitCost: string };
type StoredAdjustmentLine = { itemId: string; newQuantity: string };
type StoredAllocation = { invoiceId: string; amount: string };

export type StoredPaymentPayload = {
  date: string;
  bankAccountId: string;
  partyId: string | null;
  reference: string | null;
  description: string | null;
  paymentMethod: string | null;
  tags: string[];
  currency: string | null;
  exchangeRate: string | null;
  lines: StoredLine[];
  itemLines: StoredItemLine[];
  allocations: StoredAllocation[];
};

export type StoredReceiptPayload = Omit<StoredPaymentPayload, "itemLines">;

export type StoredSalesInvoicePayload = {
  partyId: string;
  date: string;
  dueDate: string | null;
  reference: string | null;
  notes: string | null;
  lines: StoredInvoiceLine[];
};

export type StoredPurchaseInvoicePayload = {
  partyId: string;
  date: string;
  dueDate: string | null;
  supplierRef: string | null;
  notes: string | null;
  lines: StoredInvoiceLine[];
};

export type StoredGoodsReceiptPayload = {
  partyId: string;
  date: string;
  reference: string | null;
  notes: string | null;
  lines: StoredGoodsLine[];
};

export type StoredInventoryAdjustmentPayload = {
  date: string;
  adjustmentAccountId: string;
  notes: string | null;
  lines: StoredAdjustmentLine[];
};

export type StoredPayload =
  | StoredPaymentPayload
  | StoredReceiptPayload
  | StoredSalesInvoicePayload
  | StoredPurchaseInvoicePayload
  | StoredGoodsReceiptPayload
  | StoredInventoryAdjustmentPayload;

function dateToIso(d: Date): string {
  return d.toISOString();
}

function isoToDate(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new ApprovalError(`Invalid stored date: ${s}`);
  return d;
}

// --- Serialize (raw, as passed to the real posting function -> stored JSON) ---

export function serializePaymentPayload(input: RawPaymentPayload): StoredPaymentPayload {
  return {
    date: dateToIso(input.date),
    bankAccountId: input.bankAccountId,
    partyId: input.partyId ?? null,
    reference: input.reference ?? null,
    description: input.description ?? null,
    paymentMethod: input.paymentMethod ?? null,
    tags: input.tags ?? [],
    currency: input.currency ?? null,
    exchangeRate: input.exchangeRate != null ? String(input.exchangeRate) : null,
    lines: input.lines.map((l) => ({
      accountId: l.accountId,
      amount: l.amount.toString(),
      memo: l.memo ?? null,
      className: l.className ?? null,
      taxRate: l.taxRate ?? null,
    })),
    itemLines: (input.itemLines ?? []).map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      unitCost: l.unitCost.toString(),
      memo: l.memo ?? null,
      className: l.className ?? null,
      taxRate: l.taxRate ?? null,
    })),
    allocations: (input.allocations ?? []).map((a) => ({
      invoiceId: a.invoiceId,
      amount: a.amount.toString(),
    })),
  };
}

export function serializeReceiptPayload(input: RawReceiptPayload): StoredReceiptPayload {
  const { itemLines, ...rest } = serializePaymentPayload({ ...input, itemLines: [] });
  void itemLines;
  return rest;
}

export function serializeSalesInvoicePayload(input: RawSalesInvoicePayload): StoredSalesInvoicePayload {
  return {
    partyId: input.partyId,
    date: dateToIso(input.date),
    dueDate: input.dueDate ? dateToIso(input.dueDate) : null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    lines: input.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toString(),
      accountId: l.accountId,
      itemId: l.itemId ?? null,
      taxRate: l.taxRate ?? null,
    })),
  };
}

export function serializePurchaseInvoicePayload(input: RawPurchaseInvoicePayload): StoredPurchaseInvoicePayload {
  return {
    partyId: input.partyId,
    date: dateToIso(input.date),
    dueDate: input.dueDate ? dateToIso(input.dueDate) : null,
    supplierRef: input.supplierRef ?? null,
    notes: input.notes ?? null,
    lines: input.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toString(),
      accountId: l.accountId,
      itemId: l.itemId ?? null,
      taxRate: l.taxRate ?? null,
    })),
  };
}

export function serializeGoodsReceiptPayload(input: RawGoodsReceiptPayload): StoredGoodsReceiptPayload {
  return {
    partyId: input.partyId,
    date: dateToIso(input.date),
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    lines: input.lines.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      unitCost: l.unitCost.toString(),
    })),
  };
}

export function serializeInventoryAdjustmentPayload(
  input: RawInventoryAdjustmentPayload,
): StoredInventoryAdjustmentPayload {
  return {
    date: dateToIso(input.date),
    adjustmentAccountId: input.adjustmentAccountId,
    notes: input.notes ?? null,
    lines: input.lines.map((l) => ({ itemId: l.itemId, newQuantity: l.newQuantity })),
  };
}

// Dispatches serialization by type — used by the gating call sites so they
// don't need a switch of their own.
export function serializeForType(type: PendingTransactionType, raw: unknown): Prisma.InputJsonValue {
  switch (type) {
    case "expense":
    case "supplier_payment":
      return serializePaymentPayload(raw as RawPaymentPayload) as unknown as Prisma.InputJsonValue;
    case "payment_received":
      return serializeReceiptPayload(raw as RawReceiptPayload) as unknown as Prisma.InputJsonValue;
    case "sales_invoice":
      return serializeSalesInvoicePayload(raw as RawSalesInvoicePayload) as unknown as Prisma.InputJsonValue;
    case "purchase_invoice":
      return serializePurchaseInvoicePayload(raw as RawPurchaseInvoicePayload) as unknown as Prisma.InputJsonValue;
    case "stock_receipt":
      return serializeGoodsReceiptPayload(raw as RawGoodsReceiptPayload) as unknown as Prisma.InputJsonValue;
    case "inventory_adjustment":
      return serializeInventoryAdjustmentPayload(raw as RawInventoryAdjustmentPayload) as unknown as Prisma.InputJsonValue;
    default:
      throw new ApprovalError(`Unknown pending transaction type: ${String(type)}`);
  }
}

// --- Hydrate (stored JSON -> exact shape the real posting function expects) ---

function hydratePaymentPayload(stored: StoredPaymentPayload): RawPaymentPayload {
  return {
    date: isoToDate(stored.date),
    bankAccountId: stored.bankAccountId,
    partyId: stored.partyId,
    reference: stored.reference,
    description: stored.description,
    paymentMethod: stored.paymentMethod,
    tags: stored.tags,
    currency: stored.currency,
    exchangeRate: stored.exchangeRate,
    lines: stored.lines.map((l) => ({
      accountId: l.accountId,
      amount: BigInt(l.amount),
      memo: l.memo,
      className: l.className,
      taxRate: l.taxRate,
    })),
    itemLines: stored.itemLines.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      unitCost: BigInt(l.unitCost),
      memo: l.memo,
      className: l.className,
      taxRate: l.taxRate,
    })),
    allocations: stored.allocations.map((a) => ({
      invoiceId: a.invoiceId,
      amount: BigInt(a.amount),
    })),
  };
}

function hydrateReceiptPayload(stored: StoredReceiptPayload): RawReceiptPayload {
  const { itemLines, ...rest } = hydratePaymentPayload({ ...stored, itemLines: [] });
  void itemLines;
  return rest;
}

function hydrateSalesInvoicePayload(stored: StoredSalesInvoicePayload): RawSalesInvoicePayload {
  return {
    partyId: stored.partyId,
    date: isoToDate(stored.date),
    dueDate: stored.dueDate ? isoToDate(stored.dueDate) : null,
    reference: stored.reference,
    notes: stored.notes,
    lines: stored.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: BigInt(l.unitPrice),
      accountId: l.accountId,
      itemId: l.itemId,
      taxRate: l.taxRate,
    })),
  };
}

function hydratePurchaseInvoicePayload(stored: StoredPurchaseInvoicePayload): RawPurchaseInvoicePayload {
  return {
    partyId: stored.partyId,
    date: isoToDate(stored.date),
    dueDate: stored.dueDate ? isoToDate(stored.dueDate) : null,
    supplierRef: stored.supplierRef,
    notes: stored.notes,
    lines: stored.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: BigInt(l.unitPrice),
      accountId: l.accountId,
      itemId: l.itemId,
      taxRate: l.taxRate,
    })),
  };
}

function hydrateGoodsReceiptPayload(stored: StoredGoodsReceiptPayload): RawGoodsReceiptPayload {
  return {
    partyId: stored.partyId,
    date: isoToDate(stored.date),
    reference: stored.reference,
    notes: stored.notes,
    lines: stored.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: BigInt(l.unitCost) })),
  };
}

function hydrateInventoryAdjustmentPayload(
  stored: StoredInventoryAdjustmentPayload,
): RawInventoryAdjustmentPayload {
  return {
    date: isoToDate(stored.date),
    adjustmentAccountId: stored.adjustmentAccountId,
    notes: stored.notes,
    lines: stored.lines.map((l) => ({ itemId: l.itemId, newQuantity: l.newQuantity })),
  };
}

// The dispatcher used by approvePendingTransaction/editThenApprove — calls
// the SAME real posting function for `type` with the staged payload. Each of
// these functions is itself already fully transactional (they wrap
// themselves in prisma.$transaction) — see the report for why the overall
// approve+mark-approved sequence is not (and can't cleanly be, without
// refactoring 6 independent posting entry points to accept an external
// transaction client) a single outer transaction.
export async function postApprovedPayload(
  orgId: string,
  type: PendingTransactionType,
  payload: Prisma.JsonValue,
) {
  switch (type) {
    case "expense":
    case "supplier_payment":
      return createPayment(orgId, hydratePaymentPayload(payload as unknown as StoredPaymentPayload));
    case "payment_received":
      return createReceipt(orgId, hydrateReceiptPayload(payload as unknown as StoredReceiptPayload));
    case "sales_invoice":
      return createSalesInvoice(orgId, hydrateSalesInvoicePayload(payload as unknown as StoredSalesInvoicePayload));
    case "purchase_invoice":
      return createPurchaseInvoice(
        orgId,
        hydratePurchaseInvoicePayload(payload as unknown as StoredPurchaseInvoicePayload),
      );
    case "stock_receipt":
      return receiveGoods(orgId, hydrateGoodsReceiptPayload(payload as unknown as StoredGoodsReceiptPayload));
    case "inventory_adjustment":
      return adjustInventory(
        orgId,
        hydrateInventoryAdjustmentPayload(payload as unknown as StoredInventoryAdjustmentPayload),
      );
    default:
      throw new ApprovalError(`Unknown pending transaction type: ${String(type)}`);
  }
}

// ---------------------------------------------------------------------------
// Amount estimation — used for the Manager high-value threshold (§11) and as
// an input to the risk review's "unusually high amount" signal (§12).
// Deliberately approximate (pre-tax net for invoices) since it's only ever
// used for a threshold comparison, never posted or displayed as the
// authoritative total (the real posting function computes the exact total).
// ---------------------------------------------------------------------------

function decimalTimes(qty: string, unit: bigint): bigint {
  return BigInt(new Prisma.Decimal(qty || "0").times(unit.toString()).toFixed(0));
}

export function estimateAmountMinor(type: PendingTransactionType, raw: unknown): bigint {
  switch (type) {
    case "expense":
    case "supplier_payment": {
      const p = raw as RawPaymentPayload;
      const lineTotal = p.lines.reduce((s, l) => s + l.amount, 0n);
      const itemTotal = (p.itemLines ?? []).reduce((s, l) => s + decimalTimes(l.quantity, l.unitCost), 0n);
      return lineTotal + itemTotal;
    }
    case "payment_received": {
      const p = raw as RawReceiptPayload;
      return p.lines.reduce((s, l) => s + l.amount, 0n);
    }
    case "sales_invoice":
    case "purchase_invoice": {
      const p = raw as RawSalesInvoicePayload | RawPurchaseInvoicePayload;
      return p.lines.reduce((s, l) => s + decimalTimes(l.quantity, l.unitPrice), 0n);
    }
    case "stock_receipt": {
      const p = raw as RawGoodsReceiptPayload;
      return p.lines.reduce((s, l) => s + decimalTimes(l.quantity, l.unitCost), 0n);
    }
    case "inventory_adjustment":
      // No single "amount" concept ahead of posting (the value change is
      // only known once compared against current on-hand qty/value) — never
      // gated by the Manager threshold (see lib/approvals/config.ts), so 0
      // is a safe, unused default here.
      return 0n;
    default:
      return 0n;
  }
}

// Same estimate, but from the already-serialized STORED payload (string
// amounts) — used by the dashboard widget / risk review when re-reading a
// PendingTransaction row instead of the original raw call-site payload.
export function estimateAmountMinorFromStored(type: PendingTransactionType, stored: Prisma.JsonValue): bigint {
  switch (type) {
    case "expense":
    case "supplier_payment": {
      const p = stored as unknown as StoredPaymentPayload;
      const lineTotal = p.lines.reduce((s, l) => s + BigInt(l.amount), 0n);
      const itemTotal = p.itemLines.reduce((s, l) => s + decimalTimes(l.quantity, BigInt(l.unitCost)), 0n);
      return lineTotal + itemTotal;
    }
    case "payment_received": {
      const p = stored as unknown as StoredReceiptPayload;
      return p.lines.reduce((s, l) => s + BigInt(l.amount), 0n);
    }
    case "sales_invoice":
    case "purchase_invoice": {
      const p = stored as unknown as StoredSalesInvoicePayload | StoredPurchaseInvoicePayload;
      return p.lines.reduce((s, l) => s + decimalTimes(l.quantity, BigInt(l.unitPrice)), 0n);
    }
    case "stock_receipt": {
      const p = stored as unknown as StoredGoodsReceiptPayload;
      return p.lines.reduce((s, l) => s + decimalTimes(l.quantity, BigInt(l.unitCost)), 0n);
    }
    case "inventory_adjustment":
      return 0n;
    default:
      return 0n;
  }
}

// Extracts the partyId (if any) from a stored payload — used by the
// dashboard widget to show "who this transaction is with" and by the risk
// review's supplier-history signals.
export function partyIdFromStored(type: PendingTransactionType, stored: Prisma.JsonValue): string | null {
  switch (type) {
    case "expense":
    case "supplier_payment":
      return (stored as unknown as StoredPaymentPayload).partyId ?? null;
    case "payment_received":
      return (stored as unknown as StoredReceiptPayload).partyId ?? null;
    case "sales_invoice":
      return (stored as unknown as StoredSalesInvoicePayload).partyId;
    case "purchase_invoice":
      return (stored as unknown as StoredPurchaseInvoicePayload).partyId;
    case "stock_receipt":
      return (stored as unknown as StoredGoodsReceiptPayload).partyId;
    case "inventory_adjustment":
      return null;
    default:
      return null;
  }
}

// A short human description of a stored payload — used by the dashboard
// widget's summary line.
export function descriptionFromStored(type: PendingTransactionType, stored: Prisma.JsonValue): string | null {
  switch (type) {
    case "expense":
    case "supplier_payment":
      return (stored as unknown as StoredPaymentPayload).description;
    case "payment_received":
      return (stored as unknown as StoredReceiptPayload).description;
    case "sales_invoice":
      return (stored as unknown as StoredSalesInvoicePayload).notes;
    case "purchase_invoice":
      return (stored as unknown as StoredPurchaseInvoicePayload).notes;
    case "stock_receipt":
      return (stored as unknown as StoredGoodsReceiptPayload).notes;
    case "inventory_adjustment":
      return (stored as unknown as StoredInventoryAdjustmentPayload).notes;
    default:
      return null;
  }
}
