// Verifies inter-account transfers. Run: npx tsx scripts/verify-transfers.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { postEntry } from "@/lib/ledger";
import { createInterAccountTransfer } from "@/lib/documents";
import { trialBalance, balanceSheet } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const stamp = Date.now();
  const cur = "XAF";

  const { org } = await createOrganizationWithOwner({
    name: "Move Bot",
    email: `move+${stamp}@example.com`,
    password: "verify-12345",
    phone: "+237600000000",
    orgName: `Move Co ${stamp}`,
    baseCurrency: cur,
  });

  const accounts = await prisma.account.findMany({ where: { orgId: org.id } });
  const acc = (code: string) => accounts.find((a) => a.code === code)!;

  console.log("1. Owner injects 1,000,000 into Cash (Dr Cash / Cr Equity)…");
  await postEntry({
    orgId: org.id,
    entryDate: new Date(),
    description: "Owner capital",
    lines: [
      { accountId: acc("1000").id, debit: 1_000_000n },
      { accountId: acc("3000").id, credit: 1_000_000n },
    ],
  });

  console.log("2. Transfer 400,000 Cash → Bank (Dr Bank / Cr Cash)…");
  await createInterAccountTransfer(org.id, {
    date: new Date(),
    fromAccountId: acc("1000").id,
    toAccountId: acc("1010").id,
    amount: 400_000n,
    description: "Deposit cash to bank",
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
  console.log(`  Balanced:    ${bs.balanced ? "YES ✓" : "NO ✗"}`);

  const cashRow = tb.accounts.find((a) => a.code === "1000");
  const cashNet = cashRow ? cashRow.debit - cashRow.credit : 0n;
  const bankRow = tb.accounts.find((a) => a.code === "1010");
  const bankNet = bankRow ? bankRow.debit - bankRow.credit : 0n;

  const ok =
    tb.balanced &&
    bs.balanced &&
    cashNet === 600_000n &&
    bankNet === 400_000n &&
    bs.totalAssets === 1_000_000n;

  console.log(`\n  Cash net: ${formatAmount(cashNet, cur)} (expect 600,000)`);
  console.log(`  Bank net: ${formatAmount(bankNet, cur)} (expect 400,000)`);
  console.log(`\nRESULT: ${ok ? "ALL TRANSFER CHECKS PASSED ✓" : "CHECKS FAILED ✗"}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
