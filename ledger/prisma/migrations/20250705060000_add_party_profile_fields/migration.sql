-- Extended contact fields for Party (customers/suppliers), plus quick-add
-- extras (whatsapp/country/city) alongside the existing phone column. All
-- columns are nullable so existing rows and queries are unaffected; nothing
-- here is required or changes existing behavior.
--
-- googleMapsLocation is stored as a URL (a Google Maps share/place link),
-- not separate lat/lng columns — see the schema.prisma comment on
-- Party.googleMapsUrl for why.
-- creditLimit follows the app-wide convention of money-as-BigInt minor units
-- (see lib/money.ts); defaultDiscount is a percentage (e.g. 5 = 5%).

ALTER TABLE "parties" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "parties" ADD COLUMN "country" TEXT;
ALTER TABLE "parties" ADD COLUMN "city" TEXT;

ALTER TABLE "parties" ADD COLUMN "email" TEXT;
ALTER TABLE "parties" ADD COLUMN "address" TEXT;
ALTER TABLE "parties" ADD COLUMN "googleMapsUrl" TEXT;
ALTER TABLE "parties" ADD COLUMN "companyName" TEXT;
ALTER TABLE "parties" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "parties" ADD COLUMN "taxId" TEXT;
ALTER TABLE "parties" ADD COLUMN "defaultCurrency" TEXT;
ALTER TABLE "parties" ADD COLUMN "preferredLanguage" TEXT;
ALTER TABLE "parties" ADD COLUMN "paymentTermsDays" INTEGER;
ALTER TABLE "parties" ADD COLUMN "creditLimit" BIGINT;
ALTER TABLE "parties" ADD COLUMN "defaultDiscount" DECIMAL(7,4);
ALTER TABLE "parties" ADD COLUMN "preferredPaymentMethod" TEXT;
ALTER TABLE "parties" ADD COLUMN "notes" TEXT;
