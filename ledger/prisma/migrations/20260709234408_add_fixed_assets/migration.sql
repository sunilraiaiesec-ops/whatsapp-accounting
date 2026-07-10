-- CreateEnum
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE');

-- CreateEnum
CREATE TYPE "DepreciationScheduleStatus" AS ENUM ('SCHEDULED', 'POSTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "fixed_asset_categories" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fixedAssetAccountId" TEXT NOT NULL,
    "accumulatedDeprecAccountId" TEXT NOT NULL,
    "depreciationExpenseAccountId" TEXT NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningBalanceRate" DECIMAL(7,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "partyId" TEXT,
    "purchaseDate" DATE NOT NULL,
    "placedInServiceDate" DATE NOT NULL,
    "purchaseCost" BIGINT NOT NULL,
    "salvageValue" BIGINT NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningBalanceRate" DECIMAL(7,4),
    "fixedAssetAccountId" TEXT NOT NULL,
    "accumulatedDeprecAccountId" TEXT NOT NULL,
    "depreciationExpenseAccountId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "accumulatedDepreciation" BIGINT NOT NULL DEFAULT 0,
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposalDate" DATE,
    "disposalProceeds" BIGINT,
    "disposalReceivingAccountId" TEXT,
    "disposalGainLoss" BIGINT,
    "disposalNotes" TEXT,
    "disposalJournalEntryId" TEXT,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_depreciation_schedules" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "depreciationAmount" BIGINT NOT NULL,
    "accumulatedDepreciationAfter" BIGINT NOT NULL,
    "bookValueAfter" BIGINT NOT NULL,
    "status" "DepreciationScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "journalEntryId" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_asset_depreciation_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fixed_asset_categories_orgId_idx" ON "fixed_asset_categories"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_categories_orgId_name_key" ON "fixed_asset_categories"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_disposalJournalEntryId_key" ON "fixed_assets"("disposalJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_journalEntryId_key" ON "fixed_assets"("journalEntryId");

-- CreateIndex
CREATE INDEX "fixed_assets_orgId_status_idx" ON "fixed_assets"("orgId", "status");

-- CreateIndex
CREATE INDEX "fixed_assets_categoryId_idx" ON "fixed_assets"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_orgId_code_key" ON "fixed_assets"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_depreciation_schedules_journalEntryId_key" ON "fixed_asset_depreciation_schedules"("journalEntryId");

-- CreateIndex
CREATE INDEX "fixed_asset_depreciation_schedules_orgId_idx" ON "fixed_asset_depreciation_schedules"("orgId");

-- CreateIndex
CREATE INDEX "fixed_asset_depreciation_schedules_assetId_status_idx" ON "fixed_asset_depreciation_schedules"("assetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_depreciation_schedules_assetId_periodStart_key" ON "fixed_asset_depreciation_schedules"("assetId", "periodStart");

-- AddForeignKey
ALTER TABLE "fixed_asset_categories" ADD CONSTRAINT "fixed_asset_categories_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_categories" ADD CONSTRAINT "fixed_asset_categories_fixedAssetAccountId_fkey" FOREIGN KEY ("fixedAssetAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_categories" ADD CONSTRAINT "fixed_asset_categories_accumulatedDeprecAccountId_fkey" FOREIGN KEY ("accumulatedDeprecAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_categories" ADD CONSTRAINT "fixed_asset_categories_depreciationExpenseAccountId_fkey" FOREIGN KEY ("depreciationExpenseAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "fixed_asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_fixedAssetAccountId_fkey" FOREIGN KEY ("fixedAssetAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_accumulatedDeprecAccountId_fkey" FOREIGN KEY ("accumulatedDeprecAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_depreciationExpenseAccountId_fkey" FOREIGN KEY ("depreciationExpenseAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_disposalReceivingAccountId_fkey" FOREIGN KEY ("disposalReceivingAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_depreciation_schedules" ADD CONSTRAINT "fixed_asset_depreciation_schedules_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_depreciation_schedules" ADD CONSTRAINT "fixed_asset_depreciation_schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
