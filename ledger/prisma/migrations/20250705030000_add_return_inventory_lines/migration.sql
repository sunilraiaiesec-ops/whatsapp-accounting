-- Let sales returns (credit notes) and refunds (refund receipts) put goods
-- back into stock and reverse cost of goods sold, via optional inventory
-- item lines mirroring sales invoices/receipts.

ALTER TABLE "credit_note_lines" ADD COLUMN "itemId" TEXT;
ALTER TABLE "credit_note_lines" ADD COLUMN "cost" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "refund_receipt_lines" ADD COLUMN "itemId" TEXT;
ALTER TABLE "refund_receipt_lines" ADD COLUMN "cost" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "credit_note_lines"
    ADD CONSTRAINT "credit_note_lines_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refund_receipt_lines"
    ADD CONSTRAINT "refund_receipt_lines_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
