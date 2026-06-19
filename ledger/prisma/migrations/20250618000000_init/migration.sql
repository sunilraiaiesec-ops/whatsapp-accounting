-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'XAF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "subtype" TEXT,
    "parentId" TEXT,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'both',
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,
    "partyId" TEXT,
    "memo" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "bankAccountId" TEXT NOT NULL,
    "partyId" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "memo" TEXT,

    CONSTRAINT "receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "bankAccountId" TEXT NOT NULL,
    "partyId" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_lines" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "memo" TEXT,

    CONSTRAINT "payment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "reference" TEXT,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,
    "accountId" TEXT NOT NULL,
    "itemId" TEXT,
    "cost" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "supplierRef" TEXT,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "purchase_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inter_account_transfers" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "reference" TEXT,
    "description" TEXT,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inter_account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "supplierRef" TEXT,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_note_lines" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "debit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "salePrice" BIGINT NOT NULL DEFAULT 0,
    "qtyOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "valueOnHand" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_write_offs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_write_off_lines" (
    "id" TEXT NOT NULL,
    "writeOffId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "costValue" BIGINT NOT NULL,

    CONSTRAINT "inventory_write_off_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_orgId_userId_key" ON "memberships"("orgId", "userId");

-- CreateIndex
CREATE INDEX "accounts_orgId_type_idx" ON "accounts"("orgId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_orgId_code_key" ON "accounts"("orgId", "code");

-- CreateIndex
CREATE INDEX "parties_orgId_idx" ON "parties"("orgId");

-- CreateIndex
CREATE INDEX "journal_entries_orgId_entryDate_idx" ON "journal_entries"("orgId", "entryDate");

-- CreateIndex
CREATE INDEX "journal_lines_orgId_accountId_idx" ON "journal_lines"("orgId", "accountId");

-- CreateIndex
CREATE INDEX "journal_lines_entryId_idx" ON "journal_lines"("entryId");

-- CreateIndex
CREATE INDEX "journal_lines_partyId_idx" ON "journal_lines"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_journalEntryId_key" ON "receipts"("journalEntryId");

-- CreateIndex
CREATE INDEX "receipts_orgId_date_idx" ON "receipts"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_orgId_number_key" ON "receipts"("orgId", "number");

-- CreateIndex
CREATE INDEX "receipt_lines_receiptId_idx" ON "receipt_lines"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_journalEntryId_key" ON "payments"("journalEntryId");

-- CreateIndex
CREATE INDEX "payments_orgId_date_idx" ON "payments"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "payments_orgId_number_key" ON "payments"("orgId", "number");

-- CreateIndex
CREATE INDEX "payment_lines_paymentId_idx" ON "payment_lines"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_journalEntryId_key" ON "sales_invoices"("journalEntryId");

-- CreateIndex
CREATE INDEX "sales_invoices_orgId_date_idx" ON "sales_invoices"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_orgId_number_key" ON "sales_invoices"("orgId", "number");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_invoiceId_idx" ON "sales_invoice_lines"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_journalEntryId_key" ON "purchase_invoices"("journalEntryId");

-- CreateIndex
CREATE INDEX "purchase_invoices_orgId_date_idx" ON "purchase_invoices"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_orgId_number_key" ON "purchase_invoices"("orgId", "number");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_invoiceId_idx" ON "purchase_invoice_lines"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "inter_account_transfers_journalEntryId_key" ON "inter_account_transfers"("journalEntryId");

-- CreateIndex
CREATE INDEX "inter_account_transfers_orgId_date_idx" ON "inter_account_transfers"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "inter_account_transfers_orgId_number_key" ON "inter_account_transfers"("orgId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_journalEntryId_key" ON "credit_notes"("journalEntryId");

-- CreateIndex
CREATE INDEX "credit_notes_orgId_date_idx" ON "credit_notes"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_orgId_number_key" ON "credit_notes"("orgId", "number");

-- CreateIndex
CREATE INDEX "credit_note_lines_noteId_idx" ON "credit_note_lines"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_journalEntryId_key" ON "debit_notes"("journalEntryId");

-- CreateIndex
CREATE INDEX "debit_notes_orgId_date_idx" ON "debit_notes"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_orgId_number_key" ON "debit_notes"("orgId", "number");

-- CreateIndex
CREATE INDEX "debit_note_lines_noteId_idx" ON "debit_note_lines"("noteId");

-- CreateIndex
CREATE INDEX "inventory_items_orgId_idx" ON "inventory_items"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_orgId_code_key" ON "inventory_items"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_journalEntryId_key" ON "goods_receipts"("journalEntryId");

-- CreateIndex
CREATE INDEX "goods_receipts_orgId_date_idx" ON "goods_receipts"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_orgId_number_key" ON "goods_receipts"("orgId", "number");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_receiptId_idx" ON "goods_receipt_lines"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_write_offs_journalEntryId_key" ON "inventory_write_offs"("journalEntryId");

-- CreateIndex
CREATE INDEX "inventory_write_offs_orgId_date_idx" ON "inventory_write_offs"("orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_write_offs_orgId_number_key" ON "inventory_write_offs"("orgId", "number");

-- CreateIndex
CREATE INDEX "inventory_write_off_lines_writeOffId_idx" ON "inventory_write_off_lines"("writeOffId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inter_account_transfers" ADD CONSTRAINT "inter_account_transfers_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inter_account_transfers" ADD CONSTRAINT "inter_account_transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inter_account_transfers" ADD CONSTRAINT "inter_account_transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "debit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_offs" ADD CONSTRAINT "inventory_write_offs_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_off_lines" ADD CONSTRAINT "inventory_write_off_lines_writeOffId_fkey" FOREIGN KEY ("writeOffId") REFERENCES "inventory_write_offs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_write_off_lines" ADD CONSTRAINT "inventory_write_off_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
