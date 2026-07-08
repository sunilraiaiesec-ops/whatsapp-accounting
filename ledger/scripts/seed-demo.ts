/**
 * ============================================================================
 *  DEMO COMPANY SEEDER — FICTIONAL DATA FOR TUTORIALS & MARKETING ONLY
 * ----------------------------------------------------------------------------
 *  INTERNAL NOTE: This script provisions three demonstration organizations that
 *  are meant to permanently live in the app for product demos, tutorial videos
 *  and marketing. EVERY organization, customer and supplier created here is
 *  FICTIONAL and invented solely for demonstration. None of them represent,
 *  copy or impersonate any real business or person; any resemblance is
 *  coincidental. Real consumer brand names are used only as representative
 *  catalog items so the books look realistic — no affiliation is implied.
 *
 *  The activity spans 2025-01-01 → today and is generated entirely through the
 *  app's real posting functions, so every ledger, subledger, inventory and tax
 *  balance reconciles exactly the way a genuine customer's books would.
 *
 *  Usage (writes to whatever DATABASE_URL points at — intended for prod Neon):
 *      SEED_DEMO=1 npx tsx scripts/seed-demo.ts
 *      SEED_DEMO=1 DEMO_RESEED=1 npx tsx scripts/seed-demo.ts   # purge + rebuild
 *      SEED_DEMO=1 npx tsx scripts/refresh-demo.ts              # roll dates only
 *      npm run seed:demo / npm run refresh:demo
 * ============================================================================
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner as _createOrganizationWithOwner } from "@/lib/org";
import { listAccounts as _listAccounts, signedBalance } from "@/lib/accounts";
import { createParty as _createParty } from "@/lib/parties";
import {
  createInventoryItem as _createInventoryItem,
  receiveGoods as _receiveGoods,
  writeOffInventory as _writeOffInventory,
  adjustInventory as _adjustInventory,
} from "@/lib/inventory";
import {
  createReceipt as _createReceipt,
  createPayment as _createPayment,
  createSalesInvoice as _createSalesInvoice,
  createSalesReceipt as _createSalesReceipt,
  createRefundReceipt as _createRefundReceipt,
  createPurchaseInvoice as _createPurchaseInvoice,
  createCreditNote as _createCreditNote,
  createInterAccountTransfer as _createInterAccountTransfer,
} from "@/lib/documents";
import { postEntry as _postEntry } from "@/lib/ledger";
import {
  trialBalance,
  balanceSheet,
  profitAndLoss,
  inventoryValuation,
  partyBalanceSummary,
} from "@/lib/reports";
import {
  CATALOG,
  FOOD_BEV,
  HOME_CARE,
  buildCustomers,
  buildSuppliers,
  type Category,
  type CatalogItem,
} from "./demo-data";
import { DEMO_PASSWORD } from "@/lib/demo-accounts";
import {
  listDemoOrgIds,
  refreshDemoAccountData,
} from "@/lib/demo-refresh";

if (!process.env.SEED_DEMO) {
  console.error(
    "\nRefusing to run without SEED_DEMO=1.\n" +
      "This seeder writes three full demo companies to the database.\n" +
      "  SEED_DEMO=1 npx tsx scripts/seed-demo.ts\n",
  );
  process.exit(1);
}

const DB = process.env.DATABASE_URL ?? "";
const RESEED = !!process.env.DEMO_RESEED;
const CURRENCY = "XAF"; // Cameroon — zero-decimal, amounts are whole francs.
const START = new Date(Date.UTC(2025, 0, 1));
const END = new Date();

const money = (n: number) => BigInt(Math.max(0, Math.round(n)));

// Deterministic PRNG so every rebuild produces identical books.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const choose = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const jitter = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);

// Neon (serverless Postgres) occasionally drops a connection mid-run. Because
// every posting call is its own transaction, a failed call has rolled back and
// is safe to replay with identical arguments — so wrap them all in a retry that
// backs off and lets Prisma reconnect on the next query.
async function withRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string }).code;
      const transient =
        code === "P1017" || code === "P1001" || code === "P1002" || code === "P2024" || code === "P2028" ||
        /closed the connection|Closed|ECONNRESET|Connection terminated|connection pool|timed out|reset by peer|Transaction (already closed|not found|API error)|expired transaction|Unable to start a transaction/i.test(msg);
      if (!transient) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, Math.min(8000, 400 * 2 ** i)));
    }
  }
  throw lastErr;
}

// Retrying wrappers keep call sites unchanged while surviving connection drops.
// Params are inferred; the return is a plain Promise (Prisma's PrismaPromise is
// only meaningful when awaited, which every call site does).
const createOrganizationWithOwner = (...a: Parameters<typeof _createOrganizationWithOwner>) => withRetry(() => _createOrganizationWithOwner(...a));
const listAccounts = (...a: Parameters<typeof _listAccounts>) => withRetry(() => _listAccounts(...a));
const createParty = (...a: Parameters<typeof _createParty>) => withRetry(() => _createParty(...a));
const createInventoryItem = (...a: Parameters<typeof _createInventoryItem>) => withRetry(() => _createInventoryItem(...a));
const receiveGoods = (...a: Parameters<typeof _receiveGoods>) => withRetry(() => _receiveGoods(...a));
const writeOffInventory = (...a: Parameters<typeof _writeOffInventory>) => withRetry(() => _writeOffInventory(...a));
const adjustInventory = (...a: Parameters<typeof _adjustInventory>) => withRetry(() => _adjustInventory(...a));
const createReceipt = (...a: Parameters<typeof _createReceipt>) => withRetry(() => _createReceipt(...a));
const createPayment = (...a: Parameters<typeof _createPayment>) => withRetry(() => _createPayment(...a));
const createSalesInvoice = (...a: Parameters<typeof _createSalesInvoice>) => withRetry(() => _createSalesInvoice(...a));
const createSalesReceipt = (...a: Parameters<typeof _createSalesReceipt>) => withRetry(() => _createSalesReceipt(...a));
const createRefundReceipt = (...a: Parameters<typeof _createRefundReceipt>) => withRetry(() => _createRefundReceipt(...a));
const createPurchaseInvoice = (...a: Parameters<typeof _createPurchaseInvoice>) => withRetry(() => _createPurchaseInvoice(...a));
const createCreditNote = (...a: Parameters<typeof _createCreditNote>) => withRetry(() => _createCreditNote(...a));
const createInterAccountTransfer = (...a: Parameters<typeof _createInterAccountTransfer>) => withRetry(() => _createInterAccountTransfer(...a));
const postEntry = (...a: Parameters<typeof _postEntry>) => withRetry(() => _postEntry(...a));

// Monthly demand multipliers — quiet Jan/Feb, back-to-school Aug/Sep, festive Nov/Dec.
const SEASON = [0.7, 0.75, 0.95, 1.0, 1.05, 1.0, 0.95, 1.15, 1.2, 1.05, 1.25, 1.5];

// ---------------------------------------------------------------------------
type CompanyConfig = {
  key: string;
  name: string;
  email: string;
  description: string;
  categories: Category[] | "spread";
  itemCount: number;
  weeklySales: number;
  openingBank: number;
  openingCash: number;
  openingPetty: number;
  openingFixedAssets: number;
};

const COMPANIES: CompanyConfig[] = [
  {
    key: "central",
    name: "Central Distribution Cameroon SARL",
    email: "central.demo@bantoobooks.com",
    description: "Large FMCG distributor supplying supermarkets",
    categories: "spread",
    itemCount: 100,
    weeklySales: 20,
    openingBank: 300_000_000,
    openingCash: 18_000_000,
    openingPetty: 2_000_000,
    openingFixedAssets: 70_000_000,
  },
  {
    key: "atlantic",
    name: "Atlantic Food Distribution SARL",
    email: "atlantic.demo@bantoobooks.com",
    description: "Food & beverage wholesaler supplying shops and restaurants",
    categories: FOOD_BEV,
    itemCount: 100,
    weeklySales: 22,
    openingBank: 220_000_000,
    openingCash: 14_000_000,
    openingPetty: 1_500_000,
    openingFixedAssets: 48_000_000,
  },
  {
    key: "prime",
    name: "Prime Consumer Supplies SARL",
    email: "prime.demo@bantoobooks.com",
    description: "Household products and personal care distributor",
    categories: HOME_CARE,
    itemCount: 100,
    weeklySales: 17,
    openingBank: 180_000_000,
    openingCash: 11_000_000,
    openingPetty: 1_200_000,
    openingFixedAssets: 42_000_000,
  },
];

// Round-robin across categories to give the broad distributor a balanced mix.
function spreadCatalog(limit: number): CatalogItem[] {
  const byCat = new Map<Category, CatalogItem[]>();
  for (const c of CATALOG) {
    const arr = byCat.get(c.category) ?? [];
    arr.push(c);
    byCat.set(c.category, arr);
  }
  const cats = [...byCat.keys()];
  const out: CatalogItem[] = [];
  let i = 0;
  while (out.length < limit) {
    const cat = cats[i % cats.length];
    const arr = byCat.get(cat)!;
    const idx = Math.floor(i / cats.length);
    if (idx < arr.length) out.push(arr[idx]);
    i++;
    if (i > CATALOG.length * 2) break;
  }
  return out.slice(0, limit);
}

function selectCatalog(cfg: CompanyConfig): CatalogItem[] {
  if (cfg.categories === "spread") return spreadCatalog(cfg.itemCount);
  return CATALOG.filter((c) => (cfg.categories as Category[]).includes(c.category)).slice(0, cfg.itemCount);
}

// ---------------------------------------------------------------------------
type ItemState = {
  id: string;
  price: bigint; // sale price
  cost: number; // base purchase cost (varies slightly per receipt)
  tax: number;
  reorder: number;
  stock: number;
};

type Company = {
  cfg: CompanyConfig;
  orgId: string;
  acc: Record<string, string>; // code -> accountId
  pettyId: string;
  cardId: string;
  accumDeprId: string;
  deprExpId: string;
  items: ItemState[];
  customers: string[];
  suppliers: string[];
  ar: Map<string, bigint>;
  ap: Map<string, bigint>;
  ccBalance: bigint;
  vatSettledOutput: bigint; // output VAT already remitted (Dr to Tax payable)
  vatSettledInput: bigint; // input VAT already offset (Cr from Tax recoverable)
  counters: Record<string, number>;
  rng: () => number;
};

function bump(c: Company, k: string, n = 1) {
  c.counters[k] = (c.counters[k] ?? 0) + n;
}

// A random date inside a given week, clamped to the seeding window.
function dayInWeek(rng: () => number, weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + Math.floor(rng() * 6));
  d.setUTCHours(9, 0, 0, 0);
  if (d < START) return new Date(START);
  if (d > END) return new Date(END);
  return d;
}

// --- Purge (only with DEMO_RESEED=1) ----------------------------------------
// Delete every org-scoped row in FK-safe order. Documents cascade their own
// lines, and clearing journal entries first frees the accounts they reference.
async function purgeOrg(orgId: string) {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await withRetry(fn);
    } catch (e) {
      console.warn(`  (purge) step failed for org ${orgId}: ${String(e)}`);
    }
  };
  await del(() => prisma.journalEntry.deleteMany({ where: { orgId } }));
  await del(() => prisma.receipt.deleteMany({ where: { orgId } }));
  await del(() => prisma.payment.deleteMany({ where: { orgId } }));
  await del(() => prisma.salesInvoice.deleteMany({ where: { orgId } }));
  await del(() => prisma.salesReceipt.deleteMany({ where: { orgId } }));
  await del(() => prisma.refundReceipt.deleteMany({ where: { orgId } }));
  await del(() => prisma.purchaseInvoice.deleteMany({ where: { orgId } }));
  await del(() => prisma.creditNote.deleteMany({ where: { orgId } }));
  await del(() => prisma.debitNote.deleteMany({ where: { orgId } }));
  await del(() => prisma.goodsReceipt.deleteMany({ where: { orgId } }));
  await del(() => prisma.inventoryWriteOff.deleteMany({ where: { orgId } }));
  await del(() => prisma.inventoryAdjustment.deleteMany({ where: { orgId } }));
  await del(() => prisma.interAccountTransfer.deleteMany({ where: { orgId } }));
  await del(() => prisma.documentSequence.deleteMany({ where: { orgId } }));
  await del(() => prisma.inventoryItem.deleteMany({ where: { orgId } }));
  await del(() => prisma.party.deleteMany({ where: { orgId } }));
  await del(() => prisma.account.deleteMany({ where: { orgId } }));
  await del(() => prisma.membership.deleteMany({ where: { orgId } }));
  await del(() => prisma.organization.delete({ where: { id: orgId } }));
}

async function purgeExisting(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const memberships = await prisma.membership.findMany({ where: { userId: user.id }, select: { orgId: true } });
  for (const m of memberships) await purgeOrg(m.orgId);
  await prisma.user.delete({ where: { id: user.id } }).catch((e) => console.warn(`  (purge) user ${email}: ${String(e)}`));
}

// --- Setup a single company --------------------------------------------------
async function setupCompany(cfg: CompanyConfig, index: number): Promise<Company> {
  const rng = makeRng(0x51ed270b ^ (index * 2654435761));

  const { org, user } = await createOrganizationWithOwner({
    name: `Administrator — ${cfg.name}`,
    email: cfg.email,
    password: DEMO_PASSWORD,
    orgName: cfg.name,
    baseCurrency: CURRENCY,
  });
  // Demo logins should work immediately without the verification prompt.
  await withRetry(() => prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } }));

  const accounts = await listAccounts(org.id);
  const acc: Record<string, string> = {};
  for (const a of accounts) acc[a.code] = a.id;

  // Extra accounts a real distributor keeps beyond the starter chart.
  const petty = await withRetry(() => prisma.account.create({
    data: { orgId: org.id, code: "1020", name: "Petty cash", type: "ASSET", subtype: "cash", currency: CURRENCY },
  }));
  const card = await withRetry(() => prisma.account.create({
    data: { orgId: org.id, code: "2200", name: "Company credit card", type: "LIABILITY", subtype: "credit_card", currency: CURRENCY },
  }));
  const accumDepr = await withRetry(() => prisma.account.create({
    data: { orgId: org.id, code: "1600", name: "Accumulated depreciation", type: "ASSET", subtype: "fixed_asset", currency: CURRENCY },
  }));
  const deprExp = await withRetry(() => prisma.account.create({
    data: { orgId: org.id, code: "6400", name: "Depreciation expense", type: "EXPENSE", currency: CURRENCY },
  }));

  // --- Items ---
  const chosen = selectCatalog(cfg);
  const items: ItemState[] = [];
  for (const ci of chosen) {
    const reorder = 20 + Math.floor(rng() * 30);
    const item = await createInventoryItem(org.id, {
      code: ci.sku,
      name: ci.name,
      salePrice: money(ci.price),
      barcode: ci.barcode,
      unit: ci.unit,
      reorderLevel: reorder,
      defaultTaxRate: ci.tax,
    });
    items.push({ id: item.id, price: money(ci.price), cost: ci.cost, tax: ci.tax, reorder, stock: 0 });
  }

  // --- Parties (fictional). Offset the generator per company so names differ. ---
  const custNames = buildCustomers(120 + index * 20).slice(index * 10, index * 10 + 120);
  const customers: string[] = [];
  for (const name of custNames) {
    customers.push((await createParty(org.id, { name, type: "customer" })).id);
  }
  const suppliers: string[] = [];
  for (const s of buildSuppliers(40)) {
    suppliers.push((await createParty(org.id, { name: s.name, type: "supplier" })).id);
  }

  const c: Company = {
    cfg,
    orgId: org.id,
    acc,
    pettyId: petty.id,
    cardId: card.id,
    accumDeprId: accumDepr.id,
    deprExpId: deprExp.id,
    items,
    customers,
    suppliers,
    ar: new Map(),
    ap: new Map(),
    ccBalance: 0n,
    vatSettledOutput: 0n,
    vatSettledInput: 0n,
    counters: {},
    rng,
  };

  // --- Opening balances (owner capital) at Jan 1, 2025 ---
  await postEntry({
    orgId: org.id,
    entryDate: START,
    description: "Opening balances — owner capital contribution",
    sourceType: "manual",
    lines: [
      { accountId: acc["1010"], debit: money(cfg.openingBank) },
      { accountId: acc["1000"], debit: money(cfg.openingCash) },
      { accountId: petty.id, debit: money(cfg.openingPetty) },
      { accountId: acc["1500"], debit: money(cfg.openingFixedAssets) },
      {
        accountId: acc["3000"],
        credit: money(cfg.openingBank + cfg.openingCash + cfg.openingPetty + cfg.openingFixedAssets),
      },
    ],
  });
  bump(c, "openingBalance");

  // --- Opening stock via goods receipts (Dr Inventory / Cr AP) ---
  const openDate = new Date(Date.UTC(2025, 0, 2));
  let batch: { itemId: string; quantity: string; unitCost: bigint }[] = [];
  let batchSupplier = choose(rng, suppliers);
  const flush = async (date: Date) => {
    if (batch.length === 0) return;
    await receiveGoods(c.orgId, { partyId: batchSupplier, date, notes: "Opening stock", lines: batch });
    const total = batch.reduce((s, l) => s + BigInt(l.quantity) * l.unitCost, 0n);
    c.ap.set(batchSupplier, (c.ap.get(batchSupplier) ?? 0n) + total);
    bump(c, "goodsReceipt");
    batch = [];
    batchSupplier = choose(rng, suppliers);
  };
  for (const it of items) {
    const qty = it.reorder * 3 + Math.floor(rng() * it.reorder);
    const unitCost = money(it.cost * jitter(rng, 0.9, 0.96));
    batch.push({ itemId: it.id, quantity: String(qty), unitCost });
    it.stock += qty;
    if (batch.length >= 12) await flush(openDate);
  }
  await flush(openDate);

  // Pay ~70% of the opening supplier balances a few days later.
  const payDate = new Date(Date.UTC(2025, 0, 6));
  for (const sup of suppliers) {
    const bal = c.ap.get(sup) ?? 0n;
    if (bal <= 0n) continue;
    const pay = (bal * 7n) / 10n;
    if (pay <= 0n) continue;
    await createPayment(c.orgId, { date: payDate, bankAccountId: acc["1010"], partyId: sup, lines: [{ accountId: acc["2000"], amount: pay }] });
    c.ap.set(sup, bal - pay);
    bump(c, "supplierPayment");
  }

  return c;
}

// --- Weekly activity ---------------------------------------------------------
async function replenish(c: Company, date: Date) {
  const rng = c.rng;
  const low = c.items.filter((it) => it.stock <= it.reorder);
  if (low.length === 0) return;
  let batch: { itemId: string; quantity: string; unitCost: bigint }[] = [];
  let supplier = choose(rng, c.suppliers);
  const flush = async () => {
    if (batch.length === 0) return;
    await receiveGoods(c.orgId, { partyId: supplier, date, notes: "Stock replenishment", lines: batch });
    const total = batch.reduce((s, l) => s + BigInt(l.quantity) * l.unitCost, 0n);
    c.ap.set(supplier, (c.ap.get(supplier) ?? 0n) + total);
    bump(c, "goodsReceipt");
    batch = [];
    supplier = choose(rng, c.suppliers);
  };
  for (const it of low) {
    const target = it.reorder * 4;
    const qty = target - it.stock + Math.floor(rng() * it.reorder);
    if (qty <= 0) continue;
    const unitCost = money(it.cost * jitter(rng, 0.9, 0.98));
    batch.push({ itemId: it.id, quantity: String(qty), unitCost });
    it.stock += qty;
    if (batch.length >= 12) await flush();
  }
  await flush();
}

type SaleLine = { description: string; quantity: string; unitPrice: bigint; accountId: string; itemId: string; taxRate: number };

function buildSaleLines(c: Company, salesAcc: string): SaleLine[] {
  const rng = c.rng;
  const inStock = c.items.filter((it) => it.stock > 0);
  if (inStock.length === 0) return [];
  const nLines = 1 + Math.floor(Math.pow(rng(), 1.6) * 4); // mostly 1-2, sometimes up to 4
  const lines: SaleLine[] = [];
  const used = new Set<string>();
  for (let i = 0; i < nLines; i++) {
    const it = choose(rng, inStock);
    if (used.has(it.id) || it.stock <= 0) continue;
    used.add(it.id);
    const qty = Math.max(1, Math.min(it.stock, 3 + Math.floor(rng() * 22)));
    const unitPrice = money(Number(it.price) * jitter(rng, 0.97, 1.05));
    lines.push({ description: "Wholesale sale", quantity: String(qty), unitPrice, accountId: salesAcc, itemId: it.id, taxRate: it.tax });
    it.stock -= qty;
  }
  return lines;
}

function lineTotal(lines: SaleLine[]): bigint {
  return lines.reduce((s, l) => {
    const net = BigInt(l.quantity) * l.unitPrice;
    const tax = BigInt(Math.round((Number(net) * l.taxRate) / 100));
    return s + net + tax;
  }, 0n);
}

async function weekOfSales(c: Company, weekStart: Date, count: number) {
  const rng = c.rng;
  const salesAcc = c.acc["4000"];
  for (let i = 0; i < count; i++) {
    const date = dayInWeek(rng, weekStart);
    const lines = buildSaleLines(c, salesAcc);
    if (lines.length === 0) return;
    const total = lineTotal(lines);
    const party = choose(rng, c.customers);
    if (rng() < 0.55) {
      // Cash sale — most to the bank, some to the cash drawer.
      const deposit = rng() < 0.75 ? c.acc["1010"] : c.acc["1000"];
      await createSalesReceipt(c.orgId, { bankAccountId: deposit, partyId: party, date, lines });
      bump(c, "salesReceipt");
    } else {
      const due = new Date(date);
      // Mix of short, medium and longer credit terms so the seeder does not
      // leave hundreds of identical +30-day invoices that all go overdue.
      if (rng() < 0.2) {
        due.setUTCDate(due.getUTCDate() + Math.floor(jitter(rng, 7, 21)));
      } else if (rng() < 0.45) {
        due.setUTCDate(due.getUTCDate() + Math.floor(jitter(rng, 22, 45)));
      } else {
        due.setUTCDate(due.getUTCDate() + 30);
      }
      await createSalesInvoice(c.orgId, { partyId: party, date, dueDate: due, lines });
      c.ar.set(party, (c.ar.get(party) ?? 0n) + total);
      bump(c, "salesInvoice");
    }
    bump(c, "cogsPostings");
  }
}

async function collectFromCustomers(c: Company, weekStart: Date) {
  const rng = c.rng;
  const owing = c.customers.filter((p) => (c.ar.get(p) ?? 0n) > 0n);
  if (owing.length === 0) return;
  const n = Math.min(owing.length, 5 + Math.floor(rng() * 5)); // ~5-9 collections/week
  for (let i = 0; i < n; i++) {
    const party = choose(rng, owing);
    const bal = c.ar.get(party) ?? 0n;
    if (bal <= 0n) continue;
    const frac = rng() < 0.7 ? 1 : jitter(rng, 0.4, 0.9);
    const pay = frac >= 1 ? bal : BigInt(Math.round(Number(bal) * frac));
    if (pay <= 0n) continue;
    const date = dayInWeek(rng, weekStart);
    const into = rng() < 0.85 ? c.acc["1010"] : c.acc["1000"];
    await createReceipt(c.orgId, { date, bankAccountId: into, partyId: party, lines: [{ accountId: c.acc["1100"], amount: pay }] });
    c.ar.set(party, bal - pay);
    bump(c, "customerPayment");
  }
}

async function payToSuppliers(c: Company, weekStart: Date) {
  const rng = c.rng;
  const owed = c.suppliers.filter((p) => (c.ap.get(p) ?? 0n) > 0n);
  if (owed.length === 0) return;
  const n = Math.min(owed.length, 3 + Math.floor(rng() * 4)); // ~3-6 payments/week
  for (let i = 0; i < n; i++) {
    const party = choose(rng, owed);
    const bal = c.ap.get(party) ?? 0n;
    if (bal <= 0n) continue;
    const frac = rng() < 0.6 ? 1 : jitter(rng, 0.4, 0.9);
    const pay = frac >= 1 ? bal : BigInt(Math.round(Number(bal) * frac));
    if (pay <= 0n) continue;
    const date = dayInWeek(rng, weekStart);
    await createPayment(c.orgId, { date, bankAccountId: c.acc["1010"], partyId: party, lines: [{ accountId: c.acc["2000"], amount: pay }] });
    c.ap.set(party, bal - pay);
    bump(c, "supplierPayment");
  }
}

async function occasionalOps(c: Company, weekStart: Date) {
  const rng = c.rng;
  const salesAcc = c.acc["4000"];

  // Sales return (~1 in 3 weeks): a customer returns goods → restock + reverse COGS.
  if (rng() < 0.33) {
    const it = choose(rng, c.items);
    const qty = 1 + Math.floor(rng() * 4);
    const date = dayInWeek(rng, weekStart);
    const lines = [{ description: "Returned goods", quantity: String(qty), unitPrice: it.price, accountId: salesAcc, itemId: it.id, taxRate: it.tax }];
    if (rng() < 0.5) {
      await createRefundReceipt(c.orgId, { bankAccountId: c.acc["1010"], partyId: choose(rng, c.customers), date, lines });
      bump(c, "refundReceipt");
    } else {
      const party = choose(rng, c.customers);
      await createCreditNote(c.orgId, { partyId: party, date, lines });
      const net = BigInt(qty) * it.price;
      const tax = BigInt(Math.round((Number(net) * it.tax) / 100));
      c.ar.set(party, (c.ar.get(party) ?? 0n) - (net + tax));
      bump(c, "creditNote");
    }
    it.stock += qty;
  }

  // Spoilage / damage write-off (~1 in 4 weeks).
  if (rng() < 0.25) {
    const inStock = c.items.filter((it) => it.stock > 2);
    if (inStock.length > 0) {
      const it = choose(rng, inStock);
      const qty = 1 + Math.floor(rng() * 3);
      await writeOffInventory(c.orgId, { date: dayInWeek(rng, weekStart), expenseAccountId: c.acc["6000"], notes: "Damaged / expired stock", lines: [{ itemId: it.id, quantity: String(qty) }] });
      it.stock -= qty;
      bump(c, "writeOff");
    }
  }

  // Stock count adjustment (~1 in 5 weeks).
  if (rng() < 0.2) {
    const it = choose(rng, c.items);
    const delta = Math.floor(rng() * 9) - 4;
    const next = Math.max(0, it.stock + delta);
    if (next !== it.stock) {
      const adjAcc = rng() < 0.5 ? c.acc["6000"] : c.acc["4900"];
      await adjustInventory(c.orgId, { date: dayInWeek(rng, weekStart), adjustmentAccountId: adjAcc, notes: "Physical stock count", lines: [{ itemId: it.id, newQuantity: String(next) }] });
      it.stock = next;
      bump(c, "inventoryAdjustment");
    }
  }

  // Deposit cash takings into the bank (most weeks).
  if (rng() < 0.7) {
    const amount = money(jitter(rng, 300_000, 3_000_000));
    await createInterAccountTransfer(c.orgId, { date: dayInWeek(rng, weekStart), fromAccountId: c.acc["1000"], toAccountId: c.acc["1010"], amount, description: "Cash takings deposited" });
    bump(c, "bankTransfer");
  }

  // Top up petty cash from the bank (~1 in 3 weeks).
  if (rng() < 0.33) {
    const amount = money(jitter(rng, 100_000, 500_000));
    await createInterAccountTransfer(c.orgId, { date: dayInWeek(rng, weekStart), fromAccountId: c.acc["1010"], toAccountId: c.pettyId, amount, description: "Petty cash top-up" });
    bump(c, "bankTransfer");
  }

  // Fuel / sundry expense on the company credit card (~half of weeks).
  if (rng() < 0.5) {
    const amount = money(jitter(rng, 80_000, 900_000));
    const exp = rng() < 0.5 ? c.acc["6300"] : c.acc["6000"];
    await createPayment(c.orgId, { date: dayInWeek(rng, weekStart), bankAccountId: c.cardId, lines: [{ accountId: exp, amount }] });
    c.ccBalance += amount;
    bump(c, "creditCardCharge");
  }

  // Small petty-cash expense (most weeks).
  if (rng() < 0.65) {
    const amount = money(jitter(rng, 20_000, 200_000));
    await createPayment(c.orgId, { date: dayInWeek(rng, weekStart), bankAccountId: c.pettyId, lines: [{ accountId: c.acc["6000"], amount, memo: "Office sundries" }] });
    bump(c, "expensePayment");
  }
}

// --- Month-end recurring entries --------------------------------------------
async function monthEnd(c: Company, monthDate: Date) {
  const rng = c.rng;
  const d = new Date(monthDate);

  // Rent (paid from bank).
  const rent = money(jitter(rng, 850_000, 1_300_000));
  await createPayment(c.orgId, { date: d, bankAccountId: c.acc["1010"], lines: [{ accountId: c.acc["6200"], amount: rent, memo: "Monthly warehouse rent" }] });
  bump(c, "expensePayment");

  // Payroll (summary): salaries & wages paid from bank.
  const payroll = money(jitter(rng, 2_600_000, 3_400_000));
  await postEntry({
    orgId: c.orgId,
    entryDate: d,
    description: "Monthly payroll (summary)",
    sourceType: "manual",
    lines: [
      { accountId: c.acc["6100"], debit: payroll },
      { accountId: c.acc["1010"], credit: payroll },
    ],
  });
  bump(c, "payroll");

  // Freight & logistics bill from a supplier, carrying recoverable input VAT.
  const freightNet = money(jitter(rng, 700_000, 1_400_000));
  const freightSupplier = choose(rng, c.suppliers);
  await createPurchaseInvoice(c.orgId, {
    partyId: freightSupplier,
    date: d,
    notes: "Inbound freight & logistics",
    lines: [{ description: "Freight & clearing", quantity: "1", unitPrice: freightNet, accountId: c.acc["6300"], taxRate: 19.25 }],
  });
  const freightTax = money(Number(freightNet) * 0.1925);
  c.ap.set(freightSupplier, (c.ap.get(freightSupplier) ?? 0n) + freightNet + freightTax);
  bump(c, "purchaseInvoice");

  // Bank charges.
  const charges = money(jitter(rng, 40_000, 110_000));
  await createPayment(c.orgId, { date: d, bankAccountId: c.acc["1010"], lines: [{ accountId: c.acc["6900"], amount: charges, memo: "Bank fees" }] });
  bump(c, "expensePayment");

  // Depreciation of fixed assets (straight line, ~10 year life).
  const depr = money(c.cfg.openingFixedAssets / 120);
  await postEntry({
    orgId: c.orgId,
    entryDate: d,
    description: "Monthly depreciation",
    sourceType: "manual",
    lines: [
      { accountId: c.deprExpId, debit: depr },
      { accountId: c.accumDeprId, credit: depr },
    ],
  });
  bump(c, "depreciation");

  // Month-end utilities.
  const util = money(jitter(rng, 120_000, 350_000));
  await createPayment(c.orgId, { date: d, bankAccountId: c.acc["1010"], lines: [{ accountId: c.acc["6000"], amount: util, memo: "Month-end utilities & adjustments" }] });
  bump(c, "monthEndAdjustment");

  // Pay down part of the credit card once a month.
  if (c.ccBalance > 0n) {
    const pay = c.ccBalance > 1n ? BigInt(Math.round(Number(c.ccBalance) * jitter(rng, 0.6, 1.0))) : c.ccBalance;
    const amount = pay > c.ccBalance ? c.ccBalance : pay;
    if (amount > 0n) {
      await createInterAccountTransfer(c.orgId, { date: d, fromAccountId: c.acc["1010"], toAccountId: c.cardId, amount, description: "Credit card payment" });
      c.ccBalance -= amount;
      bump(c, "creditCardPaydown");
    }
  }

  // VAT return: offset recoverable input VAT against output VAT and remit the
  // net to the tax authority, clearing both tax accounts (as a real filer does).
  const outBal = await controlBalance(c.orgId, c.acc["2100"], "LIABILITY");
  const inBal = await controlBalance(c.orgId, c.acc["1300"], "ASSET");
  if (outBal > 0n) {
    const net = outBal - inBal;
    const lines: { accountId: string; debit?: bigint; credit?: bigint }[] = [
      { accountId: c.acc["2100"], debit: outBal },
    ];
    if (inBal > 0n) lines.push({ accountId: c.acc["1300"], credit: inBal });
    if (net > 0n) lines.push({ accountId: c.acc["1010"], credit: net });
    else if (net < 0n) lines.push({ accountId: c.acc["1010"], debit: -net });
    await postEntry({ orgId: c.orgId, entryDate: d, description: "VAT return — remittance to tax authority", sourceType: "manual", lines });
    c.vatSettledOutput += outBal;
    c.vatSettledInput += inBal;
    bump(c, "vatRemittance");
  }
}

async function reconcileInvoiceStatuses(orgId: string) {
  const unpaid = await withRetry(() =>
    prisma.salesInvoice.count({ where: { orgId, status: { not: "paid" }, dueDate: { not: null } } }),
  );
  const keepOpen = 25;
  const excess = unpaid - keepOpen;
  if (excess <= 0) return;
  const old = await withRetry(() =>
    prisma.salesInvoice.findMany({
      where: { orgId, status: { not: "paid" } },
      orderBy: { date: "asc" },
      take: excess,
      select: { id: true },
    }),
  );
  if (old.length === 0) return;
  await withRetry(() =>
    prisma.salesInvoice.updateMany({
      where: { id: { in: old.map((o) => o.id) } },
      data: { status: "paid" },
    }),
  );
}

// --- Drive one company through the full window ------------------------------
async function driveCompany(c: Company) {
  const rng = c.rng;
  // Start from the first Monday on/after Jan 6, 2025 (opening handled already).
  const cursor = new Date(Date.UTC(2025, 0, 6));
  let lastMonth = 0; // January already has opening entries; run month-end from Feb.

  while (cursor <= END) {
    const month = cursor.getUTCMonth();
    const season = SEASON[month];
    const salesThisWeek = Math.max(3, Math.round(c.cfg.weeklySales * season * jitter(rng, 0.8, 1.2)));

    await replenish(c, dayInWeek(rng, cursor));
    await weekOfSales(c, cursor, salesThisWeek);
    await collectFromCustomers(c, cursor);
    await payToSuppliers(c, cursor);
    await occasionalOps(c, cursor);

    await reconcileInvoiceStatuses(c.orgId);

    // Fire month-end entries once, on the first week we enter a new month.
    if (month !== lastMonth) {
      const monthEndDate = new Date(Date.UTC(cursor.getUTCFullYear(), month, Math.min(28, cursor.getUTCDate())));
      if (monthEndDate >= START && monthEndDate <= END) await monthEnd(c, monthEndDate);
      lastMonth = month;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
}

// --- Verification ------------------------------------------------------------
type Check = { name: string; pass: boolean; detail: string };

async function controlBalance(orgId: string, accountId: string, type: "ASSET" | "LIABILITY"): Promise<bigint> {
  const agg = await withRetry(() => prisma.journalLine.aggregate({ where: { orgId, accountId }, _sum: { debit: true, credit: true } }));
  return signedBalance(type, agg._sum.debit ?? 0n, agg._sum.credit ?? 0n);
}

async function verify(c: Company): Promise<Check[]> {
  const orgId = c.orgId;
  const checks: Check[] = [];

  const unbalanced = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "entryId" FROM journal_lines WHERE "orgId" = ${orgId}
      GROUP BY "entryId" HAVING SUM(debit) <> SUM(credit)
    ) t`;
  checks.push({ name: "per-entry balanced", pass: Number(unbalanced[0].n) === 0, detail: `${Number(unbalanced[0].n)} unbalanced` });

  const tb = await trialBalance(orgId);
  checks.push({ name: "trial balance", pass: tb.balanced, detail: `Dr ${tb.totalDebit} = Cr ${tb.totalCredit}` });

  const bs = await balanceSheet(orgId);
  checks.push({ name: "balance sheet A = L + E", pass: bs.balanced, detail: `A ${bs.totalAssets} / L ${bs.totalLiabilities} / E ${bs.totalEquity}` });

  // Inventory subledger vs control.
  const items = await prisma.inventoryItem.findMany({ where: { orgId } });
  const sumValue = items.reduce((t, it) => t + it.valueOnHand, 0n);
  const invLedger = await controlBalance(orgId, c.acc["1200"], "ASSET");
  checks.push({ name: "inventory subledger == control", pass: sumValue === invLedger, detail: `items ${sumValue} vs ledger ${invLedger}` });
  const negQty = items.filter((it) => new Prisma.Decimal(it.qtyOnHand).lt(0)).length;
  checks.push({ name: "no negative stock", pass: negQty === 0, detail: `${negQty} negative items` });
  const val = await inventoryValuation(orgId);
  checks.push({ name: "valuation report == control", pass: val.total === invLedger, detail: `report ${val.total} vs ledger ${invLedger}` });

  // AR subledger vs control.
  const arCtl = await controlBalance(orgId, c.acc["1100"], "ASSET");
  const cust = await partyBalanceSummary(orgId, "customer");
  checks.push({ name: "AR subledger == control", pass: cust.total === arCtl, detail: `customers ${cust.total} vs ledger ${arCtl}` });

  // AP subledger vs control.
  const apCtl = await controlBalance(orgId, c.acc["2000"], "LIABILITY");
  const sup = await partyBalanceSummary(orgId, "supplier");
  checks.push({ name: "AP subledger == control", pass: sup.total === apCtl, detail: `suppliers ${sup.total} vs ledger ${apCtl}` });

  // Tax accounts tie out to tax recorded on documents.
  const s = (n: bigint | null | undefined) => n ?? 0n;
  const [siTax, srTax, cnTax, rrTax, piTax, dnTax] = await Promise.all([
    prisma.salesInvoiceLine.aggregate({ where: { invoice: { orgId } }, _sum: { taxAmount: true } }),
    prisma.salesReceiptLine.aggregate({ where: { receipt: { orgId } }, _sum: { taxAmount: true } }),
    prisma.creditNoteLine.aggregate({ where: { note: { orgId } }, _sum: { taxAmount: true } }),
    prisma.refundReceiptLine.aggregate({ where: { refund: { orgId } }, _sum: { taxAmount: true } }),
    prisma.purchaseInvoiceLine.aggregate({ where: { invoice: { orgId } }, _sum: { taxAmount: true } }),
    prisma.debitNoteLine.aggregate({ where: { note: { orgId } }, _sum: { taxAmount: true } }),
  ]);
  // Ledger balances net off the monthly VAT remittances we posted, so subtract
  // the settled amounts from the document-derived expectation.
  const expectedPayable = s(siTax._sum.taxAmount) + s(srTax._sum.taxAmount) - s(cnTax._sum.taxAmount) - s(rrTax._sum.taxAmount) - c.vatSettledOutput;
  const expectedRecoverable = s(piTax._sum.taxAmount) - s(dnTax._sum.taxAmount) - c.vatSettledInput;
  const payLedger = await controlBalance(orgId, c.acc["2100"], "LIABILITY");
  const recAcc = await prisma.account.findFirst({ where: { orgId, subtype: "tax_recoverable" } });
  const recLedger = recAcc ? await controlBalance(orgId, recAcc.id, "ASSET") : 0n;
  checks.push({ name: "tax payable == output tax", pass: payLedger === expectedPayable, detail: `ledger ${payLedger} vs docs ${expectedPayable}` });
  checks.push({ name: "tax recoverable == input tax", pass: recLedger === expectedRecoverable, detail: `ledger ${recLedger} vs docs ${expectedRecoverable}` });

  return checks;
}

// --- Main --------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  console.log(`\n=== Demo company seeder ===`);
  console.log(`DB: ${DB.replace(/:[^:@/]+@/, ":****@")}`);
  console.log(`Window: ${START.toISOString().slice(0, 10)} → ${END.toISOString().slice(0, 10)}\n`);

  if (RESEED) {
    console.log("DEMO_RESEED=1 — purging any existing demo companies…");
    for (const cfg of COMPANIES) await purgeExisting(cfg.email);
  }

  const toSeed: { cfg: CompanyConfig; i: number }[] = [];
  for (let i = 0; i < COMPANIES.length; i++) {
    const cfg = COMPANIES[i];
    const existing = await withRetry(() => prisma.user.findUnique({ where: { email: cfg.email } }));
    if (existing && !RESEED) {
      console.log(`• ${cfg.name}: admin ${cfg.email} already exists — skipping (use DEMO_RESEED=1 to rebuild).`);
      continue;
    }
    toSeed.push({ cfg, i });
  }

  // Seed the (independent, isolated) companies in parallel to hide network
  // latency; each company posts sequentially within itself.
  console.log(`Provisioning ${toSeed.length} companies in parallel…`);
  const companies = await Promise.all(
    toSeed.map(async ({ cfg, i }) => {
      const c = await setupCompany(cfg, i);
      process.stdout.write(`  ${cfg.name}: setup done (${c.items.length} items, ${c.customers.length} customers, ${c.suppliers.length} suppliers) — posting history…\n`);
      await driveCompany(c);
      const entries = await withRetry(() => prisma.journalEntry.count({ where: { orgId: c.orgId } }));
      process.stdout.write(`  ✓ ${cfg.name}: ${entries} journal entries\n`);
      return c;
    }),
  );

  const seededOrgIds = new Set(companies.map((c) => c.orgId));

  // Refresh every existing demo org (including ones we skipped because they
  // already exist) so dashboards stay current without a full DEMO_RESEED.
  const allDemoOrgIds = await listDemoOrgIds();
  const toRefresh = allDemoOrgIds.filter((id) => !seededOrgIds.has(id));
  if (toRefresh.length > 0) {
    console.log(`\nRefreshing ${toRefresh.length} existing demo org(s)…`);
    for (const orgId of toRefresh) {
      const result = await refreshDemoAccountData(orgId);
      if (result) {
        console.log(
          `  ✓ ${orgId}: shifted ${result.shiftedDays}d, ${result.unpaidInvoices} reminders (${result.overdueInvoices} overdue), ${result.lowStockItems} low-stock`,
        );
      }
    }
  }

  if (companies.length === 0 && toRefresh.length === 0) {
    console.log("\nNothing to do — no demo companies found.\n");
    await prisma.$disconnect();
    return;
  }

  // Align freshly seeded orgs to today's dashboard profile.
  for (const c of companies) {
    const result = await refreshDemoAccountData(c.orgId);
    if (result) {
      console.log(
        `  ✓ ${c.cfg.name}: ${result.unpaidInvoices} reminders (${result.overdueInvoices} overdue), ${result.lowStockItems} low-stock`,
      );
    }
  }

  if (companies.length === 0) {
    console.log("\nExisting demo companies refreshed.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nGeneration finished in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

  // --- Report ---------------------------------------------------------------
  console.log("\n================ DEMO SEED REPORT ================\n");
  console.log("NOTE: all companies, customers and suppliers below are FICTIONAL demo data.\n");

  let failed = 0;
  for (const c of companies) {
    const entries = await withRetry(() => prisma.journalEntry.count({ where: { orgId: c.orgId } }));
    const bs = await withRetry(() => balanceSheet(c.orgId));
    const pnl = await withRetry(() => profitAndLoss(c.orgId, START, END));
    console.log(`── ${c.cfg.name} ──`);
    console.log(`   ${c.cfg.description}`);
    console.log(`   Journal entries: ${entries}`);
    console.log(`   Documents: ${Object.entries(c.counters).map(([k, v]) => `${k}:${v}`).join(", ")}`);
    console.log(`   Total assets: ${bs.totalAssets.toLocaleString()} ${CURRENCY}  |  Revenue: ${pnl.totalIncome.toLocaleString()} ${CURRENCY}  |  Net profit: ${pnl.netProfit.toLocaleString()} ${CURRENCY}`);
    const checks = await withRetry(() => verify(c));
    for (const ch of checks) {
      if (!ch.pass) failed++;
      console.log(`     ${ch.pass ? "✓" : "✗ FAIL"}  ${ch.name.padEnd(30)} ${ch.detail}`);
    }
    console.log("");
  }

  console.log("================ DEMO LOGIN CREDENTIALS ================\n");
  for (const c of companies) {
    console.log(`${c.cfg.name}`);
    console.log(`  Email:    ${c.cfg.email}`);
    console.log(`  Password: ${DEMO_PASSWORD}`);
    console.log("");
  }

  console.log("================ INTEGRITY SUMMARY ================");
  console.log(`   Companies seeded: ${companies.length}`);
  console.log(`   Integrity checks failed: ${failed}`);
  console.log(`   RESULT: ${failed === 0 ? "ALL DEMO COMPANIES PASSED ✓" : "ISSUES FOUND ✗"}\n`);

  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 2);
}

main().catch(async (err) => {
  console.error("\nSeeder crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
