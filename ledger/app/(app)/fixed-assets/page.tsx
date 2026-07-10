import { requireContext } from "@/lib/auth/current";
import { can } from "@/lib/permissions";
import { listFixedAssets } from "@/lib/fixed-assets/assets";
import { formatAmount } from "@/lib/money";
import { isoDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function FixedAssetsPage() {
  const ctx = await requireContext();
  const cur = ctx.baseCurrency;
  const canManage = can(ctx.role, "manageFixedAssets");

  const assets = await listFixedAssets(ctx.orgId);

  const totalCost = assets.reduce((s, a) => s + a.purchaseCost, 0n);
  const totalAccumDeprec = assets.reduce((s, a) => s + a.accumulatedDepreciation, 0n);
  const totalBookValue = totalCost - totalAccumDeprec;
  const activeCount = assets.filter((a) => a.status === "ACTIVE").length;

  const rows: ListRow[] = assets.map((a) => {
    const bookValue = a.purchaseCost - a.accumulatedDepreciation;
    return {
      id: a.id,
      href: `/fixed-assets/${a.id}`,
      _date: isoDate(a.purchaseDate),
      code: a.code,
      name: a.name,
      category: a.category?.name ?? "—",
      cost: formatAmount(a.purchaseCost, cur),
      accumulatedDepreciation: formatAmount(a.accumulatedDepreciation, cur),
      bookValue: formatAmount(bookValue, cur),
      status: a.status === "ACTIVE" ? "Active" : "Disposed",
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Fixed Assets"
        subtitle="Asset register — capitalized purchases, depreciation, and disposals."
        actionHref={canManage ? "/fixed-assets/new" : undefined}
        actionLabel={canManage ? "New asset" : undefined}
      />

      <StatGrid>
        <StatCard icon="count" tone="emerald" label="Assets" value={String(assets.length)} sub={`${activeCount} active`} />
        <StatCard icon="sum" tone="blue" label="Total cost" value={formatAmount(totalCost, cur)} unit={cur} />
        <StatCard icon="avg" tone="amber" label="Accumulated depreciation" value={formatAmount(totalAccumDeprec, cur)} unit={cur} />
        <StatCard icon="wallet" tone="violet" label="Net book value" value={formatAmount(totalBookValue, cur)} unit={cur} />
      </StatGrid>

      <div className="mt-8">
        <ListView
          rows={rows}
          currency={cur}
          hasDateFilter
          searchKeys={["code", "name", "category"]}
          emptyText="No fixed assets yet."
          mobile={{ title: "name", subtitle: "code", amount: "bookValue" }}
          columns={[
            { key: "code", header: "Code", kind: "link" },
            { key: "name", header: "Name" },
            { key: "category", header: "Category", kind: "muted" },
            { key: "cost", header: "Cost", kind: "amount", align: "right" },
            { key: "accumulatedDepreciation", header: "Accum. deprec.", kind: "amount", align: "right" },
            { key: "bookValue", header: "Book value", kind: "amount", align: "right" },
            { key: "status", header: "Status", kind: "muted" },
          ]}
        />
      </div>
    </div>
  );
}
