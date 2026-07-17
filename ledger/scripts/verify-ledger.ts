// End-to-end smoke test of the ledger engine against the real database.
// Run with: npx tsx scripts/verify-ledger.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { listAccounts } from "@/lib/accounts";
import { postEntry } from "@/lib/ledger";
import { trialBalance, balanceSheet, profitAndLoss } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const stamp = Date.now();
  const email = `verify+${stamp}@example.com`;

  console.log("1. Creating organization + seeding chart of accounts…");
  const { org } = await createOrganizationWithOwner({
    name: "Verify Bot",
    email,
    password: "verify-12345",
    phone: "+237600000000",
    orgName: `Verify Co ${stamp}`,
    baseCurrency: "XAF",
  });
  const cur = "XAF";

  const accounts = await listAccounts(org.id);
  console.log(`   Seeded ${accounts.length} accounts.`);

  const acc = (code: string) => {
    const a = accounts.find((x) => x.code === code);
    if (!a) throw new Error(`Missing account ${code}`);
    return a;
  };

  console.log("2. Posting owner capital: Dr Cash / Cr Equity 5,800,000…");
  await postEntry({
    orgId: org.id,
    entryDate: new Date(),
    description: "Owner capital contribution",
    lines: [
      { accountId: acc("1000").id, debit: 5_800_000n },
      { accountId: acc("3000").id, credit: 5_800_000n },
    ],
  });

  console.log("3. Posting a cash sale: Dr Cash / Cr Sales 1,200,000…");
  await postEntry({
    orgId: org.id,
    entryDate: new Date(),
    description: "Cash sale",
    lines: [
      { accountId: acc("1000").id, debit: 1_200_000n },
      { accountId: acc("4000").id, credit: 1_200_000n },
    ],
  });

  console.log("4. Posting rent expense: Dr Rent / Cr Cash 200,000…");
  await postEntry({
    orgId: org.id,
    entryDate: new Date(),
    description: "Monthly rent",
    lines: [
      { accountId: acc("6200").id, debit: 200_000n },
      { accountId: acc("1000").id, credit: 200_000n },
    ],
  });

  console.log("\n5. Verifying balancing rejection (should throw)…");
  let rejected = false;
  try {
    await postEntry({
      orgId: org.id,
      entryDate: new Date(),
      description: "Unbalanced (should fail)",
      lines: [
        { accountId: acc("1000").id, debit: 100n },
        { accountId: acc("4000").id, credit: 50n },
      ],
    });
  } catch {
    rejected = true;
  }
  console.log(`   Unbalanced entry rejected: ${rejected ? "YES ✓" : "NO ✗"}`);

  const now = new Date();
  const tb = await trialBalance(org.id);
  const bs = await balanceSheet(org.id);
  const pnl = await profitAndLoss(
    org.id,
    new Date(now.getFullYear(), 0, 1),
    now,
  );

  console.log("\n=== Trial Balance ===");
  for (const a of tb.accounts) {
    console.log(
      `  ${a.code} ${a.name.padEnd(22)} Dr ${formatAmount(a.debit, cur).padStart(12)}  Cr ${formatAmount(a.credit, cur).padStart(12)}`,
    );
  }
  console.log(
    `  TOTAL Dr ${formatAmount(tb.totalDebit, cur)} / Cr ${formatAmount(tb.totalCredit, cur)} — balanced: ${tb.balanced ? "YES ✓" : "NO ✗"}`,
  );

  console.log("\n=== Balance Sheet ===");
  console.log(`  Total assets:      ${formatAmount(bs.totalAssets, cur)} ${cur}`);
  console.log(`  Total liabilities: ${formatAmount(bs.totalLiabilities, cur)} ${cur}`);
  console.log(`  Total equity:      ${formatAmount(bs.totalEquity, cur)} ${cur}`);
  console.log(`  Assets == L + E:   ${bs.balanced ? "YES ✓" : "NO ✗"}`);

  console.log("\n=== Profit & Loss (YTD) ===");
  console.log(`  Income:   ${formatAmount(pnl.totalIncome, cur)} ${cur}`);
  console.log(`  Expenses: ${formatAmount(pnl.totalExpenses, cur)} ${cur}`);
  console.log(`  Net:      ${formatAmount(pnl.netProfit, cur)} ${cur}`);

  const allGood = tb.balanced && bs.balanced && rejected;
  console.log(`\nRESULT: ${allGood ? "ALL CHECKS PASSED ✓" : "SOME CHECKS FAILED ✗"}`);

  await prisma.$disconnect();
  process.exit(allGood ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
