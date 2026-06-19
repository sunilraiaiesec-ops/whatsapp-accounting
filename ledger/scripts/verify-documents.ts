// Verifies document → ledger posting. Run: npx tsx scripts/verify-documents.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { receivableAccount } from "@/lib/accounts";
import { createParty } from "@/lib/parties";
import {
  createSalesInvoice,
  createReceipt,
  createPayment,
} from "@/lib/documents";
import { trialBalance, balanceSheet } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const stamp = Date.now();
  const cur = "XAF";

  const { org } = await createOrganizationWithOwner({
    name: "Doc Bot",
    email: `docs+${stamp}@example.com`,
    password: "verify-12345",
    orgName: `Docs Co ${stamp}`,
    baseCurrency: cur,
  });

  const accounts = await prisma.account.findMany({ where: { orgId: org.id } });
  const acc = (code: string) => accounts.find((a) => a.code === code)!;
  const ar = await receivableAccount(org.id);

  const customer = await createParty(org.id, {
    name: "ELHAJI ZAKARI",
    type: "customer",
  });

  console.log("1. Sales invoice 5,800,000 (Dr AR / Cr Sales)…");
  await createSalesInvoice(org.id, {
    partyId: customer.id,
    date: new Date(),
    lines: [
      {
        description: "Goods sold",
        quantity: "1",
        unitPrice: 5_800_000n,
        accountId: acc("4000").id,
      },
    ],
  });

  console.log("2. Receipt: customer pays 5,800,000 into Cash (Dr Cash / Cr AR)…");
  await createReceipt(org.id, {
    date: new Date(),
    bankAccountId: acc("1000").id,
    partyId: customer.id,
    description: "Customer settles invoice",
    lines: [{ accountId: ar.id, amount: 5_800_000n }],
  });

  console.log("3. Payment: rent 200,000 from Cash (Dr Rent / Cr Cash)…");
  await createPayment(org.id, {
    date: new Date(),
    bankAccountId: acc("1000").id,
    description: "Monthly rent",
    lines: [{ accountId: acc("6200").id, amount: 200_000n }],
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

  // Expected: Cash 5,600,000; AR 0; Sales 5,800,000; Rent 200,000; Net 5,600,000.
  const cashRow = tb.accounts.find((a) => a.code === "1000");
  const cashNet = cashRow ? cashRow.debit - cashRow.credit : 0n;
  const arRow = tb.accounts.find((a) => a.code === ar.code);
  const arNet = arRow ? arRow.debit - arRow.credit : 0n;

  const ok =
    tb.balanced &&
    bs.balanced &&
    cashNet === 5_600_000n &&
    arNet === 0n &&
    bs.totalAssets === 5_600_000n;

  console.log(`\n  Cash net: ${formatAmount(cashNet, cur)} (expect 5,600,000)`);
  console.log(`  AR net:   ${formatAmount(arNet, cur)} (expect 0)`);
  console.log(`\nRESULT: ${ok ? "ALL DOCUMENT CHECKS PASSED ✓" : "CHECKS FAILED ✗"}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
