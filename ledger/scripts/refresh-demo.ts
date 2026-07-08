/**
 * Force-refresh the three Bantoo Books demo organizations without a full reseed.
 *
 * Rolls document dates forward, trims payment reminders to a realistic count,
 * and rebalances inventory so dashboards look active every day.
 *
 * Usage (writes to whatever DATABASE_URL points at):
 *   SEED_DEMO=1 npx tsx scripts/refresh-demo.ts
 */
import { prisma } from "@/lib/prisma";
import { DEMO_COMPANIES, resolveDemoOrgByEmail } from "@/lib/demo-accounts";
import {
  auditDemoOrgHealth,
  refreshDemoAccountData,
} from "@/lib/demo-refresh";

if (!process.env.SEED_DEMO) {
  console.error(
    "\nRefusing to run without SEED_DEMO=1.\n" +
      "This script updates the three demo companies in the database.\n" +
      "  SEED_DEMO=1 npx tsx scripts/refresh-demo.ts\n",
  );
  process.exit(1);
}

function maskDbUrl(url: string): string {
  return url.replace(/:[^:@/]+@/, ":****@");
}

async function main() {
  const t0 = Date.now();
  const db = process.env.DATABASE_URL ?? "";
  console.log("\n=== Demo company refresh (FORCE) ===");
  console.log(`DB: ${maskDbUrl(db)}\n`);

  if (!db) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  let refreshed = 0;
  let missing = 0;
  let failed = 0;

  for (const company of DEMO_COMPANIES) {
    const resolved = await resolveDemoOrgByEmail(company.email);
    if (!resolved) {
      console.log(`• ${company.name}: not found — run seed-demo.ts first.`);
      missing++;
      continue;
    }

    console.log(`── ${company.name} ──`);
    console.log(`   Email:  ${resolved.email}`);
    console.log(`   Org ID: ${resolved.orgId}`);
    if (resolved.orgName !== company.name) {
      console.log(`   Note:   DB name "${resolved.orgName}" differs from expected "${company.name}"`);
    }

    const before = await auditDemoOrgHealth(resolved.orgId);
    console.log(
      `   Before: ${before.paymentReminders} reminders (${before.overdueInvoices} overdue), ${before.unpaidInvoices} open, due ${before.oldestOpenDueDate ?? "—"} → ${before.newestDueDate ?? "—"}`,
    );

    const result = await refreshDemoAccountData(resolved.orgId, new Date(), { force: true });
    if (!result) {
      console.log(`   ✗ Refresh returned null — aborting this org.`);
      failed++;
      continue;
    }

    const after = await auditDemoOrgHealth(resolved.orgId);
    console.log(
      `   After:  ${after.paymentReminders} reminders (${after.overdueInvoices} overdue), ${after.unpaidInvoices} open, due ${after.oldestOpenDueDate ?? "—"} → ${after.newestDueDate ?? "—"}`,
    );
    console.log(
      `   ✓ Shifted ${result.shiftedDays}d | low-stock ${result.lowStockItems}`,
    );

    const healthy =
      after.paymentReminders >= 6 &&
      after.paymentReminders <= 8 &&
      after.overdueInvoices <= 3 &&
      after.unpaidInvoices <= 8 &&
      after.lowStockItems >= 3 &&
      after.lowStockItems <= 8;

    if (!healthy) {
      console.log(`   ✗ Health check FAILED for ${company.name}`);
      failed++;
    } else {
      refreshed++;
    }
    console.log("");
  }

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  console.log(`Healthy: ${refreshed}  |  Missing: ${missing}  |  Failed: ${failed}\n`);

  await prisma.$disconnect();
  process.exit(missing === DEMO_COMPANIES.length || failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nRefresh crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
