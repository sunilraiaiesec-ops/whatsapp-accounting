-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED');

-- AlterTable: sales_invoices
-- status: safe widen -> remap -> narrow (existing rows hold lowercase
-- "unpaid"/"paid" strings that cannot be reinterpreted directly as the new
-- enum). Same pattern used in
-- 20260705230025_add_roles_permissions_approval_workflow for the Role enum.
ALTER TABLE "sales_invoices" ADD COLUMN "amountPaid" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "sales_invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sales_invoices" ALTER COLUMN "status" TYPE TEXT USING ("status"::text);
UPDATE "sales_invoices" SET "status" = 'UNPAID' WHERE "status" = 'unpaid';
UPDATE "sales_invoices" SET "status" = 'PAID' WHERE "status" = 'paid';
-- Safety net: any unexpected legacy value falls back to UNPAID rather than
-- failing the cast (every existing row also has a non-null journalEntryId,
-- i.e. was already posted, so UNPAID is a safe default).
UPDATE "sales_invoices" SET "status" = 'UNPAID' WHERE "status" NOT IN ('UNPAID', 'PAID');
ALTER TABLE "sales_invoices" ALTER COLUMN "status" TYPE "InvoiceStatus" USING ("status"::"InvoiceStatus");
ALTER TABLE "sales_invoices" ALTER COLUMN "status" SET DEFAULT 'UNPAID';
ALTER TABLE "sales_invoices" ALTER COLUMN "journalEntryId" DROP NOT NULL;

-- AlterTable: purchase_invoices (identical remap)
ALTER TABLE "purchase_invoices" ADD COLUMN "amountPaid" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "purchase_invoices" ALTER COLUMN "status" TYPE TEXT USING ("status"::text);
UPDATE "purchase_invoices" SET "status" = 'UNPAID' WHERE "status" = 'unpaid';
UPDATE "purchase_invoices" SET "status" = 'PAID' WHERE "status" = 'paid';
UPDATE "purchase_invoices" SET "status" = 'UNPAID' WHERE "status" NOT IN ('UNPAID', 'PAID');
ALTER TABLE "purchase_invoices" ALTER COLUMN "status" TYPE "InvoiceStatus" USING ("status"::"InvoiceStatus");
ALTER TABLE "purchase_invoices" ALTER COLUMN "status" SET DEFAULT 'UNPAID';
ALTER TABLE "purchase_invoices" ALTER COLUMN "journalEntryId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "receipt_allocations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "amountApplied" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amountApplied" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_allocations_orgId_idx" ON "receipt_allocations"("orgId");

-- CreateIndex
CREATE INDEX "receipt_allocations_receiptId_idx" ON "receipt_allocations"("receiptId");

-- CreateIndex
CREATE INDEX "receipt_allocations_salesInvoiceId_idx" ON "receipt_allocations"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "payment_allocations_orgId_idx" ON "payment_allocations"("orgId");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_purchaseInvoiceId_idx" ON "payment_allocations"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "purchase_invoices_orgId_status_idx" ON "purchase_invoices"("orgId", "status");

-- CreateIndex
CREATE INDEX "sales_invoices_orgId_status_idx" ON "sales_invoices"("orgId", "status");

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
