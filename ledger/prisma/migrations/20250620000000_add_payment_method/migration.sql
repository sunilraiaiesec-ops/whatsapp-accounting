-- Add optional payment method to cash documents (QuickBooks-style field).
ALTER TABLE "receipts" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "payments" ADD COLUMN "paymentMethod" TEXT;
