import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { listParties } from "@/lib/parties";
import { listPartyBalances } from "@/lib/party-ledger";
import { formatAmount } from "@/lib/money";
import { PartyCreateForm } from "@/components/PartyCreateForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function SuppliersPage() {
  const ctx = await requireContext();
  const t = await getTranslations("suppliers");
  const cur = ctx.baseCurrency;

  const [suppliers, balances] = await Promise.all([
    listParties(ctx.orgId, "supplier"),
    listPartyBalances(ctx.orgId, "supplier"),
  ]);

  const total = suppliers.reduce((s, p) => s + (balances.get(p.id) ?? 0n), 0n);
  const owing = suppliers.filter((p) => (balances.get(p.id) ?? 0n) > 0n).length;

  const rows: ListRow[] = suppliers.map((p) => ({
    id: p.id,
    href: `/suppliers/${p.id}`,
    name: p.name,
    phone: p.phone ?? "—",
    balance: formatAmount(balances.get(p.id) ?? 0n, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <StatGrid>
        <StatCard icon="users" tone="emerald" label={t("title")} value={String(suppliers.length)} />
        <StatCard icon="sum" tone="blue" label={t("balance")} value={formatAmount(total, cur)} unit={cur} />
        <StatCard icon="doc" tone="amber" label={t("transactions")} value={String(owing)} />
      </StatGrid>

      <div className="mt-6">
        <PartyCreateForm defaultType="supplier" />
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
