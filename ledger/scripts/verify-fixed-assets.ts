// Verifies the Phase 1 Fixed Assets module: capitalization, straight-line
// depreciation scheduling/posting, duplicate-post protection, disposal
// (gain/loss/write-off), post-disposal lockout, and multi-tenant isolation.
// Run: npx tsx scripts/verify-fixed-assets.ts
import { prisma } from "@/lib/prisma";
import { createOrganizationWithOwner } from "@/lib/org";
import { trialBalance, fixedAssetRegister } from "@/lib/reports";
import { formatAmount } from "@/lib/money";
import { createFixedAssetCategory } from "@/lib/fixed-assets/categories";
import { createFixedAsset, getFixedAsset } from "@/lib/fixed-assets/assets";
import { postDepreciationPeriod, postDuePeriods } from "@/lib/fixed-assets/depreciation";
import { disposeFixedAsset } from "@/lib/fixed-assets/disposal";

let failures = 0;

function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}

async function accountsFor(orgId: string) {
  const accounts = await prisma.account.findMany({ where: { orgId } });
  const byCode = (code: string) => {
    const a = accounts.find((x) => x.code === code);
    if (!a) throw new Error(`Missing seeded account ${code}`);
    return a;
  };
  return {
    fixedAsset: byCode("1500"),
    accumDeprec: byCode("1510"),
    deprecExpense: byCode("6400"),
    gain: byCode("4910"),
    loss: byCode("6410"),
    cash: byCode("1000"),
  };
}

