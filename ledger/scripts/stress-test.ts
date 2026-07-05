/**
 * High-volume, multi-tenant stress + QA harness for the accounting engine.
 *
 * Spins up N simulated "CFO agents" (one per business type, each its own org)
 * and drives the REAL posting functions the app uses to post thousands of
 * mixed transactions. Then runs a verification suite covering:
 *   - ledger balance (per-entry and trial balance)
 *   - balance-sheet identity (A = L + E)
 *   - inventory subledger vs. Inventory control account
 *   - report totals vs. an independent raw-SQL recomputation
 *   - multi-tenant isolation (no cross-org reads / posts / leakage)
 *
 * SAFETY: never point this at production. Run against a throwaway database by
 * setting DATABASE_URL / DIRECT_URL to a local Postgres.
 *
 *   DATABASE_URL=postgresql://postgres:stress@localhost:55432/stress \
 *   DIRECT_URL=$DATABASE_URL npx tsx scripts/stress-test.ts
 */
import { Prisma, type AccountType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { listAccounts, signedBalance } from "@/lib/accounts";
import { createParty } from "@/lib/parties";
import {
  createInventoryItem,
  receiveGoods,
  writeOffInventory,
  adjustInventory,
} from "@/lib/inventory";
import {
  createReceipt,
  createPayment,
  createSalesInvoice,
  createSalesReceipt,
  createRefundReceipt,
  createPurchaseInvoice,
  createCreditNote,
  createDebitNote,
  createInterAccountTransfer,
  getSalesInvoice,
  getSalesReceipt,
  getRefundReceipt,
  getReceipt,
  getPayment,
} from "@/lib/documents";
import { postEntry, LedgerError } from "@/lib/ledger";
import {
  trialBalance,
  balanceSheet,
  profitAndLoss,
  inventoryValuation,
} from "@/lib/reports";

// --- Guardrail: refuse to run against anything that looks like prod ----------
const DB = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(DB)) {
  console.error(
    "\n✗ REFUSING TO RUN: DATABASE_URL is not a local database.\n" +
      "  This harness writes tens of thousands of rows and must only run\n" +
      "  against a throwaway DB. Set DATABASE_URL to a local Postgres.\n",
  );
  process.exit(1);
}

const TARGET = Number(process.env.STRESS_ENTRIES ?? "5000");
const STAMP = Date.now();

// --- Deterministic PRNG (mulberry32) so runs are reproducible ----------------
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

type OpType =
  | "salesInvoice"
  | "salesReceipt"
  | "customerPayment"
  | "refundReceipt"
  | "creditNote"
  | "purchaseBill"
  | "vendorPayment"
  | "inventoryPurchase"
  | "inventoryAdjustment"
  | "bankTransfer"
  | "creditCardCharge"
  | "creditCardPaydown"
  | "writeOff"
  | "manualSimple"
  | "manualComplex";

type Profile = {
  key: string;
  label: string;
  currency: string;
  usesInventory: boolean;
  weights: Partial<Record<OpType, number>>;
};

