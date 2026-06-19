import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { prisma } from "@/lib/prisma";
import { formatAmount } from "@/lib/money";

export default async function JournalPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;

  const entries = await prisma.journalEntry.findMany({
    where: { orgId: ctx.orgId },
    include: { lines: { include: { account: true } } },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Journal Entries</h1>
          <p className="text-sm text-slate-500">
            Every posting in the general ledger, newest first.
          </p>
        </div>
        <Link
          href="/journal/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New journal entry
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No entries yet. Post your first journal entry to get started.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {entries.map((entry) => {
            const total = entry.lines.reduce((s, l) => s + l.debit, 0n);
            return (
              <div
                key={entry.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                  <div>
                    <span className="text-sm font-medium text-slate-900">
                      {entry.entryDate.toISOString().slice(0, 10)}
                    </span>
                    {entry.description ? (
                      <span className="ml-3 text-sm text-slate-600">
                        {entry.description}
                      </span>
                    ) : null}
                    {entry.reference ? (
                      <span className="ml-2 text-xs text-slate-400">
                        ref {entry.reference}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatAmount(total, cur)} {cur}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {entry.lines.map((l) => (
                      <tr
                        key={l.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="px-4 py-1.5 text-slate-700">
                          <span className="font-mono text-xs text-slate-400">
                            {l.account.code}
                          </span>{" "}
                          {l.account.name}
                          {l.memo ? (
                            <span className="ml-2 text-xs text-slate-400">
                              {l.memo}
                            </span>
                          ) : null}
                        </td>
                        <td className="w-40 px-4 py-1.5 text-right tabular-nums">
                          {l.debit > 0n ? formatAmount(l.debit, cur) : ""}
                        </td>
                        <td className="w-40 px-4 py-1.5 text-right tabular-nums">
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
