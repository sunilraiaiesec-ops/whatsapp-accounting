-- Cash sales (sales receipts) and customer refunds (refund receipts).

CREATE TABLE "sales_receipts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partyId" TEXT,
    "bankAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_receipts_journalEntryId_key" ON "sales_receipts"("journalEntryId");
CREATE UNIQUE INDEX "sales_receipts_orgId_number_key" ON "sales_receipts"("orgId", "number");
CREATE INDEX "sales_receipts_orgId_date_idx" ON "sales_receipts"("orgId", "date");

CREATE TABLE "sales_receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,
    "accountId" TEXT NOT NULL,
    "itemId" TEXT,
    "cost" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "sales_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_receipt_lines_receiptId_idx" ON "sales_receipt_lines"("receiptId");

CREATE TABLE "refund_receipts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partyId" TEXT,
    "bankAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refund_receipts_journalEntryId_key" ON "refund_receipts"("journalEntryId");
CREATE UNIQUE INDEX "refund_receipts_orgId_number_key" ON "refund_receipts"("orgId", "number");
CREATE INDEX "refund_receipts_orgId_date_idx" ON "refund_receipts"("orgId", "date");

CREATE TABLE "refund_receipt_lines" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "lineTotal" BIGINT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "refund_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refund_receipt_lines_refundId_idx" ON "refund_receipt_lines"("refundId");

-- Foreign keys
ALTER TABLE "sales_receipts"
    ADD CONSTRAINT "sales_receipts_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_receipts"
    ADD CONSTRAINT "sales_receipts_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_receipts"
    ADD CONSTRAINT "sales_receipts_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_receipt_lines"
    ADD CONSTRAINT "sales_receipt_lines_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "sales_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_receipt_lines"
    ADD CONSTRAINT "sales_receipt_lines_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_receipt_lines"
    ADD CONSTRAINT "sales_receipt_lines_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refund_receipts"
    ADD CONSTRAINT "refund_receipts_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refund_receipts"
    ADD CONSTRAINT "refund_receipts_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refund_receipts"
    ADD CONSTRAINT "refund_receipts_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refund_receipt_lines"
    ADD CONSTRAINT "refund_receipt_lines_refundId_fkey"
    FOREIGN KEY ("refundId") REFERENCES "refund_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refund_receipt_lines"
    ADD CONSTRAINT "refund_receipt_lines_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
