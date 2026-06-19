// Verifies document edit (receipt update). Run: npx tsx scripts/verify-edit.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { receivableAccount } from "@/lib/accounts";
import { createParty } from "@/lib/parties";
import { createReceipt } from "@/lib/documents";
import { updateReceipt } from "@/lib/document-update";
import { trialBalance } from "@/lib/reports";
import { formatAmount } from "@/lib/money";

async function main() {
  const stamp = Date.now();
  const cur = "XAF";

  const { org } = await createOrganizationWithOwner({
    name: "Edit Bot",
    email: `edit+${stamp}@example.com`,
    password: "verify-12345",
    orgName: `Edit Co ${stamp}`,
    baseCurrency: cur,
  });

  const accounts = await prisma.account.findMany({ where: { orgId: org.id } });
  const acc = (code: string) => accounts.find((a) => a.code === code)!;
  const ar = await receivableAccount(org.id);
  const customer = await createParty(org.id, { name: "EDIT CUSTOMER", type: "customer" });

  const receipt = await createReceipt(org.id, {
    date: new Date(),
    bankAccountId: acc("1000").id,
    partyId: customer.id,
    description: "Original",
    lines: [{ accountId: ar.id, amount: 500_000n }],
  });

  await updateReceipt(org.id, receipt.id, {
    date: new Date(),
    bankAccountId: acc("1000").id,
    partyId: customer.id,
    description: "Updated",
    lines: [{ accountId: ar.id, amount: 750_000n }],
  });

  const updated = await prisma.receipt.findUniqueOrThrow({
    where: { id: receipt.id },
  });
  const tb = await trialBalance(org.id);
  const cashNet = (() => {
    const r = tb.accounts.find((a) => a.code === "1000");
    return r ? r.debit - r.credit : 0n;
  })();

  const ok =
    tb.balanced &&
    updated.total === 750_000n &&
    updated.description === "Updated" &&
    cashNet === 750_000n;

  console.log(`  Receipt total after edit: ${formatAmount(updated.total, cur)} (expect 750,000)`);
  console.log(`  Cash net: ${formatAmount(cashNet, cur)} (expect 750,000)`);
  console.log(`  TB balanced: ${tb.balanced ? "YES ✓" : "NO ✗"}`);
  console.log(`\nRESULT: ${ok ? "EDIT CHECK PASSED ✓" : "EDIT CHECK FAILED ✗"}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
