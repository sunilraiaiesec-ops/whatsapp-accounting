/**
 * One-time migration loader: imports a decoded Manager.io backup
 * (migration/out/migration.json) into an empty Bantoo organization.
 *
 * Self-contained: uses its own PrismaClient (reads DATABASE_URL from env) and
 * posts balanced journal entries + document rows directly, mirroring the rules
 * in lib/documents.ts. No app path-aliases, so it runs cleanly under tsx.
 *
 * Fast path: every row id is generated client-side so the whole dataset is
 * written with a handful of chunked createMany calls instead of thousands of
 * per-document transactions.
 *
 * Usage (from the ledger/ directory):
 *   set -a; . ./.env.migrate; set +a
 *   npx -y tsx scripts/migrate-manager.ts ../migration/out/migration.json
 *
 * Env flags:
 *   MIGRATE_EMAIL   owner email of the target org (default sunil@melsun.ca)
 *   MIGRATE_WIPE=1  delete the org's existing books first (for re-runs)
 *   MIGRATE_FORCE=1 proceed even if the org already has data
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const uid = () => randomUUID();
const B = (n: number | string | bigint) => BigInt(typeof n === "number" ? Math.round(n) : n);
const D = (s: string | null | undefined): Date =>
  s ? new Date(s + "T00:00:00Z") : new Date("2024-01-01T00:00:00Z");

type Doc = {
  date: string | null; ref?: string | null; payee?: string | null; memo?: string | null;
  party?: string | null; cash: string | null;
  lines: Array<{ acct: string | null; amount: number; memo?: string | null; party?: string | null }>;
};
type Mig = {
  controlAccounts: { receivable: string; payable: string };
  accounts: Record<string, { name: string; type: "INCOME" | "EXPENSE" }>;
  bankCash: Record<string, { name: string; number?: string | null }>;
  parties: Record<string, { name: string; kind: "customer" | "supplier" }>;
  items: Record<string, { code: string; name: string }>;
  receipts: Doc[]; payments: Doc[];
  transfers: Array<{ date: string | null; from: string | null; to: string | null; amount: number; ref?: string | null; memo?: string | null }>;
  salesInvoices: Array<{ date: string | null; number?: string | null; customer: string | null; lines: Array<{ desc: string; qty: number; unitPrice: number; lineTotal: number }> }>;
  purchaseInvoices: Array<{ date: string | null; number?: string | null; supplier: string | null; desc?: string; tons?: number | null; eurPerMT?: number | null; xaf: number | null }>;
};

async function insertMany<T>(
  model: { createMany: (a: { data: T[]; skipDuplicates?: boolean }) => Promise<unknown> },
  rows: T[], chunk = 2000,
) {
  for (let i = 0; i < rows.length; i += chunk) {
    await model.createMany({ data: rows.slice(i, i + chunk), skipDuplicates: true });
  }
}

async function main() {
  const jsonPath = process.argv[2] ?? "../migration/out/migration.json";
  const email = (process.env.MIGRATE_EMAIL ?? "sunil@melsun.ca").toLowerCase();
  const mig: Mig = JSON.parse(readFileSync(jsonPath, "utf8"));

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { org: true } } },
  });
  if (!user || user.memberships.length === 0) throw new Error(`No org found for ${email}`);
  const orgId = user.memberships[0].orgId;
  console.log(`Target org: ${user.memberships[0].org.name} (${orgId})`);

  const existing = await prisma.journalEntry.count({ where: { orgId } });
  if (existing > 0) {
    if (process.env.MIGRATE_WIPE === "1") {
      console.log(`Wiping ${existing} existing journal entries + documents...`);
      await wipe(orgId);
    } else if (process.env.MIGRATE_FORCE !== "1") {
      throw new Error(`Org already has ${existing} journal entries. Set MIGRATE_WIPE=1 to reset.`);
    }
  }

  // --- Seed accounts (created at signup) ----------------------------------
  const seed = await prisma.account.findMany({ where: { orgId } });
  const sub = (s: string) => seed.find((a) => a.subtype === s);
  const ar = sub("receivable")!.id, ap = sub("payable")!.id, inv = sub("inventory")!.id;
  const sales = (sub("sales") ?? seed.find((a) => a.code === "4000"))!.id;

  // --- Master data (bulk) -------------------------------------------------
  const acctRows: Prisma.AccountCreateManyInput[] = [];
  const acctMap = new Map<string, string>();
  acctMap.set(mig.controlAccounts.receivable, ar);
  acctMap.set(mig.controlAccounts.payable, ap);

  const uncIncome = uid(), uncExpense = uid();
  acctRows.push({ id: uncIncome, orgId, code: "I-UNC", name: "Uncategorised income", type: "INCOME" });
  acctRows.push({ id: uncExpense, orgId, code: "E-UNC", name: "Uncategorised expense", type: "EXPENSE" });

  let ai = 0;
  for (const [guid, a] of Object.entries(mig.accounts)) {
    const id = uid();
    acctRows.push({ id, orgId, code: `${a.type === "INCOME" ? "I" : "E"}${String(++ai).padStart(4, "0")}`, name: a.name, type: a.type });
    acctMap.set(guid, id);
  }
  const cashMap = new Map<string, string>();
  let bi = 0;
  for (const [guid, b2] of Object.entries(mig.bankCash)) {
    const id = uid();
    acctRows.push({ id, orgId, code: `C${String(++bi).padStart(4, "0")}`, name: b2.name, type: "ASSET", subtype: "cash" });
    cashMap.set(guid, id);
  }
  await insertMany(prisma.account, acctRows);
  const fallbackCash = cashMap.values().next().value as string;

  const partyRows: Prisma.PartyCreateManyInput[] = [];
  const partyMap = new Map<string, string>();
  for (const [guid, p] of Object.entries(mig.parties)) {
    const id = uid();
    partyRows.push({ id, orgId, name: p.name, type: p.kind });
    partyMap.set(guid, id);
  }
  await insertMany(prisma.party, partyRows);

  const itemRows: Prisma.InventoryItemCreateManyInput[] = [];
  const itemMap = new Map<string, string>();
  const seenCode = new Set<string>();
  let ii = 0;
  for (const [guid, it] of Object.entries(mig.items)) {
    const id = uid();
    let code = it.code || `ITM${++ii}`;
    while (seenCode.has(code)) code = `${code}-${++ii}`;
    seenCode.add(code);
    itemRows.push({ id, orgId, code, name: it.name });
    itemMap.set(guid, id);
  }
  await insertMany(prisma.inventoryItem, itemRows);
  console.log(`Created: ${acctRows.length} accounts, ${cashMap.size} bank/cash, ${partyRows.length} parties, ${itemRows.length} items`);

  // --- Build documents in memory ------------------------------------------
  const entries: Prisma.JournalEntryCreateManyInput[] = [];
  const jlines: Prisma.JournalLineCreateManyInput[] = [];
  const receipts: Prisma.ReceiptCreateManyInput[] = [];
  const rlines: Prisma.ReceiptLineCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const plines: Prisma.PaymentLineCreateManyInput[] = [];
  const transfers: Prisma.InterAccountTransferCreateManyInput[] = [];
  const sinv: Prisma.SalesInvoiceCreateManyInput[] = [];
  const silines: Prisma.SalesInvoiceLineCreateManyInput[] = [];
  const pinv: Prisma.PurchaseInvoiceCreateManyInput[] = [];
  const pilines: Prisma.PurchaseInvoiceLineCreateManyInput[] = [];

  const counters: Record<string, number> = {};
  const num = (p: string) => `${p}-${String((counters[p] = (counters[p] ?? 0) + 1)).padStart(5, "0")}`;
  const resolve = (guid: string | null, fb: string) =>
    guid && acctMap.has(guid) ? acctMap.get(guid)! : fb;
  let td = 0n, tc = 0n;
  const addLine = (entryId: string, accountId: string, debit: bigint, credit: bigint, partyId: string | null, memo: string | null) => {
    jlines.push({ id: uid(), orgId, entryId, accountId, debit, credit, partyId, memo });
    td += debit; tc += credit;
  };

  for (const r of mig.receipts) {
    const total = r.lines.reduce((s, l) => s + B(l.amount), 0n);
    if (total <= 0n) continue;
    const cashId = (r.cash && cashMap.get(r.cash)) || fallbackCash;
    const partyId = (r.party && partyMap.get(r.party)) || null;
    const eid = uid(), did = uid();
    entries.push({ id: eid, orgId, entryDate: D(r.date), description: r.memo ?? null, reference: r.ref ?? null, sourceType: "receipt", sourceId: did });
    addLine(eid, cashId, total, 0n, null, null);
    for (const l of r.lines) {
      const id = resolve(l.acct, uncIncome);
      addLine(eid, id, 0n, B(l.amount), id === ar ? partyId : null, l.memo ?? null);
    }
    receipts.push({ id: did, orgId, number: num("REC"), date: D(r.date), reference: r.ref ?? null, description: r.memo ?? null, bankAccountId: cashId, partyId, total, journalEntryId: eid });
    for (const l of r.lines) rlines.push({ id: uid(), receiptId: did, accountId: resolve(l.acct, uncIncome), amount: B(l.amount), memo: l.memo ?? null });
  }

  for (const p of mig.payments) {
    const total = p.lines.reduce((s, l) => s + B(l.amount), 0n);
    if (total <= 0n) continue;
    const cashId = (p.cash && cashMap.get(p.cash)) || fallbackCash;
    const partyId = (p.lines.find((l) => l.party)?.party && partyMap.get(p.lines.find((l) => l.party)!.party!)) || null;
    const eid = uid(), did = uid();
    entries.push({ id: eid, orgId, entryDate: D(p.date), description: p.memo ?? null, reference: p.ref ?? null, sourceType: "payment", sourceId: did });
    addLine(eid, cashId, 0n, total, null, null);
    for (const l of p.lines) {
      const id = resolve(l.acct, uncExpense);
      const lp = (l.party && partyMap.get(l.party)) || partyId;
      addLine(eid, id, B(l.amount), 0n, id === ap ? lp : null, l.memo ?? null);
    }
    payments.push({ id: did, orgId, number: num("PAY"), date: D(p.date), reference: p.ref ?? null, description: p.memo ?? null, bankAccountId: cashId, partyId, total, journalEntryId: eid });
    for (const l of p.lines) plines.push({ id: uid(), paymentId: did, accountId: resolve(l.acct, uncExpense), amount: B(l.amount), memo: l.memo ?? null });
  }

  for (const t of mig.transfers) {
    const amount = B(t.amount);
    const from = t.from && cashMap.get(t.from); const to = t.to && cashMap.get(t.to);
    if (amount <= 0n || !from || !to || from === to) continue;
    const eid = uid(), did = uid();
    entries.push({ id: eid, orgId, entryDate: D(t.date), description: t.memo ?? null, reference: t.ref ?? null, sourceType: "transfer", sourceId: did });
    addLine(eid, to, amount, 0n, null, null);
    addLine(eid, from, 0n, amount, null, null);
    transfers.push({ id: did, orgId, number: num("TRF"), date: D(t.date), fromAccountId: from, toAccountId: to, amount, reference: t.ref ?? null, description: t.memo ?? null, journalEntryId: eid });
  }

  for (const s of mig.salesInvoices) {
    const partyId = s.customer && partyMap.get(s.customer);
    const lines = s.lines.filter((l) => l.lineTotal > 0);
    const total = lines.reduce((sum, l) => sum + B(l.lineTotal), 0n);
    if (!partyId || total <= 0n) continue;
    const eid = uid(), did = uid();
    entries.push({ id: eid, orgId, entryDate: D(s.date), reference: s.number ?? null, sourceType: "sales_invoice", sourceId: did });
    addLine(eid, ar, total, 0n, partyId, null);
    addLine(eid, sales, 0n, total, null, null);
    sinv.push({ id: did, orgId, number: num("INV"), partyId, date: D(s.date), reference: s.number ?? null, total, status: "unpaid", journalEntryId: eid });
    for (const l of lines) silines.push({ id: uid(), invoiceId: did, description: l.desc.slice(0, 200), quantity: new Prisma.Decimal(l.qty), unitPrice: B(Math.round(l.unitPrice)), lineTotal: B(l.lineTotal), accountId: sales });
  }

  let skippedPI = 0;
  for (const p of mig.purchaseInvoices) {
    const partyId = p.supplier && partyMap.get(p.supplier);
    if (!partyId || !p.xaf || p.xaf <= 0) { skippedPI++; continue; }
    const xaf = p.xaf; const tons = p.tons || 1; const total = B(xaf);
    const eid = uid(), did = uid();
    entries.push({ id: eid, orgId, entryDate: D(p.date), reference: p.number ?? null, sourceType: "purchase_invoice", description: p.desc ?? null, sourceId: did });
    addLine(eid, inv, total, 0n, null, null);
    addLine(eid, ap, 0n, total, partyId, null);
    pinv.push({ id: did, orgId, number: num("BILL"), partyId, date: D(p.date), supplierRef: p.number ?? null, notes: p.desc ?? null, total, status: "unpaid", journalEntryId: eid });
    pilines.push({ id: uid(), invoiceId: did, description: (p.desc ?? "Purchase").slice(0, 200), quantity: new Prisma.Decimal(tons), unitPrice: B(Math.round(xaf / tons)), lineTotal: total, accountId: inv });
  }
  if (skippedPI) console.log(`Skipped ${skippedPI} purchase invoices with no XAF value.`);

  // --- Bulk write in dependency order -------------------------------------
  console.log(`Writing ${entries.length} entries, ${jlines.length} journal lines, ${receipts.length} receipts, ${payments.length} payments, ${transfers.length} transfers, ${sinv.length} sales invoices, ${pinv.length} bills...`);
  await insertMany(prisma.journalEntry, entries);
  await insertMany(prisma.journalLine, jlines);
  await insertMany(prisma.receipt, receipts);
  await insertMany(prisma.receiptLine, rlines);
  await insertMany(prisma.payment, payments);
  await insertMany(prisma.paymentLine, plines);
  await insertMany(prisma.interAccountTransfer, transfers);
  await insertMany(prisma.salesInvoice, sinv);
  await insertMany(prisma.salesInvoiceLine, silines);
  await insertMany(prisma.purchaseInvoice, pinv);
  await insertMany(prisma.purchaseInvoiceLine, pilines);

  const sums = await prisma.journalLine.groupBy({ by: ["accountId"], where: { orgId }, _sum: { debit: true, credit: true } });
  let dd = 0n, cc = 0n;
  for (const s of sums) { dd += s._sum.debit ?? 0n; cc += s._sum.credit ?? 0n; }
  console.log(`\nIn-memory totals: debit ${td} credit ${tc}`);
  console.log(`DB trial balance: debit ${dd} credit ${cc}  ${dd === cc ? "BALANCED ✓" : "UNBALANCED ✗"}`);
  console.log(`Posted ${entries.length} documents.`);
}

async function wipe(orgId: string) {
  await prisma.$transaction([
    prisma.receiptLine.deleteMany({ where: { receipt: { orgId } } }),
    prisma.paymentLine.deleteMany({ where: { payment: { orgId } } }),
    prisma.salesInvoiceLine.deleteMany({ where: { invoice: { orgId } } }),
    prisma.purchaseInvoiceLine.deleteMany({ where: { invoice: { orgId } } }),
    prisma.receipt.deleteMany({ where: { orgId } }),
    prisma.payment.deleteMany({ where: { orgId } }),
    prisma.salesInvoice.deleteMany({ where: { orgId } }),
    prisma.purchaseInvoice.deleteMany({ where: { orgId } }),
    prisma.interAccountTransfer.deleteMany({ where: { orgId } }),
    prisma.journalLine.deleteMany({ where: { orgId } }),
    prisma.journalEntry.deleteMany({ where: { orgId } }),
    prisma.inventoryItem.deleteMany({ where: { orgId } }),
    prisma.party.deleteMany({ where: { orgId } }),
    prisma.account.deleteMany({ where: { orgId, code: { startsWith: "I" } } }),
    prisma.account.deleteMany({ where: { orgId, code: { startsWith: "E" } } }),
    prisma.account.deleteMany({ where: { orgId, code: { startsWith: "C" } } }),
  ]);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
