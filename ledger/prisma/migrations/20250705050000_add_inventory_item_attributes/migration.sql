-- Optional catalog attributes for inventory items: barcode, unit of measure,
-- reorder level and a default tax rate. All nullable so existing items are
-- unaffected; the app derives purchase cost as weighted-average from goods
-- receipts, so no cost column is needed here.

ALTER TABLE "inventory_items" ADD COLUMN "barcode" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "unit" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "reorderLevel" DECIMAL(18,3);
ALTER TABLE "inventory_items" ADD COLUMN "defaultTaxRate" DECIMAL(7,4);
