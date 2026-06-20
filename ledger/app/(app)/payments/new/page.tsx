import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { bankAndCashAccounts, paymentCounterpartAccounts } from "@/lib/accounts";
import { listParties } from "@/lib/parties";
import { createPaymentAction } from "@/app/actions/documents";
import { CashDocForm } from "@/components/CashDocForm";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ partyId?: string; kind?: string }>;
}) {
  const { partyId, kind } = await searchParams;
  const isExpense = kind === "expense";
  const ctx = await requireContext();
  const t = await getTranslations("payments");
  const tn = await getTranslations("nav");
  const today = new Date().toISOString().slice(0, 10);

  const [banks, accounts, parties] = await Promise.all([
    bankAndCashAccounts(ctx.orgId),
    paymentCounterpartAccounts(ctx.orgId),
    listParties(ctx.orgId),
  ]);

  const defaultLine = isExpense
    ? (accounts.find((a) => a.type === "EXPENSE" && a.subtype !== "cogs") ??
      accounts.find((a) => a.type === "EXPENSE") ??
      accounts[0])
    : (accounts.find((a) => a.subtype === "payable") ??
      accounts.find((a) => a.code === "6000") ??
      accounts[0]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/payments" className="text-sm text-slate-500 hover:text-slate-900">
        ← {tn("payments")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">
        {isExpense ? t("expenseTitle") : t("newTitle")}
      </h1>
      <p className="text-sm text-slate-500">
        {isExpense ? t("expenseSubtitle") : t("newSubtitle")}
      </p>

      <CashDocForm
        mode="payment"
        action={createPaymentAction}
        currency={ctx.baseCurrency}
        bankAccounts={banks.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        parties={parties.map((p) => ({ id: p.id, label: p.name }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.code} — ${a.name}`,
        }))}
        defaultLineAccountId={defaultLine?.id ?? ""}
        saveLabel={isExpense ? t("expenseSave") : undefined}
        defaults={
          partyId
            ? {
                partyId,
                date: today,
                bankAccountId: "",
                reference: "",
                description: "",
                lines: [],
              }
            : undefined
        }
      />
    </div>
  );
}
