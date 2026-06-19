// Verifies the buy-side: purchase invoice + supplier payment clearing AP.
// Run: npx tsx scripts/verify-purchases.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { payableAccount } from "@/lib/accounts";
import { createParty } from "@/lib/parties";
import { createPurchaseInvoice, createPayment } from "@/lib/documents";
import { trialBalance, balanceSheet } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const stamp = Date.now();
  const cur = "XAF";

  const { org } = await createOrganizationWithOwner({
    name: "Buy Bot",
    email: `buy+${stamp}@example.com`,
    password: "verify-12345",
    orgName: `Buy Co ${stamp}`,
    baseCurrency: cur,
  });

  const accounts = await prisma.account.findMany({ where: { orgId: org.id } });
  const acc = (code: string) => accounts.find((a) => a.code === code)!;
  const ap = await payableAccount(org.id);

  const supplier = await createParty(org.id, {
    name: "ACME SUPPLIES LTD",
    type: "supplier",
  });

  console.log("1. Purchase invoice 1,200,000 (Dr General expenses / Cr AP)…");
  await createPurchaseInvoice(org.id, {
    partyId: supplier.id,
    date: new Date(),
    notes: "Office supplies on credit",
    lines: [
      {
        description: "Office supplies",
        quantity: "1",
        unitPrice: 1_200_000n,
        accountId: acc("6000").id,
      },
    ],
  });

  console.log("2. Supplier payment 1,200,000 (Dr AP / Cr Bank) clearing the bill…");
  await createPayment(org.id, {
    date: new Date(),
    bankAccountId: acc("1010").id,
    partyId: supplier.id,
    description: "Pay ACME bill",
    lines: [{ accountId: ap.id, amount: 1_200_000n }],
  });

  const tb = await trialBalance(org.id);
  const bs = await balanceSheet(org.id);

  console.log("\n=== Trial Balance ===");
  for (const a of tb.accounts) {
    console.log(
      `  ${a.code} ${a.name.padEnd(22)} Dr ${formatAmount(a.debit, cur).padStart(12)}  Cr ${formatAmount(a.credit, cur).padStart(12)}`,
    );
  }
  console.log(
    `  TB balanced: ${tb.balanced ? "YES ✓" : "NO ✗"} (Dr ${formatAmount(tb.totalDebit, cur)} / Cr ${formatAmount(tb.totalCredit, cur)})`,
  );

  console.log("\n=== Balance Sheet ===");
  console.log(`  Assets:      ${formatAmount(bs.totalAssets, cur)} ${cur}`);
  console.log(`  Liabilities: ${formatAmount(bs.totalLiabilities, cur)} ${cur}`);
  console.log(`  Equity:      ${formatAmount(bs.totalEquity, cur)} ${cur}`);
  console.log(`  Balanced:    ${bs.balanced ? "YES ✓" : "NO ✗"}`);

  const apRow = tb.accounts.find((a) => a.code === ap.code);
  const apNet = apRow ? apRow.debit - apRow.credit : 0n;
  const bankRow = tb.accounts.find((a) => a.code === "1010");
  const bankNet = bankRow ? bankRow.debit - bankRow.credit : 0n;
  const expRow = tb.accounts.find((a) => a.code === "6000");
  const expNet = expRow ? expRow.debit - expRow.credit : 0n;

  const ok =
    tb.balanced &&
    bs.balanced &&
    apNet === 0n &&
    bankNet === -1_200_000n &&
    expNet === 1_200_000n;

  console.log(`\n  AP net:      ${formatAmount(apNet, cur)} (expect 0 — bill cleared)`);
  console.log(`  Bank net:    ${formatAmount(bankNet, cur)} (expect -1,200,000)`);
  console.log(`  Expense net: ${formatAmount(expNet, cur)} (expect 1,200,000)`);
  console.log(`\nRESULT: ${ok ? "ALL BUY-SIDE CHECKS PASSED ✓" : "CHECKS FAILED ✗"}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
