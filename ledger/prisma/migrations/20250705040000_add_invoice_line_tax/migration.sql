-- Sales-tax / VAT on invoice-style documents. Cash receipts and payments
-- already carried per-line tax; extend the same exclusive per-line model to
-- sales invoices, sales receipts, credit notes, refund receipts, purchase
-- invoices and debit notes so output/input tax posts to the tax accounts.

ALTER TABLE "sales_invoice_lines"    ADD COLUMN "taxRate" DECIMAL(7,4);
ALTER TABLE "sales_invoice_lines"    ADD COLUMN "taxAmount" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "sales_receipt_lines"    ADD COLUMN "taxRate" DECIMAL(7,4);
ALTER TABLE "sales_receipt_lines"    ADD COLUMN "taxAmount" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "credit_note_lines"      ADD COLUMN "taxRate" DECIMAL(7,4);
ALTER TABLE "credit_note_lines"      ADD COLUMN "taxAmount" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "refund_receipt_lines"   ADD COLUMN "taxRate" DECIMAL(7,4);
ALTER TABLE "refund_receipt_lines"   ADD COLUMN "taxAmount" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "purchase_invoice_lines" ADD COLUMN "taxRate" DECIMAL(7,4);
ALTER TABLE "purchase_invoice_lines" ADD COLUMN "taxAmount" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "debit_note_lines"       ADD COLUMN "taxRate" DECIMAL(7,4);
ALTER TABLE "debit_note_lines"       ADD COLUMN "taxAmount" BIGINT NOT NULL DEFAULT 0;
