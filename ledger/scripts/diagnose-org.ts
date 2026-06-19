// Diagnose ledger posting for an org. Run: npx tsx scripts/diagnose-org.ts "BM Commodities"
import { prisma } from "@/lib/prisma";
import { bankAndCashWithBalances } from "@/lib/accounts";
import { trialBalance } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const name = process.argv[2] ?? "BM Commodities";
  const org = await prisma.organization.findFirst({
    where: { name: { contains: name, mode: "insensitive" } },
  });
  if (!org) {
    console.log(`No org matching "${name}"`);
    const all = await prisma.organization.findMany({ select: { id: true, name: true } });
    console.log("Orgs:", all);
    return;
  }

  const cur = org.baseCurrency;
  console.log(`\n=== ${org.name} (${org.id}) ===\n`);

  const receipts = await prisma.receipt.findMany({
    where: { orgId: org.id },
    include: { bankAccount: true, lines: { include: { account: true } } },
  });
  const payments = await prisma.payment.findMany({
    where: { orgId: org.id },
    include: { bankAccount: true, lines: { include: { account: true } } },
  });

  for (const r of receipts) {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: r.journalEntryId },
      include: { lines: { include: { account: true } } },
    });
    console.log(`Receipt ${r.number}: total=${formatAmount(r.total, cur)} into ${r.bankAccount.code} ${r.bankAccount.name}`);
    console.log(`  journalEntryId=${r.journalEntryId} entry exists=${!!entry} lines=${entry?.lines.length ?? 0}`);
    if (entry) {
      for (const l of entry.lines) {
        console.log(
          `    ${l.account.code} ${l.account.name}: Dr ${formatAmount(l.debit, cur)} Cr ${formatAmount(l.credit, cur)}`,
        );
      }
    } else {
      console.log("  *** MISSING JOURNAL ENTRY ***");
    }
    for (const l of r.lines) {
      console.log(`  line: Cr ${l.account.code} ${formatAmount(l.amount, cur)}`);
    }
  }

  for (const p of payments) {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: p.journalEntryId },
      include: { lines: { include: { account: true } } },
    });
    console.log(`Payment ${p.number}: total=${formatAmount(p.total, cur)} from ${p.bankAccount.code} ${p.bankAccount.name}`);
    console.log(`  journalEntryId=${p.journalEntryId} entry exists=${!!entry} lines=${entry?.lines.length ?? 0}`);
    if (entry) {
      for (const l of entry.lines) {
        console.log(
          `    ${l.account.code} ${l.account.name}: Dr ${formatAmount(l.debit, cur)} Cr ${formatAmount(l.credit, cur)}`,
        );
      }
    } else {
      console.log("  *** MISSING JOURNAL ENTRY ***");
    }
  }

  const bankBalances = await bankAndCashWithBalances(org.id);
  console.log("\n=== Bank/cash balances (groupBy) ===");
  for (const a of bankBalances) {
    console.log(`  ${a.code} ${a.name}: ${formatAmount(a.balance, cur)}`);
  }

  const tb = await trialBalance(org.id);
  const cashRows = tb.accounts.filter((a) => a.subtype === "cash" || a.subtype === "bank");
  console.log("\n=== Trial balance bank/cash (raw SQL) ===");
  for (const a of cashRows) {
    const net = a.debit - a.credit;
    console.log(`  ${a.code} ${a.name}: Dr ${formatAmount(a.debit, cur)} Cr ${formatAmount(a.credit, cur)} net=${formatAmount(net, cur)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