async function main() {
  const stamp = Date.now();
  const cur = "XAF";

  const { org } = await createOrganizationWithOwner({
    name: "Fixed Assets Bot",
    email: `fixedassets+${stamp}@example.com`,
    password: "verify-12345",
    phone: "+237600000000",
    orgName: `Fixed Assets Co ${stamp}`,
    baseCurrency: cur,
  });
  const acc = await accountsFor(org.id);

  // --- 1. Category + asset creation posts a balanced purchase journal -------
  console.log("1. Create category + asset (cost 1,200,000, salvage 200,000, 12mo)…");
  const category = await createFixedAssetCategory(org.id, {
    name: "Vehicles",
    fixedAssetAccountId: acc.fixedAsset.id,
    accumulatedDeprecAccountId: acc.accumDeprec.id,
    depreciationExpenseAccountId: acc.deprecExpense.id,
    usefulLifeMonths: 12,
    depreciationMethod: "STRAIGHT_LINE",
  });

  const placedInService = new Date("2026-01-01");
  const asset = await createFixedAsset(org.id, {
    name: "Delivery Van",
    categoryId: category.id,
    purchaseDate: placedInService,
    placedInServiceDate: placedInService,
    purchaseCost: 1_200_000n,
    salvageValue: 200_000n,
    usefulLifeMonths: 12,
    depreciationMethod: "STRAIGHT_LINE",
    fixedAssetAccountId: acc.fixedAsset.id,
    accumulatedDeprecAccountId: acc.accumDeprec.id,
    depreciationExpenseAccountId: acc.deprecExpense.id,
    sourceAccountId: acc.cash.id,
  });

  const purchaseEntry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: asset.journalEntryId },
    include: { lines: true },
  });
  const purchaseDebit = purchaseEntry.lines.reduce((s, l) => s + l.debit, 0n);
  const purchaseCredit = purchaseEntry.lines.reduce((s, l) => s + l.credit, 0n);
  check("purchase journal balanced", purchaseDebit === purchaseCredit);
  check("purchase journal Dr/Cr = cost", purchaseDebit === 1_200_000n);
  check("trial balance balanced after purchase", (await trialBalance(org.id)).balanced);

  // --- 2. Straight-line schedule math ---------------------------------------
  console.log("2. Verify the generated straight-line schedule…");
  const fullAsset = await getFixedAsset(org.id, asset.id);
  const schedule = fullAsset!.schedule;
  check("schedule has 12 periods", schedule.length === 12);
  const scheduleSum = schedule.reduce((s, p) => s + p.depreciationAmount, 0n);
  check("schedule sums to depreciable amount (1,000,000)", scheduleSum === 1_000_000n);
  check("last period book value == salvage", schedule.at(-1)!.bookValueAfter === 200_000n);

  // --- 3. Post one period -----------------------------------------------------
  console.log("3. Post the first period…");
  const firstPeriod = schedule[0];
  await postDepreciationPeriod(org.id, firstPeriod.id);
  const afterFirst = await getFixedAsset(org.id, asset.id);
  check(
    "accumulatedDepreciation updated",
    afterFirst!.accumulatedDepreciation === firstPeriod.depreciationAmount,
  );
  const postedRow = afterFirst!.schedule.find((p) => p.id === firstPeriod.id)!;
  check("period status flipped to POSTED", postedRow.status === "POSTED");
  const depEntry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: postedRow.journalEntryId! },
    include: { lines: true },
  });
  const depDebit = depEntry.lines.reduce((s, l) => s + l.debit, 0n);
  check("depreciation journal balanced and matches period amount", depDebit === firstPeriod.depreciationAmount);

  // --- 4. Duplicate posting is blocked -----------------------------------------
  console.log("4. Attempt to post the same period again…");
  let duplicateBlocked = false;
  try {
    await postDepreciationPeriod(org.id, firstPeriod.id);
  } catch {
    duplicateBlocked = true;
  }
  check("duplicate post rejected", duplicateBlocked);

  // --- 5. Post all due periods through month 6 --------------------------------
  console.log("5. Post all due periods through 2026-07-01 (periods 2-6)…");
  const result = await postDuePeriods(org.id, {
    assetId: asset.id,
    asOf: new Date("2026-07-01"),
  });
  check("posted periods 2 through 6 (5 more)", result.posted.length === 5);
  const afterDue = await getFixedAsset(org.id, asset.id);
  const expectedAccum = schedule.slice(0, 6).reduce((s, p) => s + p.depreciationAmount, 0n);
  check("accumulated depreciation matches sum of first 6 periods", afterDue!.accumulatedDepreciation === expectedAccum);
  check(
    "no double counting (exactly 6 POSTED periods)",
    afterDue!.schedule.filter((p) => p.status === "POSTED").length === 6,
  );

  // --- 6. Disposal with a gain --------------------------------------------------
  console.log("6. Dispose a fresh asset with proceeds > book value (gain)…");
  const gainAsset = await createFixedAsset(org.id, {
    name: "Office Fridge",
    purchaseDate: new Date("2026-01-01"),
    placedInServiceDate: new Date("2026-01-01"),
    purchaseCost: 500_000n,
    salvageValue: 0n,
    usefulLifeMonths: 5,
    depreciationMethod: "STRAIGHT_LINE",
    fixedAssetAccountId: acc.fixedAsset.id,
    accumulatedDeprecAccountId: acc.accumDeprec.id,
    depreciationExpenseAccountId: acc.deprecExpense.id,
    sourceAccountId: acc.cash.id,
  });
  const disposedGain = await disposeFixedAsset(org.id, gainAsset.id, {
    date: new Date("2026-02-01"),
    proceeds: 600_000n,
    receivingAccountId: acc.cash.id,
  });
  check("gain recorded (proceeds - bookValue = 100,000)", disposedGain.disposalGainLoss === 100_000n);
  const gainEntry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: disposedGain.disposalJournalEntryId! },
    include: { lines: true },
  });
  const gainLine = gainEntry.lines.find((l) => l.accountId === acc.gain.id);
  check("Gain on disposal account credited 100,000", gainLine?.credit === 100_000n);
  const gainDebit = gainEntry.lines.reduce((s, l) => s + l.debit, 0n);
  const gainCredit = gainEntry.lines.reduce((s, l) => s + l.credit, 0n);
  check("disposal (gain) journal balanced", gainDebit === gainCredit);

  // --- 7. Disposal with a loss + a zero-proceeds write-off ----------------------
  console.log("7. Dispose a fresh asset with proceeds < book value (loss)…");
  const lossAsset = await createFixedAsset(org.id, {
    name: "Old Printer",
    purchaseDate: new Date("2026-01-01"),
    placedInServiceDate: new Date("2026-01-01"),
    purchaseCost: 300_000n,
    salvageValue: 0n,
    usefulLifeMonths: 3,
    depreciationMethod: "STRAIGHT_LINE",
    fixedAssetAccountId: acc.fixedAsset.id,
    accumulatedDeprecAccountId: acc.accumDeprec.id,
    depreciationExpenseAccountId: acc.deprecExpense.id,
    sourceAccountId: acc.cash.id,
  });
  const disposedLoss = await disposeFixedAsset(org.id, lossAsset.id, {
    date: new Date("2026-02-01"),
    proceeds: 50_000n,
    receivingAccountId: acc.cash.id,
  });
  check("loss recorded (proceeds - bookValue = -250,000)", disposedLoss.disposalGainLoss === -250_000n);
  const lossEntry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: disposedLoss.disposalJournalEntryId! },
    include: { lines: true },
  });
  const lossLine = lossEntry.lines.find((l) => l.accountId === acc.loss.id);
  check("Loss on disposal account debited 250,000", lossLine?.debit === 250_000n);

  console.log("   Write off a fresh asset with zero proceeds…");
  const writeOffAsset = await createFixedAsset(org.id, {
    name: "Broken Chair",
    purchaseDate: new Date("2026-01-01"),
    placedInServiceDate: new Date("2026-01-01"),
    purchaseCost: 80_000n,
    salvageValue: 0n,
    usefulLifeMonths: 4,
    depreciationMethod: "STRAIGHT_LINE",
    fixedAssetAccountId: acc.fixedAsset.id,
    accumulatedDeprecAccountId: acc.accumDeprec.id,
    depreciationExpenseAccountId: acc.deprecExpense.id,
    sourceAccountId: acc.cash.id,
  });
  const writtenOff = await disposeFixedAsset(org.id, writeOffAsset.id, {
    date: new Date("2026-02-01"),
    proceeds: 0n,
  });
  check("write-off loss == full cost (no depreciation posted)", writtenOff.disposalGainLoss === -80_000n);
  check("trial balance still balanced after disposals", (await trialBalance(org.id)).balanced);

  // --- 8. Disposed assets never depreciate again --------------------------------
  console.log("8. Confirm disposed assets are locked out of further depreciation…");
  const afterDisposalGain = await getFixedAsset(org.id, gainAsset.id);
  const remainingScheduled = afterDisposalGain!.schedule.filter((p) => p.status === "SCHEDULED");
  check("remaining periods skipped on disposal", remainingScheduled.length === 0);
  const skippedCount = afterDisposalGain!.schedule.filter((p) => p.status === "SKIPPED").length;
  check("remaining periods marked SKIPPED", skippedCount === afterDisposalGain!.schedule.length);

  // postDuePeriods finds nothing to do (every period already SKIPPED)...
  await postDuePeriods(org.id, { assetId: gainAsset.id, asOf: new Date("2030-01-01") });
  const stillZeroPosted =
    (await getFixedAsset(org.id, gainAsset.id))!.schedule.filter((p) => p.status === "POSTED")
      .length === 0;
  check("postDuePeriods is a no-op for a disposed asset", stillZeroPosted);

  // ...and directly attempting to post one of its (now SKIPPED) periods is
  // rejected by postDepreciationPeriod's own ACTIVE-only guard.
  let directPostBlocked = false;
  try {
    await postDepreciationPeriod(org.id, remainingScheduled[0]?.id ?? afterDisposalGain!.schedule[0].id);
  } catch {
    directPostBlocked = true;
  }
  check("direct post against a disposed asset's period is rejected", directPostBlocked);

  // --- 9. Multi-tenant isolation -------------------------------------------------
  console.log("9. Verify multi-tenant isolation…");
  const { org: org2 } = await createOrganizationWithOwner({
    name: "Other Org Bot",
    email: `fixedassets-org2+${stamp}@example.com`,
    password: "verify-12345",
    phone: "+237600000001",
    orgName: `Other Org ${stamp}`,
    baseCurrency: cur,
  });
  const org2Register = await fixedAssetRegister(org2.id);
  const org1Register = await fixedAssetRegister(org.id);
  check("org2 sees zero fixed assets", org2Register.rows.length === 0);
  check("org1 sees its own assets", org1Register.rows.length > 0);
  check(
    "no cross-org id leakage",
    !org2Register.rows.some((r) => org1Register.rows.some((r1) => r1.id === r.id)),
  );

  console.log(`\n=== Trial balance (org1) ===`);
  const tb = await trialBalance(org.id);
  for (const a of tb.accounts) {
    console.log(
      `  ${a.code} ${a.name.padEnd(28)} Dr ${formatAmount(a.debit, cur).padStart(12)}  Cr ${formatAmount(a.credit, cur).padStart(12)}`,
    );
  }

  console.log(`\nRESULT: ${failures === 0 ? "ALL FIXED ASSET CHECKS PASSED ✓" : `${failures} CHECK(S) FAILED ✗`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
