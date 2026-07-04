-- Concurrency-safe document numbering. A per-(org, kind) counter replaces the
-- previous COUNT(*)+1 scheme, which raced under concurrent posting and could
-- fail on the documents' unique (orgId, number) index.

CREATE TABLE "document_sequences" (
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("orgId", "kind")
);

ALTER TABLE "document_sequences"
    ADD CONSTRAINT "document_sequences_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from existing document counts. Numbers were previously assigned
-- sequentially as COUNT(*)+1, so the current row count equals the last number
-- used; seeding "value" to that count makes the next allocation continue at
-- count+1 with no gaps or collisions.
INSERT INTO "document_sequences" ("orgId", "kind", "value")
SELECT "orgId", 'REC', COUNT(*) FROM "receipts" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'PAY', COUNT(*) FROM "payments" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'INV', COUNT(*) FROM "sales_invoices" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'SR', COUNT(*) FROM "sales_receipts" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'RR', COUNT(*) FROM "refund_receipts" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'BILL', COUNT(*) FROM "purchase_invoices" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'TRF', COUNT(*) FROM "inter_account_transfers" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'CN', COUNT(*) FROM "credit_notes" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'DN', COUNT(*) FROM "debit_notes" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'GRN', COUNT(*) FROM "goods_receipts" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'WO', COUNT(*) FROM "inventory_write_offs" GROUP BY "orgId"
UNION ALL SELECT "orgId", 'ADJ', COUNT(*) FROM "inventory_adjustments" GROUP BY "orgId";