// 10 distinct business types with different transaction mixes.
const PROFILES: Profile[] = [
  {
    key: "grocery",
    label: "Grocery store",
    currency: "XAF",
    usesInventory: true,
    weights: {
      salesReceipt: 30, salesInvoice: 4, customerPayment: 3, refundReceipt: 3,
      inventoryPurchase: 20, purchaseBill: 6, vendorPayment: 6, writeOff: 6,
      inventoryAdjustment: 5, bankTransfer: 3, creditCardCharge: 3,
      creditCardPaydown: 2, manualSimple: 6, manualComplex: 2, creditNote: 1,
    },
  },
  {
    key: "restaurant",
    label: "Restaurant",
    currency: "XAF",
    usesInventory: true,
    weights: {
      salesReceipt: 34, inventoryPurchase: 18, writeOff: 8, purchaseBill: 8,
      vendorPayment: 7, creditCardCharge: 5, creditCardPaydown: 3,
      inventoryAdjustment: 4, bankTransfer: 3, manualSimple: 6, refundReceipt: 2,
    },
  },
  {
    key: "import_export",
    label: "Import/export trading company",
    currency: "USD",
    usesInventory: true,
    weights: {
      salesInvoice: 20, customerPayment: 16, creditNote: 3, inventoryPurchase: 16,
      purchaseBill: 10, vendorPayment: 12, bankTransfer: 6, manualComplex: 6,
      inventoryAdjustment: 4, writeOff: 2, salesReceipt: 3, refundReceipt: 2,
    },
  },
  {
    key: "warehouse",
    label: "Warehouse business",
    currency: "XAF",
    usesInventory: true,
    weights: {
      inventoryPurchase: 26, salesInvoice: 18, customerPayment: 14,
      inventoryAdjustment: 10, writeOff: 8, purchaseBill: 6, vendorPayment: 8,
      bankTransfer: 4, manualSimple: 4, manualComplex: 2,
    },
  },
  {
    key: "retail",
    label: "Retail store",
    currency: "XAF",
    usesInventory: true,
    weights: {
      salesReceipt: 28, salesInvoice: 8, customerPayment: 6, refundReceipt: 4,
      inventoryPurchase: 22, purchaseBill: 6, vendorPayment: 6,
      creditCardCharge: 4, creditCardPaydown: 2, inventoryAdjustment: 5,
      writeOff: 4, bankTransfer: 3, manualSimple: 2,
    },
  },
  {
    key: "service",
    label: "Service company",
    currency: "USD",
    usesInventory: false,
    weights: {
      salesInvoice: 32, customerPayment: 26, creditNote: 4, purchaseBill: 10,
      vendorPayment: 10, bankTransfer: 5, creditCardCharge: 5,
      creditCardPaydown: 3, manualSimple: 3, manualComplex: 2,
    },
  },
  {
    key: "manufacturing",
    label: "Manufacturing / light production",
    currency: "XAF",
    usesInventory: true,
    weights: {
      inventoryPurchase: 22, salesInvoice: 16, customerPayment: 12,
      manualComplex: 12, inventoryAdjustment: 8, writeOff: 6, purchaseBill: 8,
      vendorPayment: 8, bankTransfer: 4, salesReceipt: 4,
    },
  },
  {
    key: "wholesale",
    label: "Wholesale distributor",
    currency: "USD",
    usesInventory: true,
    weights: {
      salesInvoice: 24, customerPayment: 18, inventoryPurchase: 20,
      purchaseBill: 8, vendorPayment: 10, creditNote: 4, inventoryAdjustment: 5,
      bankTransfer: 5, manualSimple: 4, writeOff: 2,
    },
  },
  {
    key: "ecommerce",
    label: "E-commerce business",
    currency: "USD",
    usesInventory: true,
    weights: {
      salesReceipt: 30, refundReceipt: 8, inventoryPurchase: 20,
      creditCardCharge: 8, creditCardPaydown: 4, purchaseBill: 5,
      vendorPayment: 5, inventoryAdjustment: 5, writeOff: 4, bankTransfer: 3,
      salesInvoice: 4, customerPayment: 4,
    },
  },
  {
    key: "logistics",
    label: "Logistics / transport company",
    currency: "XAF",
    usesInventory: false,
    weights: {
      salesInvoice: 30, customerPayment: 24, purchaseBill: 12, vendorPayment: 12,
      creditCardCharge: 6, creditCardPaydown: 4, bankTransfer: 4,
      manualComplex: 4, manualSimple: 3, creditNote: 1,
    },
  },
];

// --- Per-agent working state -------------------------------------------------
type AgentState = {
  profile: Profile;
  orgId: string;
  orgName: string;
  acc: Map<string, { id: string; type: AccountType }>; // by code
  creditCardId: string;
  incomeIds: string[];
  expenseIds: string[];
  customers: string[];
  suppliers: string[];
  items: { id: string; salePrice: bigint }[];
  stock: Map<string, number>;
  ar: Map<string, bigint>;
  ap: Map<string, bigint>;
  ccBalance: bigint;
  cashBalance: bigint; // rough, so transfers/paydowns stay funded
  counters: Record<string, number>;
  rng: () => number;
  issues: Issue[];
  stopped: boolean;
};

type Issue = {
  agent: string;
  op: string;
  context: string;
  error: string;
  category: "posting-logic" | "data" | "permission" | "unknown";
};

let ABORT = false;

const money = (n: number) => BigInt(Math.max(1, Math.round(n)));

function pickWeighted(state: AgentState, options: OpType[]): OpType {
  const weights = state.profile.weights;
  const pool = options.filter((o) => (weights[o] ?? 0) > 0);
  const total = pool.reduce((s, o) => s + (weights[o] ?? 0), 0);
  let r = state.rng() * total;
  for (const o of pool) {
    r -= weights[o] ?? 0;
    if (r <= 0) return o;
  }
  return pool[pool.length - 1];
}

