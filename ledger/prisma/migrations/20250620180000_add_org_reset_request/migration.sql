-- Factory-reset workflow for wiping an organization's books.
CREATE TABLE "org_reset_requests" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeExpiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "deleteAllowedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_reset_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "org_reset_requests_orgId_completedAt_cancelledAt_idx"
    ON "org_reset_requests"("orgId", "completedAt", "cancelledAt");

ALTER TABLE "org_reset_requests"
    ADD CONSTRAINT "org_reset_requests_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_reset_requests"
    ADD CONSTRAINT "org_reset_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
