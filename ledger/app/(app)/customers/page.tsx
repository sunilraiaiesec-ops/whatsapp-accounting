import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listParties } from "@/lib/parties";
import { listPartyBalances } from "@/lib/party-ledger";
import { formatAmount } from "@/lib/money";
import { PartyCreateForm } from "@/components/PartyCreateForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function CustomersPage() {
  const ctx = await requireContext();
  const t = await getTranslations("customers");
  const cur = ctx.baseCurrency;

  const [customers, balances] = await Promise.all([
    listParties(ctx.orgId, "customer"),
    listPartyBalances(ctx.orgId, "customer"),
  ]);

  const total = customers.reduce((s, p) => s + (balances.get(p.id) ?? 0n), 0n);
  const owing = customers.filter((p) => (balances.get(p.id) ?? 0n) > 0n).length;

  const rows: ListRow[] = customers.map((p) => ({
    id: p.id,
    href: `/customers/${p.id}`,
    name: p.name,
    phone: p.phone ?? "—",
    balance: formatAmount(balances.get(p.id) ?? 0n, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <StatGrid>
        <StatCard icon="users" tone="emerald" label={t("title")} value={String(customers.length)} />
        <StatCard icon="sum" tone="blue" label={t("balance")} value={formatAmount(total, cur)} unit={cur} />
        <StatCard icon="doc" tone="amber" label={t("transactions")} value={String(owing)} />
      </StatGrid>

      <div className="mt-6">
        <PartyCreateForm defaultType="customer" />
      </div>

      <div className="mt-6">
        <ListView
          rows={rows}
          currency={cur}
          searchKeys={["name", "phone"]}
          emptyText={t("empty")}
          columns={[
            { key: "name", header: t("name"), kind: "link", mono: false },
            { key: "phone", header: t("phone"), kind: "muted" },
            { key: "balance", header: t("balance"), kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}
