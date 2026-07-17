// Verifies credit & debit notes. Run: npx tsx scripts/verify-notes.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { receivableAccount, payableAccount } from "@/lib/accounts";
import { createParty } from "@/lib/parties";
import {
  createSalesInvoice,
  createPurchaseInvoice,
  createCreditNote,
  createDebitNote,
} from "@/lib/documents";
import { trialBalance, balanceSheet } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const stamp = Date.now();
  const cur = "XAF";

  const { org } = await createOrganizationWithOwner({
    name: "Note Bot",
    email: `note+${stamp}@example.com`,
    password: "verify-12345",
    phone: "+237600000000",
    orgName: `Note Co ${stamp}`,
    baseCurrency: cur,
  });

  const accounts = await prisma.account.findMany({ where: { orgId: org.id } });
  const acc = (code: string) => accounts.find((a) => a.code === code)!;
  const ar = await receivableAccount(org.id);
  const ap = await payableAccount(org.id);

  const customer = await createParty(org.id, { name: "CUSTOMER A", type: "customer" });
  const supplier = await createParty(org.id, { name: "SUPPLIER B", type: "supplier" });

  console.log("1. Sales invoice 1,000,000 (Dr AR / Cr Sales)…");
  await createSalesInvoice(org.id, {
    partyId: customer.id,
    date: new Date(),
    lines: [{ description: "Goods", quantity: "1", unitPrice: 1_000_000n, accountId: acc("4000").id }],
  });

  console.log("2. Credit note 200,000 (Dr Sales / Cr AR) — customer returns goods…");
  await createCreditNote(org.id, {
    partyId: customer.id,
    date: new Date(),
    lines: [{ description: "Returned goods", quantity: "1", unitPrice: 200_000n, accountId: acc("4000").id }],
  });

  console.log("3. Purchase invoice 500,000 (Dr Expense / Cr AP)…");
  await createPurchaseInvoice(org.id, {
    partyId: supplier.id,
    date: new Date(),
    lines: [{ description: "Supplies", quantity: "1", unitPrice: 500_000n, accountId: acc("6000").id }],
  });

  console.log("4. Debit note 100,000 (Dr AP / Cr Expense) — return to supplier…");
  await createDebitNote(org.id, {
    partyId: supplier.id,
    date: new Date(),
    lines: [{ description: "Returned supplies", quantity: "1", unitPrice: 100_000n, accountId: acc("6000").id }],
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
  console.log(`\n  BS balanced: ${bs.balanced ? "YES ✓" : "NO ✗"}`);

  const net = (code: string) => {
    const r = tb.accounts.find((a) => a.code === code);
    return r ? r.debit - r.credit : 0n;
  };
  const arNet = net(ar.code);
  const apNet = net(ap.code);
  const salesNet = net("4000");
  const expNet = net("6000");

  const ok =
    tb.balanced &&
    bs.balanced &&
    arNet === 800_000n &&
    apNet === -400_000n &&
    salesNet === -800_000n &&
    expNet === 400_000n;

  console.log(`\n  AR net:    ${formatAmount(arNet, cur)} (expect 800,000 after credit note)`);
  console.log(`  AP net:    ${formatAmount(apNet, cur)} (expect -400,000 after debit note)`);
  console.log(`  Sales net: ${formatAmount(salesNet, cur)} (expect -800,000)`);
  console.log(`  Expense:   ${formatAmount(expNet, cur)} (expect 400,000)`);
  console.log(`\nRESULT: ${ok ? "ALL NOTE CHECKS PASSED ✓" : "CHECKS FAILED ✗"}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
