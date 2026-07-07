-- CreateEnum
CREATE TYPE "PendingTransactionType" AS ENUM ('expense', 'purchase_invoice', 'sales_invoice', 'payment_received', 'supplier_payment', 'inventory_adjustment', 'stock_receipt');

-- CreateEnum
CREATE TYPE "PendingTransactionStatus" AS ENUM ('pending', 'approved', 'rejected', 'needs_correction');

-- AlterEnum
-- Role gains 5 new tiers (ACCOUNTANT, MANAGER, CASHIER, WAREHOUSE_STAFF,
-- SALESPERSON, VIEWER) and drops STAFF. Every existing membership is
-- remapped so no current user's access silently breaks:
--   OWNER  -> OWNER       (unchanged)
--   ADMIN  -> ADMIN       (unchanged)
--   STAFF  -> ACCOUNTANT  (closest capability match — see lib/permissions.ts
--                          module comment for the full justification)
-- The column is widened to TEXT for the duration of the remap because
-- Postgres enums cannot contain a value ('ACCOUNTANT') that doesn't exist on
-- the OLD enum type, so the rewrite can't happen while the column is still
-- typed as the old "Role" enum.
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('OWNER', 'ADMIN', 'ACCOUNTANT', 'MANAGER', 'CASHIER', 'WAREHOUSE_STAFF', 'SALESPERSON', 'VIEWER');
ALTER TABLE "memberships" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "memberships" ALTER COLUMN "role" TYPE TEXT USING ("role"::text);
UPDATE "memberships" SET "role" = 'ACCOUNTANT' WHERE "role" = 'STAFF';
ALTER TABLE "memberships" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::"Role_new");
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
ALTER TABLE "memberships" ALTER COLUMN "role" SET DEFAULT 'OWNER';
COMMIT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "approvalWorkflowEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "pending_transactions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "PendingTransactionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PendingTransactionStatus" NOT NULL DEFAULT 'pending',
    "attachmentId" TEXT,
    "aiConfidence" INTEGER,
    "aiRiskReview" JSONB,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_transactions_orgId_status_idx" ON "pending_transactions"("orgId", "status");

-- CreateIndex
CREATE INDEX "pending_transactions_orgId_submittedById_status_idx" ON "pending_transactions"("orgId", "submittedById", "status");

-- AddForeignKey
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
