// Verifies COGS-on-sale: selling stock books revenue + COGS and cuts inventory.
// Run: npx tsx scripts/verify-cogs.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { inventoryAccount, cogsAccount, receivableAccount } from "@/lib/accounts";
import { createParty } from "@/lib/parties";
import { createInventoryItem, receiveGoods, listInventoryItems } from "@/lib/inventory";
import { createSalesInvoice } from "@/lib/documents";
import { trialBalance } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const stamp = Date.now();
  const cur = "XAF";

  const { org } = await createOrganizationWithOwner({
    name: "COGS Bot",
    email: `cogs+${stamp}@example.com`,
    password: "verify-12345",
    orgName: `COGS Co ${stamp}`,
    baseCurrency: cur,
  });

  const accounts = await prisma.account.findMany({ where: { orgId: org.id } });
  const acc = (code: string) => accounts.find((a) => a.code === code)!;
  const inv = await inventoryAccount(org.id);
  const cogs = await cogsAccount(org.id);
  const ar = await receivableAccount(org.id);

  const customer = await createParty(org.id, { name: "BUYER", type: "customer" });
  const supplier = await createParty(org.id, { name: "VENDOR", type: "supplier" });
  const item = await createInventoryItem(org.id, { code: "WIDGET", name: "Widget", salePrice: 2_000n });

  console.log("1. Receive 10 @ 1,000 (stock value 10,000, avg 1,000)…");
  await receiveGoods(org.id, {
    partyId: supplier.id,
    date: new Date(),
    lines: [{ itemId: item.id, quantity: "10", unitCost: 1_000n }],
  });

  console.log("2. Sell 4 @ 2,000 (revenue 8,000; COGS 4,000)…");
  const invoice = await createSalesInvoice(org.id, {
    partyId: customer.id,
    date: new Date(),
    lines: [
      {
        description: "Widget sale",
        quantity: "4",
        unitPrice: 2_000n,
        accountId: acc("4000").id,
        itemId: item.id,
      },
    ],
  });

  const [items, tb, lines] = await Promise.all([
    listInventoryItems(org.id),
    trialBalance(org.id),
    prisma.salesInvoiceLine.findMany({ where: { invoiceId: invoice.id } }),
  ]);
  const w = items[0];

  console.log("\n=== Inventory after sale ===");
  console.log(`  ${w.code}: qty ${w.qtyOnHand.toString()}, avg ${formatAmount(w.avgCost, cur)}, value ${formatAmount(w.valueOnHand, cur)}`);

  console.log("\n=== Trial Balance ===");
  for (const a of tb.accounts) {
    console.log(
      `  ${a.code} ${a.name.padEnd(22)} Dr ${formatAmount(a.debit, cur).padStart(12)}  Cr ${formatAmount(a.credit, cur).padStart(12)}`,
    );
  }
  console.log(`  TB balanced: ${tb.balanced ? "YES ✓" : "NO ✗"}`);

  const net = (code: string) => {
    const r = tb.accounts.find((a) => a.code === code);
    return r ? r.debit - r.credit : 0n;
  };
  const arNet = net(ar.code);
  const salesNet = net("4000");
  const cogsNet = net(cogs.code);
  const invNet = net(inv.code);
  const lineCost = lines[0]?.cost ?? 0n;

  const ok =
    tb.balanced &&
    w.qtyOnHand.toString() === "6" &&
    w.valueOnHand === 6_000n &&
    arNet === 8_000n &&
    salesNet === -8_000n &&
    cogsNet === 4_000n &&
    invNet === 6_000n &&
    invNet === w.valueOnHand &&
    lineCost === 4_000n;

  console.log(`\n  Stock left 6 @ value 6,000: ${w.qtyOnHand.toString() === "6" && w.valueOnHand === 6_000n ? "✓" : "✗"}`);
  console.log(`  AR 8,000 / Sales 8,000 / COGS 4,000: ${arNet === 8_000n && salesNet === -8_000n && cogsNet === 4_000n ? "✓" : "✗"}`);
  console.log(`  Inventory ledger (6,000) == subledger value: ${invNet === w.valueOnHand ? "✓" : "✗"}`);
  console.log(`  Line cost recorded 4,000: ${lineCost === 4_000n ? "✓" : "✗"}`);
  console.log(`  Gross profit = 8,000 - 4,000 = ${formatAmount(8_000n - cogsNet, cur)}`);
  console.log(`\nRESULT: ${ok ? "ALL COGS CHECKS PASSED ✓" : "CHECKS FAILED ✗"}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
