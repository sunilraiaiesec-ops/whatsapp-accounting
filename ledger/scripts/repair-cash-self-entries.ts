// Fixes receipts/payments whose line account was the same bank/cash account
// (Dr/Cr Cash nets to zero). Run: npx tsx scripts/repair-cash-self-entries.ts "BM Commodities"
import { prisma } from "@/lib/prisma";
import { updateReceipt, updatePayment } from "@/lib/document-update";
import { bankAndCashWithBalances } from "@/lib/accounts";
import { formatAmount } from "@/lib/money";

async function main() {
  const name = process.argv[2] ?? "BM Commodities";
  const org = await prisma.organization.findFirst({
    where: { name: { contains: name, mode: "insensitive" } },
  });
  if (!org) throw new Error(`Org not found: ${name}`);

  const sales = await prisma.account.findFirst({
    where: { orgId: org.id, subtype: "sales" },
  });
  const expenses = await prisma.account.findFirst({
    where: { orgId: org.id, code: "6000" },
  });
  if (!sales || !expenses) throw new Error("Missing default Sales or General expenses account");

  const bankCashIds = new Set(
    (
      await prisma.account.findMany({
        where: { orgId: org.id, subtype: { in: ["bank", "cash"] } },
        select: { id: true },
      })
    ).map((a) => a.id),
  );

  const receipts = await prisma.receipt.findMany({
    where: { orgId: org.id },
    include: { lines: true },
  });

  for (const r of receipts) {
    const bad = r.lines.some((l) => bankCashIds.has(l.accountId));
    if (!bad) continue;

    console.log(`Repairing ${r.number}: line was bank/cash → Sales`);
    await updateReceipt(org.id, r.id, {
      date: r.date,
      bankAccountId: r.bankAccountId,
      partyId: r.partyId,
      reference: r.reference,
      description: r.description,
      lines: r.lines.map((l) => ({
        accountId: bankCashIds.has(l.accountId) ? sales.id : l.accountId,
        amount: l.amount,
        memo: null,
      })),
    });
  }

  const payments = await prisma.payment.findMany({
    where: { orgId: org.id },
    include: { lines: true },
  });

  for (const p of payments) {
    const bad = p.lines.some((l) => bankCashIds.has(l.accountId));
    if (!bad) continue;

    console.log(`Repairing ${p.number}: line was bank/cash → General expenses`);
    await updatePayment(org.id, p.id, {
      date: p.date,
      bankAccountId: p.bankAccountId,
      partyId: p.partyId,
      reference: p.reference,
      description: p.description,
      lines: p.lines.map((l) => ({
        accountId: bankCashIds.has(l.accountId) ? expenses.id : l.accountId,
        amount: l.amount,
        memo: null,
      })),
    });
  }

  const bals = await bankAndCashWithBalances(org.id);
  console.log("\nCash balances after repair:");
  for (const a of bals) {
    console.log(`  ${a.code} ${a.name}: ${formatAmount(a.balance, org.baseCurrency)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
