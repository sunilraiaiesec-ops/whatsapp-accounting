import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const email = (process.env.MIGRATE_EMAIL ?? "sunil@melsun.ca").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
  const orgId = user!.memberships[0].orgId;

  const accounts = await prisma.account.findMany({ where: { orgId }, select: { id: true, code: true, name: true, type: true, subtype: true } });
  const sums = await prisma.journalLine.groupBy({ by: ["accountId"], where: { orgId }, _sum: { debit: true, credit: true } });
  const bal = new Map<string, bigint>();
  for (const s of sums) bal.set(s.accountId, (s._sum.debit ?? 0n) - (s._sum.credit ?? 0n));

  const fmt = (n: bigint) => n.toLocaleString("en-US");
  const rows = accounts
    .filter((a) => a.type === "ASSET")
    .map((a) => ({ ...a, b: bal.get(a.id) ?? 0n }))
    .filter((a) => a.b !== 0n)
    .sort((a, b) => Number(b.b - a.b));

  let total = 0n;
  console.log("ASSETS (balance = debit - credit, XAF)\n");
  for (const r of rows) {
    total += r.b;
    console.log(`${(r.subtype ?? "").padEnd(11)} ${r.code.padEnd(7)} ${r.name.slice(0, 34).padEnd(35)} ${fmt(r.b).padStart(16)}`);
  }
  console.log("".padEnd(70, "-"));
  console.log(`TOTAL ASSETS${" ".repeat(43)}${fmt(total).padStart(16)} XAF`);

  // Quick balance-sheet snapshot
  const totBy = (t: string) => accounts.filter((a) => a.type === t).reduce((s, a) => s + (bal.get(a.id) ?? 0n), 0n);
  console.log(`\nLIABILITIES${" ".repeat(40)}${fmt(-totBy("LIABILITY")).padStart(16)} XAF`);
  console.log(`EQUITY${" ".repeat(45)}${fmt(-totBy("EQUITY")).padStart(16)} XAF`);
  const income = -totBy("INCOME"), expense = totBy("EXPENSE");
  console.log(`NET INCOME (income - expense)${" ".repeat(22)}${fmt(income - expense).padStart(16)} XAF`);
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
