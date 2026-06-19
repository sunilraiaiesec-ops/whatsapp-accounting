// Verifies perpetual inventory (weighted-avg cost) + ledger.
// Run: npx tsx scripts/verify-inventory.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { inventoryAccount, payableAccount } from "@/lib/accounts";
import { createParty } from "@/lib/parties";
import {
  createInventoryItem,
  receiveGoods,
  writeOffInventory,
  listInventoryItems,
} from "@/lib/inventory";
import { trialBalance } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const stamp = Date.now();
  const cur = "XAF";

  const { org } = await createOrganizationWithOwner({
    name: "Stock Bot",
    email: `stock+${stamp}@example.com`,
    password: "verify-12345",
    orgName: `Stock Co ${stamp}`,
    baseCurrency: cur,
  });

  const accounts = await prisma.account.findMany({ where: { orgId: org.id } });
  const acc = (code: string) => accounts.find((a) => a.code === code)!;
  const inv = await inventoryAccount(org.id);
  const ap = await payableAccount(org.id);

  const supplier = await createParty(org.id, { name: "STOCK SUPPLIER", type: "supplier" });
  const item = await createInventoryItem(org.id, {
    code: "WIDGET",
    name: "Widget",
    salePrice: 2_000n,
  });

  console.log("1. Receive 10 @ 1,000 (Dr Inventory 10,000 / Cr AP)…");
  await receiveGoods(org.id, {
    partyId: supplier.id,
    date: new Date(),
    lines: [{ itemId: item.id, quantity: "10", unitCost: 1_000n }],
  });

  console.log("2. Receive 10 @ 1,200 (avg cost → 1,100)…");
  await receiveGoods(org.id, {
    partyId: supplier.id,
    date: new Date(),
    lines: [{ itemId: item.id, quantity: "10", unitCost: 1_200n }],
  });

  console.log("3. Write off 5 units at avg cost (5,500) to General expenses…");
  await writeOffInventory(org.id, {
    date: new Date(),
    expenseAccountId: acc("6000").id,
    lines: [{ itemId: item.id, quantity: "5" }],
  });

  const [items, tb] = await Promise.all([
    listInventoryItems(org.id),
    trialBalance(org.id),
  ]);
  const w = items[0];

  console.log("\n=== Inventory ===");
  console.log(`  ${w.code} ${w.name}: qty ${w.qtyOnHand.toString()}, avg ${formatAmount(w.avgCost, cur)}, value ${formatAmount(w.valueOnHand, cur)}`);

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
  const invNet = net(inv.code);
  const apNet = net(ap.code);
  const expNet = net("6000");

  const ok =
    tb.balanced &&
    w.qtyOnHand.toString() === "15" &&
    w.valueOnHand === 16_500n &&
    w.avgCost === 1_100n &&
    invNet === 16_500n &&
    invNet === w.valueOnHand &&
    apNet === -22_000n &&
    expNet === 5_500n;

  console.log(`\n  Item qty 15 / value 16,500 / avg 1,100: ${w.qtyOnHand.toString() === "15" && w.valueOnHand === 16_500n && w.avgCost === 1_100n ? "✓" : "✗"}`);
  console.log(`  Inventory ledger == subledger value (16,500): ${invNet === w.valueOnHand ? "✓" : "✗"}`);
  console.log(`  AP -22,000 / write-off expense 5,500: ${apNet === -22_000n && expNet === 5_500n ? "✓" : "✗"}`);
  console.log(`\nRESULT: ${ok ? "ALL INVENTORY CHECKS PASSED ✓" : "CHECKS FAILED ✗"}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
