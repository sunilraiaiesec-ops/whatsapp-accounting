-- QuickBooks-style parity: document tags + per-line class/department tracking.
ALTER TABLE "receipts" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "payments" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "receipt_lines" ADD COLUMN "className" TEXT;
ALTER TABLE "payment_lines" ADD COLUMN "className" TEXT;
