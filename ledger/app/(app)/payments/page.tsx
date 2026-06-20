import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listPayments } from "@/lib/documents";
import { formatAmount } from "@/lib/money";

export default async function PaymentsPage() {
  const ctx = await requireContext();
  const t = await getTranslations("payments");
  const cur = ctx.baseCurrency;
  const payments = await listPayments(ctx.orgId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/payments/new?kind=expense"
            className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("newExpense")}
          </Link>
          <Link
            href="/payments/new"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {t("new")}
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {payments.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">{t("empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">{t("number")}</th>
                <th className="px-4 py-2 font-medium">{t("dateColumn")}</th>
                <th className="px-4 py-2 font-medium">{t("paidTo")}</th>
                <th className="px-4 py-2 font-medium">{t("from")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/payments/${p.id}`} className="text-blue-600 hover:underline">
                      {p.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{p.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-slate-700">{p.party?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{p.bankAccount.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatAmount(p.total, cur)} {cur}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
