-- Optional "always buy this from" supplier link for an inventory item, used
-- by the low-stock reorder / WhatsApp quote-request flow as the top-priority
-- supplier suggestion (before falling back to purchase-history signals).
-- Nullable so existing items are unaffected.

ALTER TABLE "inventory_items" ADD COLUMN "preferredSupplierId" TEXT;

CREATE INDEX "inventory_items_preferredSupplierId_idx" ON "inventory_items"("preferredSupplierId");

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
