import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listParties } from "@/lib/parties";
import { listPartyBalances } from "@/lib/party-ledger";
import { formatAmount } from "@/lib/money";
import { PartyCreateForm } from "@/components/PartyCreateForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function CustomersPage() {
  const ctx = await requireContext();
  const t = await getTranslations("customers");
  const cur = ctx.baseCurrency;

  const [customers, balances] = await Promise.all([
    listParties(ctx.orgId, "customer"),
    listPartyBalances(ctx.orgId, "customer"),
  ]);

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="mt-2">
        <PartyCreateForm defaultType="customer" />
      </div>

      <div className="mt-6 card-surface overflow-hidden">
        {customers.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">{t("empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">{t("name")}</th>
                <th className="px-4 py-2 font-medium">{t("phone")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("balance")}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((p) => {
                const balance = balances.get(p.id) ?? 0n;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/customers/${p.id}`}
                        className="font-medium text-[var(--brand)] hover:underline"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{p.phone ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">
                      {formatAmount(balance, cur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
