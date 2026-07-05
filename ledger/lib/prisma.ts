import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Bulk seeding runs long multi-query transactions over the network; give
    // them generous ceilings. The app (which never sets SEED_DEMO) keeps the
    // fast Prisma defaults.
    ...(process.env.SEED_DEMO
      ? { transactionOptions: { maxWait: 20_000, timeout: 60_000 } }
      : {}),
  });

globalForPrisma.prisma = prisma;
