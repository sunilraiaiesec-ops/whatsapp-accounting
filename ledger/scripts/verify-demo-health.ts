import { DEMO_COMPANIES, resolveDemoOrgByEmail } from "@/lib/demo-accounts";
import { auditDemoOrgHealth } from "@/lib/demo-refresh";
import { prisma } from "@/lib/prisma";

async function main() {
  const now = new Date();
  for (const company of DEMO_COMPANIES) {
    const resolved = await resolveDemoOrgByEmail(company.email);
    if (!resolved) {
      console.log(`${company.name}: NOT FOUND`);
      continue;
    }
    const health = await auditDemoOrgHealth(resolved.orgId, now);
    console.log(`--- ${company.name} ---`);
    console.log(`  orgId:             ${resolved.orgId}`);
    console.log(`  paymentReminders:  ${health.paymentReminders}`);
    console.log(`  overdue:           ${health.overdueInvoices}`);
    console.log(`  openUnpaid:        ${health.unpaidInvoices}`);
    console.log(`  lowStock:          ${health.lowStockItems}`);
    console.log(`  dueRange:          ${health.oldestOpenDueDate} -> ${health.newestDueDate}`);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
