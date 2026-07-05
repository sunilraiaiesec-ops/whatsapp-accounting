import { prisma } from "@/lib/prisma";
import { payableAccount, receivableAccount } from "@/lib/accounts";

export type PartyLedgerRow = {
  id: string;
  date: Date;
  label: string;
  reference: string | null;
  debit: bigint;
  credit: bigint;
  balance: bigint;
  href: string | null;
};

export function documentHref(
  sourceType: string,
  sourceId: string | null,
): string | null {
  if (!sourceId) return null;
  switch (sourceType) {
    case "sales_invoice":
      return `/sales-invoices/${sourceId}`;
    case "receipt":
      return `/receipts/${sourceId}`;
    case "credit_note":
      return `/credit-notes/${sourceId}`;
    case "purchase_invoice":
      return `/purchase-invoices/${sourceId}`;
    case "payment":
      return `/payments/${sourceId}`;
    case "debit_note":
      return `/debit-notes/${sourceId}`;
    default:
      return null;
  }
}

export function getParty(orgId: string, partyId: string) {
  return prisma.party.findFirst({ where: { orgId, id: partyId } });
}

export async function listPartyBalances(
  orgId: string,
  kind: "customer" | "supplier",
) {
  const account =
    kind === "customer"
      ? await receivableAccount(orgId)
      : await payableAccount(orgId);

  const sums = await prisma.journalLine.groupBy({
    by: ["partyId"],
    where: { orgId, accountId: account.id, partyId: { not: null } },
    _sum: { debit: true, credit: true },
  });

  return new Map(
    sums.map((s) => {
      const debit = s._sum.debit ?? 0n;
      const credit = s._sum.credit ?? 0n;
      const balance =
        kind === "customer" ? debit - credit : credit - debit;
      return [s.partyId!, balance] as const;
    }),
  );
}

// Single-party version of listPartyBalances, for pages/services that only
// need one contact's AR/AP balance (e.g. the relationship-stats service)
// rather than every party in the org.
export async function getPartyBalance(
  orgId: string,
  partyId: string,
  kind: "customer" | "supplier",
): Promise<bigint> {
  const account =
    kind === "customer"
      ? await receivableAccount(orgId)
      : await payableAccount(orgId);

  const sum = await prisma.journalLine.aggregate({
    where: { orgId, accountId: account.id, partyId },
    _sum: { debit: true, credit: true },
  });
  const debit = sum._sum.debit ?? 0n;
  const credit = sum._sum.credit ?? 0n;
  return kind === "customer" ? debit - credit : credit - debit;
}

const SOURCE_TYPE_KEYS = [
  "sales_invoice",
  "receipt",
  "credit_note",
  "purchase_invoice",
  "payment",
  "debit_note",
] as const;

async function fetchDocumentNumbers(
  orgId: string,
  refs: { sourceType: string; sourceId: string }[],
) {
  const byType = (type: string) =>
    refs.filter((r) => r.sourceType === type).map((r) => r.sourceId);

  const [salesInvoices, receipts, creditNotes, purchaseInvoices, payments, debitNotes] =
    await Promise.all([
      prisma.salesInvoice.findMany({
        where: { orgId, id: { in: byType("sales_invoice") } },
        select: { id: true, number: true },
      }),
      prisma.receipt.findMany({
        where: { orgId, id: { in: byType("receipt") } },
        select: { id: true, number: true },
      }),
      prisma.creditNote.findMany({
        where: { orgId, id: { in: byType("credit_note") } },
        select: { id: true, number: true },
      }),
      prisma.purchaseInvoice.findMany({
        where: { orgId, id: { in: byType("purchase_invoice") } },
        select: { id: true, number: true },
      }),
      prisma.payment.findMany({
        where: { orgId, id: { in: byType("payment") } },
        select: { id: true, number: true },
      }),
      prisma.debitNote.findMany({
        where: { orgId, id: { in: byType("debit_note") } },
        select: { id: true, number: true },
      }),
    ]);

  const numbers = new Map<string, string>();
  for (const doc of salesInvoices) numbers.set(`sales_invoice:${doc.id}`, doc.number);
  for (const doc of receipts) numbers.set(`receipt:${doc.id}`, doc.number);
  for (const doc of creditNotes) numbers.set(`credit_note:${doc.id}`, doc.number);
  for (const doc of purchaseInvoices) {
    numbers.set(`purchase_invoice:${doc.id}`, doc.number);
  }
  for (const doc of payments) numbers.set(`payment:${doc.id}`, doc.number);
  for (const doc of debitNotes) numbers.set(`debit_note:${doc.id}`, doc.number);
  return numbers;
}

export async function getPartyLedger(
  orgId: string,
  partyId: string,
  kind: "customer" | "supplier",
  labels: Record<(typeof SOURCE_TYPE_KEYS)[number], string>,
) {
  const account =
    kind === "customer"
      ? await receivableAccount(orgId)
      : await payableAccount(orgId);

  const lines = await prisma.journalLine.findMany({
    where: { orgId, partyId, accountId: account.id },
    include: {
      entry: {
        select: {
          entryDate: true,
          description: true,
          reference: true,
          sourceType: true,
          sourceId: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      { entry: { entryDate: "asc" } },
      { entry: { createdAt: "asc" } },
    ],
  });

  const refs = lines
    .map((l) => ({
      sourceType: l.entry.sourceType,
      sourceId: l.entry.sourceId,
    }))
    .filter((r): r is { sourceType: string; sourceId: string } => !!r.sourceId);

  const numbers = await fetchDocumentNumbers(orgId, refs);

  let balance = 0n;
  const rows: PartyLedgerRow[] = lines.map((line) => {
    balance +=
      kind === "customer"
        ? line.debit - line.credit
        : line.credit - line.debit;

    const { entry } = line;
    const typeKey = entry.sourceType as (typeof SOURCE_TYPE_KEYS)[number];
    const typeLabel = labels[typeKey] ?? entry.sourceType;
    const docNumber =
      entry.sourceId && numbers.get(`${entry.sourceType}:${entry.sourceId}`);
    const label =
      entry.description?.trim() ||
      (docNumber ? `${typeLabel} ${docNumber}` : typeLabel);

    return {
      id: line.id,
      date: entry.entryDate,
      label,
      reference: entry.reference,
      debit: line.debit,
      credit: line.credit,
      balance,
      href: documentHref(entry.sourceType, entry.sourceId),
    };
  });

  return { account, balance, rows };
}
