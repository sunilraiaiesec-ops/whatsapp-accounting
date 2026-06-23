import { getLocale } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { formatAmount } from "@/lib/money";
import { relativeDays, isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";

export default async function JournalPage() {
  const ctx = await requireContext();
  const locale = await getLocale();
  const cur = ctx.baseCurrency;

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [entries, monthCount, debitAgg, latest] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { orgId: ctx.orgId },
      include: { lines: { include: { account: true } } },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.journalEntry.count({ where: { orgId: ctx.orgId, entryDate: { gte: start, lt: end } } }),
    prisma.journalLine.aggregate({
      where: { orgId: ctx.orgId, entry: { entryDate: { gte: start, lt: end } } },
      _sum: { debit: true },
    }),
    prisma.journalEntry.findFirst({
      where: { orgId: ctx.orgId },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      select: { entryDate: true },
    }),
  ]);

  const posted = debitAgg._sum.debit ?? 0n;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Journal entries"
        subtitle="Every posting in the general ledger, newest first."
        actionHref="/journal/new"
        actionLabel="New journal entry"
      />

      <StatGrid>
        <StatCard icon="count" tone="emerald" label="Entries" value={String(monthCount)} sub="This month" />
        <StatCard icon="sum" tone="blue" label="Posted" value={formatAmount(posted, cur)} unit={cur} sub="This month" />
        <StatCard icon="calendar" tone="amber" label="Latest" value={latest ? isoDate(latest.entryDate) : "—"} sub={latest ? relativeDays(latest.entryDate, locale) : undefined} />
      </StatGrid>

      {entries.length === 0 ? (
        <div className="card-surface mt-8 p-8 text-center text-sm text-[var(--muted)]">
          No entries yet. Post your first journal entry to get started.
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {entries.map((entry) => {
            const total = entry.lines.reduce((s, l) => s + l.debit, 0n);
            return (
              <div key={entry.id} className="card-surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
                  <div>
                    <span className="text-sm font-medium text-slate-900">{isoDate(entry.entryDate)}</span>
                    {entry.description ? <span className="ml-3 text-sm text-slate-600">{entry.description}</span> : null}
                    {entry.reference ? <span className="ml-2 text-xs text-slate-400">ref {entry.reference}</span> : null}
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatAmount(total, cur)} <span className="font-normal text-slate-400">{cur}</span>
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {entry.lines.map((l) => (
                      <tr key={l.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-1.5 text-slate-700">
                          <span className="font-mono text-xs text-slate-400">{l.account.code}</span> {l.account.name}
                          {l.memo ? <span className="ml-2 text-xs text-slate-400">{l.memo}</span> : null}
                        </td>
                        <td className="w-40 px-5 py-1.5 text-right tabular-nums">
                          {l.debit > 0n ? formatAmount(l.debit, cur) : ""}
                        </td>
                        <td className="w-40 px-5 py-1.5 text-right tabular-nums">
                          {l.credit > 0n ? formatAmount(l.credit, cur) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