function randDate(rng: () => number): Date {
  const daysAgo = Math.floor(rng() * 300);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function choose<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// --- Setup a single business (org + parties + items + opening balances) ------
async function setupAgent(profile: Profile, index: number): Promise<AgentState> {
  const rng = makeRng(0x9e3779b1 ^ (index * 2654435761));
  const orgName = `${profile.label} #${index + 1} [${STAMP}]`;
  const { org } = await createOrganizationWithOwner({
    name: `${profile.key} CFO`,
    email: `stress+${STAMP}_${index}@example.com`,
    password: "stress-12345",
    orgName,
    baseCurrency: profile.currency,
  });

  const accounts = await listAccounts(org.id);
  const acc = new Map(accounts.map((a) => [a.code, { id: a.id, type: a.type }]));

  // Add a credit-card liability account (not in the default chart).
  const card = await prisma.account.create({
    data: {
      orgId: org.id,
      code: "2200",
      name: "Company credit card",
      type: "LIABILITY",
      subtype: "credit_card",
      currency: profile.currency,
    },
  });

  const incomeIds = accounts.filter((a) => a.type === "INCOME").map((a) => a.id);
  const expenseIds = accounts.filter((a) => a.type === "EXPENSE").map((a) => a.id);

  const customers: string[] = [];
  const suppliers: string[] = [];
  for (let i = 0; i < 8; i++) {
    customers.push((await createParty(org.id, { name: `Customer ${i + 1}`, type: "customer" })).id);
    suppliers.push((await createParty(org.id, { name: `Supplier ${i + 1}`, type: "supplier" })).id);
  }

  const items: { id: string; salePrice: bigint }[] = [];
  const stock = new Map<string, number>();
  if (profile.usesInventory) {
    for (let i = 0; i < 15; i++) {
      const salePrice = money(1000 + rng() * 40000);
      const item = await createInventoryItem(org.id, {
        code: `ITM-${String(i + 1).padStart(3, "0")}`,
        name: `Product ${i + 1}`,
        salePrice,
      });
      items.push({ id: item.id, salePrice });
      stock.set(item.id, 0);
    }
    // Seed opening stock via goods receipts (Dr Inventory / Cr AP).
    for (const it of items) {
      const qty = 400 + Math.floor(rng() * 600);
      const unitCost = money(Number(it.salePrice) * (0.4 + rng() * 0.3));
      await receiveGoods(org.id, {
        partyId: choose(rng, suppliers),
        date: randDate(rng),
        lines: [{ itemId: it.id, quantity: String(qty), unitCost }],
      });
      stock.set(it.id, qty);
    }
  }

  // Opening balances: fund cash + bank against owner's equity.
  const cash = acc.get("1000")!;
  const bank = acc.get("1010")!;
  const equity = acc.get("3000")!;
  const openingCash = money(2_000_000 + rng() * 3_000_000);
  const openingBank = money(5_000_000 + rng() * 10_000_000);
  await postEntry({
    orgId: org.id,
    entryDate: randDate(rng),
    description: "Opening balance — owner capital",
    sourceType: "manual",
    lines: [
      { accountId: cash.id, debit: openingCash },
      { accountId: bank.id, debit: openingBank },
      { accountId: equity.id, credit: openingCash + openingBank },
    ],
  });

  return {
    profile,
    orgId: org.id,
    orgName,
    acc,
    creditCardId: card.id,
    incomeIds,
    expenseIds,
    customers,
    suppliers,
    items,
    stock,
    ar: new Map(),
    ap: new Map(),
    ccBalance: 0n,
    cashBalance: openingCash + openingBank,
    counters: { openingBalance: 1 },
    rng,
    issues: [],
    stopped: false,
  };
}

function bump(s: AgentState, op: string) {
  s.counters[op] = (s.counters[op] ?? 0) + 1;
}

function inStockItems(s: AgentState) {
  return s.items.filter((it) => (s.stock.get(it.id) ?? 0) > 0);
}

// --- Execute one operation for an agent --------------------------------------
const TAX_RATES = [5, 10, 15];

// Mirror the backend's exclusive tax rounding so the harness can predict
// document totals and tie the tax accounts out exactly. All harness docs are
// single-line, so per-line rounding equals rounding the net.
function taxOn(net: bigint, taxRate: number | null): bigint {
  if (!taxRate) return 0n;
  return BigInt(Math.round((Number(net) * taxRate) / 100));
}

async function runOp(s: AgentState, op: OpType): Promise<void> {
  const rng = s.rng;
  const date = randDate(rng);
  const bank = s.acc.get("1010")!;
  const cash = s.acc.get("1000")!;
  const ar = s.acc.get("1100")!;
  const ap = s.acc.get("2000")!;
  const sales = s.acc.get("4000")!;

  switch (op) {
    case "salesInvoice":
    case "salesReceipt": {
      const useItem = s.profile.usesInventory && inStockItems(s).length > 0 && rng() > 0.2;
      let lines;
      let soldItem: { id: string; qty: number } | null = null;
      if (useItem) {
        const it = choose(rng, inStockItems(s));
        const avail = s.stock.get(it.id) ?? 0;
        const qty = Math.max(1, Math.min(avail, 1 + Math.floor(rng() * 5)));
        soldItem = { id: it.id, qty };
        lines = [{ description: "Goods sold", quantity: String(qty), unitPrice: it.salePrice, accountId: sales.id, itemId: it.id }];
      } else {
        lines = [{ description: "Service rendered", quantity: "1", unitPrice: money(5000 + rng() * 200000), accountId: choose(rng, s.incomeIds) }];
      }
      const taxRate = rng() > 0.6 ? choose(rng, TAX_RATES) : null;
      if (taxRate) lines = lines.map((l) => ({ ...l, taxRate }));
      const net = lines.reduce((t, l) => t + BigInt(l.quantity) * l.unitPrice, 0n);
      const total = net + taxOn(net, taxRate);
      if (op === "salesInvoice") {
        const party = choose(rng, s.customers);
        await createSalesInvoice(s.orgId, { partyId: party, date, lines });
        s.ar.set(party, (s.ar.get(party) ?? 0n) + total);
      } else {
        await createSalesReceipt(s.orgId, { bankAccountId: bank.id, partyId: choose(rng, s.customers), date, lines });
        s.cashBalance += total;
      }
      if (soldItem) {
        s.stock.set(soldItem.id, (s.stock.get(soldItem.id) ?? 0) - soldItem.qty);
        bump(s, "cogsPosting");
      }
      bump(s, op);
      break;
    }
    case "customerPayment": {
      const owing = s.customers.filter((c) => (s.ar.get(c) ?? 0n) > 0n);
      if (owing.length === 0) return runOp(s, "salesInvoice");
      const party = choose(rng, owing);
      const bal = s.ar.get(party)!;
      const amount = bal > 1n ? BigInt(1) + BigInt(Math.floor(Number(bal) * (0.3 + rng() * 0.7))) : bal;
      const pay = amount > bal ? bal : amount;
      await createReceipt(s.orgId, { date, bankAccountId: bank.id, partyId: party, lines: [{ accountId: ar.id, amount: pay }] });
      s.ar.set(party, bal - pay);
      s.cashBalance += pay;
      bump(s, op);
      break;
    }
    case "refundReceipt": {
      const party = choose(rng, s.customers);
      // ~half of refunds for inventory businesses return physical goods, which
      // must restock inventory and reverse COGS. We deliberately allow items
      // with zero stock too, to exercise the last-known-cost fallback.
      const taxRate = rng() > 0.6 ? choose(rng, TAX_RATES) : null;
      if (s.profile.usesInventory && s.items.length > 0 && rng() > 0.5) {
        const it = choose(rng, s.items);
        const qty = 1 + Math.floor(rng() * 3);
        const lines = [{ description: "Returned goods", quantity: String(qty), unitPrice: it.salePrice, accountId: sales.id, itemId: it.id, ...(taxRate ? { taxRate } : {}) }];
        await createRefundReceipt(s.orgId, { bankAccountId: bank.id, partyId: party, date, lines });
        s.stock.set(it.id, (s.stock.get(it.id) ?? 0) + qty);
        const net = BigInt(qty) * it.salePrice;
        s.cashBalance -= net + taxOn(net, taxRate);
        bump(s, "itemReturnRestock");
      } else {
        const amount = money(2000 + rng() * 60000);
        const lines = [{ description: "Refund to customer", quantity: "1", unitPrice: amount, accountId: choose(rng, s.incomeIds), ...(taxRate ? { taxRate } : {}) }];
        await createRefundReceipt(s.orgId, { bankAccountId: bank.id, partyId: party, date, lines });
        s.cashBalance -= amount + taxOn(amount, taxRate);
      }
      bump(s, op);
      break;
    }
    case "creditNote": {
      const party = choose(rng, s.customers);
      const taxRate = rng() > 0.6 ? choose(rng, TAX_RATES) : null;
      if (s.profile.usesInventory && s.items.length > 0 && rng() > 0.5) {
        const it = choose(rng, s.items);
        const qty = 1 + Math.floor(rng() * 3);
        const lines = [{ description: "Returned goods", quantity: String(qty), unitPrice: it.salePrice, accountId: sales.id, itemId: it.id, ...(taxRate ? { taxRate } : {}) }];
        await createCreditNote(s.orgId, { partyId: party, date, lines });
        s.stock.set(it.id, (s.stock.get(it.id) ?? 0) + qty);
        const net = BigInt(qty) * it.salePrice;
        s.ar.set(party, (s.ar.get(party) ?? 0n) - (net + taxOn(net, taxRate)));
        bump(s, "itemReturnRestock");
      } else {
        const amount = money(2000 + rng() * 40000);
        const lines = [{ description: "Sales return", quantity: "1", unitPrice: amount, accountId: sales.id, ...(taxRate ? { taxRate } : {}) }];
        await createCreditNote(s.orgId, { partyId: party, date, lines });
        s.ar.set(party, (s.ar.get(party) ?? 0n) - (amount + taxOn(amount, taxRate)));
      }
      bump(s, op);
      break;
    }
    case "purchaseBill": {
      const party = choose(rng, s.suppliers);
      const amount = money(5000 + rng() * 300000);
      const taxRate = rng() > 0.6 ? choose(rng, TAX_RATES) : null;
      const lines = [{ description: "Expense bill", quantity: "1", unitPrice: amount, accountId: choose(rng, s.expenseIds), ...(taxRate ? { taxRate } : {}) }];
      await createPurchaseInvoice(s.orgId, { partyId: party, date, lines });
      s.ap.set(party, (s.ap.get(party) ?? 0n) + amount + taxOn(amount, taxRate));
      bump(s, op);
      break;
    }
    case "vendorPayment": {
      const owed = s.suppliers.filter((c) => (s.ap.get(c) ?? 0n) > 0n);
      if (owed.length === 0) return runOp(s, "purchaseBill");
      const party = choose(rng, owed);
      const bal = s.ap.get(party)!;
      const amount = bal > 1n ? BigInt(1) + BigInt(Math.floor(Number(bal) * (0.3 + rng() * 0.7))) : bal;
      const pay = amount > bal ? bal : amount;
      await createPayment(s.orgId, { date, bankAccountId: bank.id, partyId: party, lines: [{ accountId: ap.id, amount: pay }] });
      s.ap.set(party, bal - pay);
      s.cashBalance -= pay;
      bump(s, op);
      break;
    }
    case "inventoryPurchase": {
      if (!s.profile.usesInventory) return runOp(s, "purchaseBill");
      const it = choose(rng, s.items);
      const qty = 20 + Math.floor(rng() * 200);
      const unitCost = money(Number(it.salePrice) * (0.4 + rng() * 0.3));
      // Half via goods receipt (to AP), half via cash payment with item lines.
      if (rng() > 0.5) {
        const party = choose(rng, s.suppliers);
        await receiveGoods(s.orgId, { partyId: party, date, lines: [{ itemId: it.id, quantity: String(qty), unitCost }] });
        s.ap.set(party, (s.ap.get(party) ?? 0n) + BigInt(qty) * unitCost);
        bump(s, "inventoryPurchaseCredit");
      } else {
        await createPayment(s.orgId, { date, bankAccountId: bank.id, partyId: choose(rng, s.suppliers), lines: [], itemLines: [{ itemId: it.id, quantity: String(qty), unitCost }] });
        s.cashBalance -= BigInt(qty) * unitCost;
        bump(s, "inventoryPurchaseCash");
      }
      s.stock.set(it.id, (s.stock.get(it.id) ?? 0) + qty);
      bump(s, op);
      break;
    }
    case "inventoryAdjustment": {
      if (!s.profile.usesInventory) return runOp(s, "manualSimple");
      const it = choose(rng, s.items);
      const cur = s.stock.get(it.id) ?? 0;
      const delta = Math.floor(rng() * 21) - 10; // -10..+10
      const next = Math.max(0, cur + delta);
      if (next === cur) return runOp(s, "manualSimple");
      const adjAccount = rng() > 0.5 ? choose(rng, s.expenseIds) : choose(rng, s.incomeIds);
      await adjustInventory(s.orgId, { date, adjustmentAccountId: adjAccount, lines: [{ itemId: it.id, newQuantity: String(next) }] });
      s.stock.set(it.id, next);
      bump(s, op);
      break;
    }
    case "bankTransfer": {
      const amount = money(10000 + rng() * 500000);
      const dir = rng() > 0.5;
      await createInterAccountTransfer(s.orgId, { date, fromAccountId: dir ? bank.id : cash.id, toAccountId: dir ? cash.id : bank.id, amount });
      bump(s, op);
      break;
    }
    case "creditCardCharge": {
      const amount = money(3000 + rng() * 120000);
      await createPayment(s.orgId, { date, bankAccountId: s.creditCardId, lines: [{ accountId: choose(rng, s.expenseIds), amount }] });
      s.ccBalance += amount;
      bump(s, op);
      break;
    }
    case "creditCardPaydown": {
      if (s.ccBalance <= 0n) return runOp(s, "creditCardCharge");
      const pay = s.ccBalance > 1n ? BigInt(1) + BigInt(Math.floor(Number(s.ccBalance) * (0.3 + rng() * 0.7))) : s.ccBalance;
      const amount = pay > s.ccBalance ? s.ccBalance : pay;
      await createInterAccountTransfer(s.orgId, { date, fromAccountId: bank.id, toAccountId: s.creditCardId, amount });
      s.ccBalance -= amount;
      s.cashBalance -= amount;
      bump(s, op);
      break;
    }
    case "writeOff": {
      if (!s.profile.usesInventory || inStockItems(s).length === 0) return runOp(s, "manualSimple");
      const it = choose(rng, inStockItems(s));
      const avail = s.stock.get(it.id) ?? 0;
      const qty = Math.max(1, Math.min(avail, 1 + Math.floor(rng() * 3)));
      await writeOffInventory(s.orgId, { date, expenseAccountId: s.acc.get("6000")!.id, lines: [{ itemId: it.id, quantity: String(qty) }] });
      s.stock.set(it.id, avail - qty);
      bump(s, op);
      break;
    }
    case "manualSimple": {
      const amount = money(2000 + rng() * 150000);
      await postEntry({ orgId: s.orgId, entryDate: date, description: "Simple expense", sourceType: "manual", lines: [{ accountId: choose(rng, s.expenseIds), debit: amount }, { accountId: bank.id, credit: amount }] });
      bump(s, op);
      break;
    }
    case "manualComplex": {
      const a = money(2000 + rng() * 100000);
      const b = money(2000 + rng() * 100000);
      const c = a + b;
      await postEntry({ orgId: s.orgId, entryDate: date, description: "Complex allocation", sourceType: "manual", lines: [{ accountId: choose(rng, s.expenseIds), debit: a }, { accountId: choose(rng, s.expenseIds), debit: b }, { accountId: bank.id, credit: c }] });
      bump(s, op);
      break;
    }
  }
}

const ALL_OPS: OpType[] = [
  "salesInvoice", "salesReceipt", "customerPayment", "refundReceipt", "creditNote",
  "purchaseBill", "vendorPayment", "inventoryPurchase", "inventoryAdjustment",
  "bankTransfer", "creditCardCharge", "creditCardPaydown", "writeOff",
  "manualSimple", "manualComplex",
];

function categorize(err: unknown): Issue["category"] {
  if (err instanceof LedgerError) return "posting-logic";
  const msg = err instanceof Error ? err.message : String(err);
  if (/access|permission|belong|not found/i.test(msg)) return "permission";
  return "unknown";
}

async function driveAgent(s: AgentState) {
  let posted = 0;
  while (posted < TARGET && !ABORT) {
    const op = pickWeighted(s, ALL_OPS);
    try {
      await runOp(s, op);
      posted++;
    } catch (err) {
      const issue: Issue = {
        agent: s.orgName,
        op,
        context: `after ${posted} entries`,
        error: err instanceof Error ? err.message : String(err),
        category: categorize(err),
      };
      s.issues.push(issue);
      s.stopped = true;
      ABORT = true; // stop-and-report on first hard failure
      console.error(`\n✗ [${s.profile.label}] op "${op}" failed: ${issue.error}`);
      return;
    }
  }
}

// --- Verification ------------------------------------------------------------
type Check = { name: string; pass: boolean; detail: string };

async function independentTotals(orgId: string) {
  const rows = await prisma.$queryRaw<{ type: AccountType; d: string; c: string }[]>`
    SELECT a.type, COALESCE(SUM(l.debit),0)::text AS d, COALESCE(SUM(l.credit),0)::text AS c
    FROM journal_lines l JOIN accounts a ON a.id = l."accountId"
    WHERE l."orgId" = ${orgId}
    GROUP BY a.type`;
  const t: Record<string, { d: bigint; c: bigint }> = {};
  for (const r of rows) t[r.type] = { d: BigInt(r.d), c: BigInt(r.c) };
  const g = (k: string) => t[k] ?? { d: 0n, c: 0n };
  return {
    asset: g("ASSET").d - g("ASSET").c,
    liability: g("LIABILITY").c - g("LIABILITY").d,
    equity: g("EQUITY").c - g("EQUITY").d,
    income: g("INCOME").c - g("INCOME").d,
    expense: g("EXPENSE").d - g("EXPENSE").c,
  };
}

async function verifyAgent(s: AgentState): Promise<Check[]> {
  const checks: Check[] = [];
  const orgId = s.orgId;

  // 1. Every journal entry is internally balanced.
  const unbalanced = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "entryId" FROM journal_lines WHERE "orgId" = ${orgId}
      GROUP BY "entryId" HAVING SUM(debit) <> SUM(credit)
    ) t`;
  const nUnbal = Number(unbalanced[0].n);
  checks.push({ name: "per-entry balanced", pass: nUnbal === 0, detail: `${nUnbal} unbalanced entries` });

  // 2. Trial balance totals equal.
  const tb = await trialBalance(orgId);
  checks.push({ name: "trial balance", pass: tb.balanced, detail: `Dr ${tb.totalDebit} vs Cr ${tb.totalCredit}` });

  // 3. Balance-sheet identity A = L + E.
  const bs = await balanceSheet(orgId);
  checks.push({ name: "balance sheet A=L+E", pass: bs.balanced, detail: `A ${bs.totalAssets} / L ${bs.totalLiabilities} / E ${bs.totalEquity}` });

  // 4. Reports vs independent raw recomputation.
  const ind = await independentTotals(orgId);
  const pnl = await profitAndLoss(orgId, new Date(Date.UTC(1970, 0, 1)), new Date());
  checks.push({ name: "P&L income vs ledger", pass: pnl.totalIncome === ind.income, detail: `report ${pnl.totalIncome} vs ledger ${ind.income}` });
  checks.push({ name: "P&L expense vs ledger", pass: pnl.totalExpenses === ind.expense, detail: `report ${pnl.totalExpenses} vs ledger ${ind.expense}` });
  checks.push({ name: "BS assets vs ledger", pass: bs.totalAssets === ind.asset, detail: `report ${bs.totalAssets} vs ledger ${ind.asset}` });
  checks.push({ name: "BS equity vs ledger+earnings", pass: bs.totalEquity === ind.equity + (ind.income - ind.expense), detail: `report ${bs.totalEquity} vs ${ind.equity + (ind.income - ind.expense)}` });

  // 5. Inventory subledger vs Inventory control account.
  if (s.profile.usesInventory) {
    const items = await prisma.inventoryItem.findMany({ where: { orgId } });
    const sumValue = items.reduce((t, it) => t + it.valueOnHand, 0n);
    const negQty = items.filter((it) => new Prisma.Decimal(it.qtyOnHand).lt(0));
    const negVal = items.filter((it) => it.valueOnHand < 0n);
    const invAcc = await prisma.account.findFirst({ where: { orgId, subtype: "inventory" } });
    const invAgg = await prisma.journalLine.aggregate({ where: { orgId, accountId: invAcc!.id }, _sum: { debit: true, credit: true } });
    const invLedger = signedBalance("ASSET", invAgg._sum.debit ?? 0n, invAgg._sum.credit ?? 0n);
    checks.push({ name: "inventory subledger == control acct", pass: sumValue === invLedger, detail: `items ${sumValue} vs ledger ${invLedger}` });
    checks.push({ name: "no negative stock qty", pass: negQty.length === 0, detail: `${negQty.length} items negative` });
    checks.push({ name: "no negative stock value", pass: negVal.length === 0, detail: `${negVal.length} items negative` });
    const val = await inventoryValuation(orgId);
    checks.push({ name: "valuation report == control acct", pass: val.total === invLedger, detail: `report ${val.total} vs ledger ${invLedger}` });
  }

  // 6. Tax accounts tie out to the tax recorded on documents.
  const sum = (n: bigint | null | undefined) => n ?? 0n;
  const [siTax, srTax, cnTax, rrTax, piTax, dnTax] = await Promise.all([
    prisma.salesInvoiceLine.aggregate({ where: { invoice: { orgId } }, _sum: { taxAmount: true } }),
    prisma.salesReceiptLine.aggregate({ where: { receipt: { orgId } }, _sum: { taxAmount: true } }),
    prisma.creditNoteLine.aggregate({ where: { note: { orgId } }, _sum: { taxAmount: true } }),
    prisma.refundReceiptLine.aggregate({ where: { refund: { orgId } }, _sum: { taxAmount: true } }),
    prisma.purchaseInvoiceLine.aggregate({ where: { invoice: { orgId } }, _sum: { taxAmount: true } }),
    prisma.debitNoteLine.aggregate({ where: { note: { orgId } }, _sum: { taxAmount: true } }),
  ]);
  const expectedPayable =
    sum(siTax._sum.taxAmount) + sum(srTax._sum.taxAmount) -
    sum(cnTax._sum.taxAmount) - sum(rrTax._sum.taxAmount);
  const expectedRecoverable = sum(piTax._sum.taxAmount) - sum(dnTax._sum.taxAmount);

  const payAcc = await prisma.account.findFirst({ where: { orgId, subtype: "tax" } });
  const recAcc = await prisma.account.findFirst({ where: { orgId, subtype: "tax_recoverable" } });
  const payLedger = payAcc
    ? await prisma.journalLine.aggregate({ where: { orgId, accountId: payAcc.id }, _sum: { debit: true, credit: true } }).then((a) => signedBalance("LIABILITY", a._sum.debit ?? 0n, a._sum.credit ?? 0n))
    : 0n;
  const recLedger = recAcc
    ? await prisma.journalLine.aggregate({ where: { orgId, accountId: recAcc.id }, _sum: { debit: true, credit: true } }).then((a) => signedBalance("ASSET", a._sum.debit ?? 0n, a._sum.credit ?? 0n))
    : 0n;
  checks.push({ name: "tax payable == output tax on docs", pass: payLedger === expectedPayable, detail: `ledger ${payLedger} vs docs ${expectedPayable}` });
  checks.push({ name: "tax recoverable == input tax on docs", pass: recLedger === expectedRecoverable, detail: `ledger ${recLedger} vs docs ${expectedRecoverable}` });

  return checks;
}

// --- Multi-tenant isolation (cross-org) --------------------------------------
async function verifyIsolation(agents: AgentState[]): Promise<Check[]> {
  const checks: Check[] = [];
  const withDocs = agents.filter((a) => !a.stopped || a.counters.salesInvoice);

  // Grab a real document id from each org to attempt cross-org reads.
  const sampleInvoice = new Map<string, string>();
  const samplePayment = new Map<string, string>();
  for (const a of agents) {
    const inv = await prisma.salesInvoice.findFirst({ where: { orgId: a.orgId }, select: { id: true } });
    if (inv) sampleInvoice.set(a.orgId, inv.id);
    const pay = await prisma.payment.findFirst({ where: { orgId: a.orgId }, select: { id: true } });
    if (pay) samplePayment.set(a.orgId, pay.id);
  }

  // A scoped getter for org B must never return org A's document.
  let leaks = 0;
  let tested = 0;
  for (const a of withDocs) {
    for (const b of agents) {
      if (a.orgId === b.orgId) continue;
      const invA = sampleInvoice.get(a.orgId);
      if (invA) {
        tested++;
        if (await getSalesInvoice(b.orgId, invA)) leaks++;
      }
      const payA = samplePayment.get(a.orgId);
      if (payA) {
        tested++;
        if (await getPayment(b.orgId, payA)) leaks++;
      }
    }
  }
  checks.push({ name: "cross-org document reads blocked", pass: leaks === 0, detail: `${leaks} leaks across ${tested} attempts` });

  // Posting an entry in org B against org A's account must be rejected.
  let acceptedForeign = 0;
  const pairs = Math.min(agents.length, 6);
  for (let i = 0; i < pairs; i++) {
    const a = agents[i];
    const b = agents[(i + 1) % agents.length];
    const foreignAcc = a.acc.get("1010")!.id;
    const ownAcc = b.acc.get("1000")!.id;
    try {
      await postEntry({ orgId: b.orgId, entryDate: new Date(), description: "isolation probe", lines: [{ accountId: foreignAcc, debit: 100n }, { accountId: ownAcc, credit: 100n }] });
      acceptedForeign++;
    } catch {
      /* expected: LedgerError */
    }
  }
  checks.push({ name: "cross-org posting rejected", pass: acceptedForeign === 0, detail: `${acceptedForeign}/${pairs} foreign posts wrongly accepted` });

  // No journal line references an account from a different org.
  const leakRows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM journal_lines l
    JOIN accounts a ON a.id = l."accountId"
    WHERE l."orgId" <> a."orgId"`;
  const nLeak = Number(leakRows[0].n);
  checks.push({ name: "no cross-org journal lines", pass: nLeak === 0, detail: `${nLeak} mismatched lines` });

  return checks;
}

