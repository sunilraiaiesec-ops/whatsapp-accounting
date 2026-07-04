-- Inventory quantity adjustments: correct stock counts up or down.
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "adjustmentAccountId" TEXT NOT NULL,
    "notes" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_adjustments_journalEntryId_key" ON "inventory_adjustments"("journalEntryId");
CREATE UNIQUE INDEX "inventory_adjustments_orgId_number_key" ON "inventory_adjustments"("orgId", "number");
CREATE INDEX "inventory_adjustments_orgId_date_idx" ON "inventory_adjustments"("orgId", "date");

ALTER TABLE "inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_adjustmentAccountId_fkey"
    FOREIGN KEY ("adjustmentAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_adjustment_lines" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityBefore" DECIMAL(18,3) NOT NULL,
    "quantityAfter" DECIMAL(18,3) NOT NULL,
    "valueChange" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_adjustment_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_adjustment_lines_adjustmentId_idx" ON "inventory_adjustment_lines"("adjustmentId");

ALTER TABLE "inventory_adjustment_lines"
    ADD CONSTRAINT "inventory_adjustment_lines_adjustmentId_fkey"
    FOREIGN KEY ("adjustmentId") REFERENCES "inventory_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustment_lines"
    ADD CONSTRAINT "inventory_adjustment_lines_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
