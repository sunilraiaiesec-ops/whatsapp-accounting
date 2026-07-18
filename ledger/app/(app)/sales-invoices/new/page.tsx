import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { accountsByType } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { listInventoryItems } from "@/lib/inventory";
import { formatAmount } from "@/lib/money";
import { SalesInvoiceForm } from "@/components/SalesInvoiceForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function NewSalesInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ partyId?: string }>;
}) {
  const { partyId } = await searchParams;
  const ctx = await requireContext();
  const t = await getTranslations("salesInvoices");
  const today = new Date().toISOString().slice(0, 10);

  const [customers, income, items] = await Promise.all([
    listParties(ctx.orgId, "customer"),
    accountsByType(ctx.orgId, "INCOME"),
    listInventoryItems(ctx.orgId),
  ]);

  const salesAccount = income.find((a) => a.subtype === "sales") ?? income[0];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("newTitle")}
        subtitle={t("newSubtitle")}
        backHref="/sales-invoices"
        backLabel={t("backToList")}
        size="compact"
      />

      <SalesInvoiceForm
        currency={ctx.baseCurrency}
        orgName={ctx.orgName}
        defaults={
          partyId
            ? {
                partyId,
                reference: "",
                date: today,
                dueDate: "",
                notes: "",
                lines: [],
              }
            : undefined
        }
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        incomeAccounts={income.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
        salesAccountId={salesAccount?.id ?? ""}
        items={items.map((it) => ({
          id: it.id,
          label: `${it.code} — ${it.name}`,
          name: it.name,
          salePrice: formatAmount(it.salePrice, ctx.baseCurrency),
        }))}
      />
    </div>
  );
}
