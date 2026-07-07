-- CreateEnum
CREATE TYPE "OnboardingChoice" AS ENUM ('NEW_BUSINESS', 'EXISTING_BUSINESS');

-- CreateEnum
CREATE TYPE "MigrationWizardStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "onboardingChoice" "OnboardingChoice";

-- CreateTable
CREATE TABLE "migration_wizards" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "MigrationWizardStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "openingDate" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_wizards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_opening_balances" (
    "id" TEXT NOT NULL,
    "wizardId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_customer_balances" (
    "id" TEXT NOT NULL,
    "wizardId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_customer_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_supplier_balances" (
    "id" TEXT NOT NULL,
    "wizardId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_supplier_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_inventory_balances" (
    "id" TEXT NOT NULL,
    "wizardId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "unitCost" BIGINT NOT NULL DEFAULT 0,
    "totalValue" BIGINT NOT NULL DEFAULT 0,
    "warehouse" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_bank_balances" (
    "id" TEXT NOT NULL,
    "wizardId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_bank_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_acknowledged_warnings" (
    "id" TEXT NOT NULL,
    "wizardId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_acknowledged_warnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_import_runs" (
    "id" TEXT NOT NULL,
    "wizardId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "entityKind" TEXT NOT NULL,
    "fileName" TEXT,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "migration_wizards_orgId_key" ON "migration_wizards"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "migration_opening_balances_wizardId_accountId_key" ON "migration_opening_balances"("wizardId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "migration_customer_balances_wizardId_partyId_key" ON "migration_customer_balances"("wizardId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "migration_supplier_balances_wizardId_partyId_key" ON "migration_supplier_balances"("wizardId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "migration_inventory_balances_wizardId_itemId_key" ON "migration_inventory_balances"("wizardId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "migration_bank_balances_wizardId_accountId_key" ON "migration_bank_balances"("wizardId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "migration_acknowledged_warnings_wizardId_code_key" ON "migration_acknowledged_warnings"("wizardId", "code");

-- AddForeignKey
ALTER TABLE "migration_wizards" ADD CONSTRAINT "migration_wizards_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_wizards" ADD CONSTRAINT "migration_wizards_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_opening_balances" ADD CONSTRAINT "migration_opening_balances_wizardId_fkey" FOREIGN KEY ("wizardId") REFERENCES "migration_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_opening_balances" ADD CONSTRAINT "migration_opening_balances_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_customer_balances" ADD CONSTRAINT "migration_customer_balances_wizardId_fkey" FOREIGN KEY ("wizardId") REFERENCES "migration_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_customer_balances" ADD CONSTRAINT "migration_customer_balances_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_supplier_balances" ADD CONSTRAINT "migration_supplier_balances_wizardId_fkey" FOREIGN KEY ("wizardId") REFERENCES "migration_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_supplier_balances" ADD CONSTRAINT "migration_supplier_balances_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_inventory_balances" ADD CONSTRAINT "migration_inventory_balances_wizardId_fkey" FOREIGN KEY ("wizardId") REFERENCES "migration_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_inventory_balances" ADD CONSTRAINT "migration_inventory_balances_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_bank_balances" ADD CONSTRAINT "migration_bank_balances_wizardId_fkey" FOREIGN KEY ("wizardId") REFERENCES "migration_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_bank_balances" ADD CONSTRAINT "migration_bank_balances_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_acknowledged_warnings" ADD CONSTRAINT "migration_acknowledged_warnings_wizardId_fkey" FOREIGN KEY ("wizardId") REFERENCES "migration_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_import_runs" ADD CONSTRAINT "migration_import_runs_wizardId_fkey" FOREIGN KEY ("wizardId") REFERENCES "migration_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
