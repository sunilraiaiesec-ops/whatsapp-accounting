import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { getParty, getPartyLedger } from "@/lib/party-ledger";
import { formatAmount } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PartyLedgerTable } from "@/components/PartyLedgerTable";

export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const t = await getTranslations("customers");
  const tn = await getTranslations("nav");
  const cur = ctx.baseCurrency;

  const party = await getParty(ctx.orgId, id);
  if (!party || (party.type !== "customer" && party.type !== "both")) {
    notFound();
  }

  const sourceLabels = {
    sales_invoice: t("sourceSalesInvoice"),
    receipt: t("sourceReceipt"),
    credit_note: t("sourceCreditNote"),
    purchase_invoice: t("sourcePurchaseInvoice"),
    payment: t("sourcePayment"),
    debit_note: t("sourceDebitNote"),
  };

  const { balance, rows } = await getPartyLedger(
    ctx.orgId,
    id,
    "customer",
    sourceLabels,
  );

  return (
    <div>
      <PageHeader
        backHref="/customers"
        backLabel={tn("customers")}
        title={party.name}
        subtitle={t("ledgerSubtitle")}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t("balance")}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {formatAmount(balance, cur)}{" "}
            <span className="text-base font-medium text-slate-500">{cur}</span>
          </p>
        </div>
        {party.phone ? (
          <div className="card-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("phone")}
            </p>
            <p className="mt-1 text-lg font-medium text-slate-900">{party.phone}</p>
          </div>
        ) : null}
        <div className="card-surface flex flex-wrap items-center gap-2 p-5 sm:col-span-1">
          <Link href={`/sales-invoices/new?partyId=${party.id}`} className="btn-brand text-sm">
            + {t("newInvoice")}
          </Link>
          <Link
            href={`/receipts/new?partyId=${party.id}`}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + {t("newReceipt")}
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          {t("transactions")}
        </h2>
        <div className="card-surface overflow-hidden">
          <PartyLedgerTable
            rows={rows}
            currency={cur}
            emptyMessage={t("emptyLedger")}
            columns={{
              date: t("date"),
              description: t("description"),
              reference: t("reference"),
              debit: t("debit"),
              credit: t("credit"),
              balance: t("balance"),
            }}
          />
        </div>
      </section>
    </div>
  );
}