// --- Main --------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  console.log(`\n=== Accounting stress test — ${PROFILES.length} agents × ${TARGET} entries ===`);
  console.log(`DB: ${DB.replace(/:[^:@/]+@/, ":****@")}\n`);

  console.log("Provisioning businesses (org + chart + parties + items + opening stock)…");
  const agents: AgentState[] = [];
  for (let i = 0; i < PROFILES.length; i++) {
    agents.push(await setupAgent(PROFILES[i], i));
    process.stdout.write(`  ✓ ${PROFILES[i].label}\n`);
  }

  console.log("\nPosting transactions (10 agents in parallel)…");
  const progress = setInterval(async () => {
    const total = await prisma.journalEntry.count({ where: { orgId: { in: agents.map((a) => a.orgId) } } });
    process.stdout.write(`\r  entries posted so far: ${total}   `);
  }, 2000);

  await Promise.allSettled(agents.map((a) => driveAgent(a)));
  clearInterval(progress);

  const genSecs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\nGeneration finished in ${genSecs}s.`);

  // Authoritative per-agent entry counts.
  for (const a of agents) {
    a.counters._journalEntries = await prisma.journalEntry.count({ where: { orgId: a.orgId } });
  }

  console.log("\nRunning verification suite…");
  const perAgentChecks = new Map<string, Check[]>();
  for (const a of agents) {
    perAgentChecks.set(a.orgId, await verifyAgent(a));
  }
  const isolationChecks = await verifyIsolation(agents);

  // --- Report ---------------------------------------------------------------
  const allIssues = agents.flatMap((a) => a.issues);
  let failedChecks = 0;

  console.log("\n\n================ STRESS TEST REPORT ================\n");

  console.log("1) ENTRIES POSTED PER AGENT");
  let grand = 0;
  for (const a of agents) {
    const n = a.counters._journalEntries;
    grand += n;
    console.log(`   ${a.profile.label.padEnd(38)} ${String(n).padStart(6)} entries${a.stopped ? "  (STOPPED early)" : ""}`);
  }
  console.log(`   ${"TOTAL".padEnd(38)} ${String(grand).padStart(6)} journal entries`);

  console.log("\n2) TRANSACTION TYPES EXERCISED (attempts per agent)");
  for (const a of agents) {
    const types = Object.entries(a.counters)
      .filter(([k]) => !k.startsWith("_"))
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    console.log(`   ${a.profile.label}\n      ${types}`);
  }

  console.log("\n3) POSTING FAILURES");
  if (allIssues.length === 0) console.log("   None — every attempted posting succeeded. ✓");
  else for (const i of allIssues) console.log(`   ✗ [${i.agent}] ${i.op} (${i.category}): ${i.error}`);

  const summarize = (label: string, checks: Check[]) => {
    console.log(`\n${label}`);
    for (const c of checks) {
      if (!c.pass) failedChecks++;
      console.log(`   ${c.pass ? "✓" : "✗ FAIL"}  ${c.name.padEnd(38)} ${c.detail}`);
    }
  };

  console.log("\n4-6) LEDGER / INVENTORY / REPORT INTEGRITY (per agent)");
  for (const a of agents) {
    summarize(`   ── ${a.profile.label} ──`, perAgentChecks.get(a.orgId)!);
  }

  console.log("\n7) MULTI-TENANT ISOLATION");
  for (const c of isolationChecks) {
    if (!c.pass) failedChecks++;
    console.log(`   ${c.pass ? "✓" : "✗ FAIL"}  ${c.name.padEnd(38)} ${c.detail}`);
  }

  console.log("\n8) OVERALL");
  console.log(`   Agents:            ${agents.length}`);
  console.log(`   Journal entries:   ${grand}`);
  console.log(`   Posting failures:  ${allIssues.length}`);
  console.log(`   Integrity checks failed: ${failedChecks}`);
  const ok = allIssues.length === 0 && failedChecks === 0;
  console.log(`\n   RESULT: ${ok ? "ALL CHECKS PASSED ✓" : "ISSUES FOUND ✗ (see above)"}\n`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 2);
}

main().catch(async (err) => {
  console.error("\nHarness crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
