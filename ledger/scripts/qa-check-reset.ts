// Read-only: did a password-reset token get created recently? Localizes whether
// the failure is app-side (no token = request never reached server) or email-side
// (token exists = send was attempted and failed / not delivered).
import { prisma } from "@/lib/prisma";

async function main() {
  const email = (process.argv[2] ?? "sunil@melsun.ca").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No user with email ${email}. (Reset would send nothing.)`);
    await prisma.$disconnect();
    return;
  }
  console.log(`User ${email} exists (id=${user.id}), emailVerified=${user.emailVerified ? user.emailVerified.toISOString() : "NO"}`);

  const tokens = await prisma.authToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(`\nAuthToken rows for this user: ${tokens.length}`);
  for (const t of tokens) {
    console.log(`  type=${t.type} created=${t.createdAt.toISOString()} expires=${t.expiresAt.toISOString()} used=${t.usedAt ? t.usedAt.toISOString() : "no"}`);
  }

  const recentReset = tokens.find(
    (t) => t.type === "password_reset" && Date.now() - t.createdAt.getTime() < 60 * 60 * 1000,
  );
  console.log(
    `\nRecent (<1h) password_reset token: ${recentReset ? "YES — request reached server; failure is in EMAIL sending/config" : "NO — request did not create a token (check email entered, or request never reached server)"}`,
  );

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
