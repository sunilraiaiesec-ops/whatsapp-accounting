/**
 * Adversarial / edge-case probes that complement stress-test.ts.
 * Confirms guards REJECT bad input, and hunts for concurrency bugs the
 * happy-path generator can't hit. Local DB only.
 */
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { listAccounts } from "@/lib/accounts";
import { createParty } from "@/lib/parties";
import { createInventoryItem, receiveGoods, adjustInventory } from "@/lib/inventory";
import { createSalesInvoice, createReceipt } from "@/lib/documents";
import { postEntry } from "@/lib/ledger";

const DB = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(DB)) {
  console.error("✗ REFUSING TO RUN: DATABASE_URL is not local.");
  process.exit(1);
}

const STAMP = Date.now();
type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];
const expectThrow = async (name: string, fn: () => Promise<unknown>, detail = "") => {
  try {
    await fn();
    results.push({ name, pass: false, detail: `did NOT reject — ${detail}` });
  } catch (err) {
    results.push({ name, pass: true, detail: `rejected: ${(err as Error).message.slice(0, 80)}` });
  }
};

async function main() {
  console.log("\n=== Adversarial probes ===\n");

  const { org } = await createOrganizationWithOwner({
    name: "Probe CFO",
    email: `probe+${STAMP}@example.com`,
    password: "probe-12345",
    orgName: `Probe Co [${STAMP}]`,
    baseCurrency: "XAF",
  });
  const accounts = await listAccounts(org.id);
  const acc = (code: string) => accounts.find((a) => a.code === code)!;

  const customer = await createParty(org.id, { name: "Cust", type: "customer" });
  const supplier = await createParty(org.id, { name: "Supp", type: "supplier" });
  const item = await createInventoryItem(org.id, { code: "P1", name: "Widget", salePrice: 10000n });
  await receiveGoods(org.id, {
    partyId: supplier.id,
    date: new Date(),
    lines: [{ itemId: item.id, quantity: "10", unitCost: 6000n }],
  });

  // --- Guards must reject bad input ---
  await expectThrow("unbalanced manual entry rejected", () =>
    postEntry({
      orgId: org.id,
      entryDate: new Date(),
      lines: [{ accountId: acc("6000").id, debit: 100n }, { accountId: acc("1010").id, credit: 50n }],
    }),
  );

  await expectThrow("oversell inventory rejected", () =>
    createSalesInvoice(org.id, {
      partyId: customer.id,
      date: new Date(),
      lines: [{ description: "too many", quantity: "999", unitPrice: 10000n, accountId: acc("4000").id, itemId: item.id }],
    }),
  );

  await expectThrow("negative inventory adjustment rejected", () =>
    adjustInventory(org.id, {
      date: new Date(),
      adjustmentAccountId: acc("6000").id,
      lines: [{ itemId: item.id, newQuantity: "-5" }],
    }),
  );

  // Cross-org account use rejected.
  const { org: other } = await createOrganizationWithOwner({
    name: "Other", email: `probe2+${STAMP}@example.com`, password: "probe-12345",
    orgName: `Other Co [${STAMP}]`, baseCurrency: "XAF",
  });
  const otherAccounts = await listAccounts(other.id);
  await expectThrow("cross-org account posting rejected", () =>
    postEntry({
      orgId: org.id,
      entryDate: new Date(),
      lines: [
        { accountId: otherAccounts.find((a) => a.code === "1010")!.id, debit: 100n },
        { accountId: acc("3000").id, credit: 100n },
      ],
    }),
  );

  // --- Concurrency: fire many same-type documents at once in ONE org ---
  // Document numbers are derived from count()+1, so simultaneous posts may
  // collide on the @@unique([orgId, number]) index.
  const N = 30;
  const settled = await Promise.allSettled(
    Array.from({ length: N }, () =>
      createReceipt(org.id, {
        date: new Date(),
        bankAccountId: acc("1010").id,
        lines: [{ accountId: acc("4000").id, amount: 5000n }],
      }),
    ),
  );
  const failed = settled.filter((r) => r.status === "rejected");
  const receipts = await prisma.receipt.findMany({ where: { orgId: org.id }, select: { number: true } });
  const numbers = receipts.map((r) => r.number);
  const distinct = new Set(numbers);
  const dupes = numbers.length - distinct.size;
  results.push({
    name: `concurrent same-type posting (${N} at once)`,
    pass: failed.length === 0 && dupes === 0,
    detail: `${failed.length} rejected, ${dupes} duplicate numbers, ${receipts.length} receipts` +
      (failed.length ? ` — e.g. ${(failed[0] as PromiseRejectedResult).reason?.message?.slice(0, 90)}` : ""),
  });

  console.log("RESULTS:");
  let fails = 0;
  for (const r of results) {
    if (!r.pass) fails++;
    console.log(`  ${r.pass ? "✓" : "✗ FAIL"}  ${r.name.padEnd(46)} ${r.detail}`);
  }
  console.log(`\n${fails === 0 ? "All probes behaved as expected ✓" : `${fails} probe(s) revealed an issue ✗`}\n`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
