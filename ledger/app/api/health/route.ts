import { prisma } from "@/lib/prisma";

export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasAuthSecret = Boolean(process.env.AUTH_SECRET);

  let database: "ok" | "error" = "error";
  if (hasDatabaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "ok";
    } catch {
      database = "error";
    }
  }

  const ok = hasDatabaseUrl && hasAuthSecret && database === "ok";

  return Response.json(
    {
      ok,
      databaseUrl: hasDatabaseUrl,
      authSecret: hasAuthSecret,
      database,
    },
    { status: ok ? 200 : 503 },
  );
}
