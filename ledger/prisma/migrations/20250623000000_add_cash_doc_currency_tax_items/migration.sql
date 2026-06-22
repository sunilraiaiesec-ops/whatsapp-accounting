-- QuickBooks-style expense parity: multi-currency conversion note on cash
-- documents, per-line sales tax (VAT/TVA), and inventory item lines on payments.

-- Document-level currency + exchange rate (foreign currency reference; the
-- ledger always posts in the org base currency).
ALTER TABLE "receipts" ADD COLUMN "currency" TEXT;
ALTER TABLE "receipts" ADD COLUMN "exchangeRate" DECIMAL(18,6);
ALTER TABLE "payments" ADD COLUMN "currency" TEXT;
ALTER TABLE "payments" ADD COLUMN "exchangeRate" DECIMAL(18,6);

-- Per-line sales tax.
ALTER TABLE "receipt_lines" ADD COLUMN "taxRate" DECIMAL(7,4);
ALTER TABLE "receipt_lines" ADD COLUMN "taxAmount" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "payment_lines" ADD COLUMN "taxRate" DECIMAL(7,4);
ALTER TABLE "payment_lines" ADD COLUMN "taxAmount" BIGINT NOT NULL DEFAULT 0;

-- Inventory item lines on payments (cash purchase of stock).
ALTER TABLE "payment_lines" ADD COLUMN "itemId" TEXT;
ALTER TABLE "payment_lines" ADD COLUMN "quantity" DECIMAL(18,3);
ALTER TABLE "payment_lines" ADD COLUMN "unitCost" BIGINT;

ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
