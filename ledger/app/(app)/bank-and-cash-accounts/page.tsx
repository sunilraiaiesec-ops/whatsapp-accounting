import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { bankAndCashWithBalances } from "@/lib/accounts";
import { formatAmount } from "@/lib/money";
import { BankAccountForm } from "@/components/BankAccountForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatGrid, StatCard } from "@/components/ui/StatCards";
import { ListView, type ListRow } from "@/components/ui/ListView";

export default async function BankAndCashAccountsPage() {
  const ctx = await requireContext();
  const t = await getTranslations("bank");
  const cur = ctx.baseCurrency;
  const accounts = await bankAndCashWithBalances(ctx.orgId);

  const total = accounts.reduce((s, a) => s + a.balance, 0n);
  const cashTotal = accounts.filter((a) => a.subtype === "cash").reduce((s, a) => s + a.balance, 0n);
  const bankTotal = total - cashTotal;

  const rows: ListRow[] = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.subtype ?? "—",
    balance: formatAmount(a.balance, cur),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <StatGrid>
        <StatCard icon="wallet" tone="emerald" label={t("account")} value={String(accounts.length)} />
        <StatCard icon="sum" tone="blue" label={t("total")} value={formatAmount(total, cur)} unit={cur} />
        <StatCard icon="wallet" tone="violet" label="Bank" value={formatAmount(bankTotal, cur)} unit={cur} />
        <StatCard icon="wallet" tone="amber" label="Cash" value={formatAmount(cashTotal, cur)} unit={cur} />
      </StatGrid>

      <div className="mt-6">
        <BankAccountForm />
      </div>

      <div className="mt-6">
        <ListView
          rows={rows}
          currency={cur}
          searchKeys={["code", "name", "type"]}
          emptyText={t("subtitle")}
          columns={[
            { key: "code", header: "Code", kind: "mono" },
            { key: "name", header: t("account") },
            { key: "type", header: t("type"), kind: "muted" },
            { key: "balance", header: t("balance"), kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}
