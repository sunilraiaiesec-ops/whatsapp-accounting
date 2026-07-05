import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireContext } from "@/lib/auth/current";
import { getParty, getPartyLedger } from "@/lib/party-ledger";
import { listPartyInvoices, listPartyPayments, listPartyOtherDocuments } from "@/lib/party-documents";
import { getPartyAiMemory, getPartyEnrichmentSuggestions, getPartyOverviewStats } from "@/lib/party-insights";
import { formatAmount } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PartyLedgerTable } from "@/components/PartyLedgerTable";
import { PartyTabs, type PartyTabKey } from "@/components/PartyTabs";
import { PartyOverviewInteractive } from "@/components/PartyOverviewInteractive";
import { PartyNotesForm } from "@/components/PartyNotesForm";
import { ListView, type ListRow } from "@/components/ui/ListView";

const TAB_LABELS: Record<PartyTabKey, string> = {
  overview: "Overview",
  transactions: "Transactions",
  invoices: "Bills",
  payments: "Payments",
  products: "Products",
  documents: "Documents",
  notes: "Notes",
  "ai-memory": "AI Memory",
};

const VALID_TABS = new Set<PartyTabKey>(Object.keys(TAB_LABELS) as PartyTabKey[]);

export default async function SupplierLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: PartyTabKey = VALID_TABS.has(rawTab as PartyTabKey) ? (rawTab as PartyTabKey) : "overview";

  const ctx = await requireContext();
  const t = await getTranslations("suppliers");
  const tn = await getTranslations("nav");
  const cur = ctx.baseCurrency;

  const party = await getParty(ctx.orgId, id);
  if (!party || (party.type !== "supplier" && party.type !== "both")) {
    notFound();
  }

  const basePath = `/suppliers/${id}`;

  return (
    <div>
      <PageHeader
        backHref="/suppliers"
        backLabel={tn("suppliers")}
        title={party.name}
        subtitle={t("ledgerSubtitle")}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link href={`/purchase-invoices/new?partyId=${party.id}`} className="btn-brand text-sm">
          + {t("newInvoice")}
        </Link>
        <Link
          href={`/payments/new?partyId=${party.id}`}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          + {t("newPayment")}
        </Link>
      </div>

      <PartyTabs basePath={basePath} active={tab} labels={TAB_LABELS} />

      {tab === "overview" ? (
        <OverviewTab orgId={ctx.orgId} partyId={id} currency={cur} party={party} />
      ) : null}

      {tab === "transactions" ? (
        <TransactionsTab orgId={ctx.orgId} partyId={id} currency={cur} t={t} />
      ) : null}

      {tab === "invoices" ? <InvoicesTab orgId={ctx.orgId} partyId={id} currency={cur} /> : null}

      {tab === "payments" ? <PaymentsTab orgId={ctx.orgId} partyId={id} currency={cur} /> : null}

      {tab === "products" ? <ProductsTab orgId={ctx.orgId} partyId={id} currency={cur} /> : null}

      {tab === "documents" ? <DocumentsTab orgId={ctx.orgId} partyId={id} currency={cur} /> : null}

      {tab === "notes" ? <PartyNotesForm partyId={id} notes={party.notes} /> : null}

      {tab === "ai-memory" ? <AiMemoryTab orgId={ctx.orgId} partyId={id} currency={cur} /> : null}
    </div>
  );
}

async function OverviewTab({
  orgId,
  partyId,
  currency,
  party,
}: {
  orgId: string;
  partyId: string;
  currency: string;
  party: Awaited<ReturnType<typeof getParty>>;
}) {
  if (!party) return null;
  const [stats, suggestions] = await Promise.all([
    getPartyOverviewStats(orgId, partyId, "supplier", currency),
    getPartyEnrichmentSuggestions(orgId, partyId, "supplier"),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Balance</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {formatAmount(stats.balance, currency)} <span className="text-base font-medium text-slate-500">{currency}</span>
          </p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Orders</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{stats.orderCount}</p>
        </div>
        <div className="card-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Average order</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {formatAmount(stats.averageOrderValue, currency)}{" "}
            <span className="text-base font-medium text-slate-500">{currency}</span>
          </p>
        </div>
      </div>

      <div className="card-surface p-5">
        <p className="text-sm text-slate-700">{stats.summaryLine}</p>
      </div>

      <PartyOverviewInteractive
        partyId={partyId}
        suggestions={suggestions}
        currency={currency}
        profileValues={{
          phone: party.phone,
          whatsapp: party.whatsapp,
          country: party.country,
          city: party.city,
          email: party.email,
          address: party.address,
          googleMapsUrl: party.googleMapsUrl,
          companyName: party.companyName,
          contactPerson: party.contactPerson,
          taxId: party.taxId,
          defaultCurrency: party.defaultCurrency,
          preferredLanguage: party.preferredLanguage,
          paymentTermsDays: party.paymentTermsDays,
          creditLimit: party.creditLimit != null ? String(party.creditLimit) : null,
          defaultDiscount: party.defaultDiscount != null ? String(party.defaultDiscount) : null,
          preferredPaymentMethod: party.preferredPaymentMethod,
        }}
      />
    </div>
  );
}

async function TransactionsTab({
  orgId,
  partyId,
  currency,
  t,
}: {
  orgId: string;
  partyId: string;
  currency: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const sourceLabels = {
    sales_invoice: t("sourceSalesInvoice"),
    receipt: t("sourceReceipt"),
    credit_note: t("sourceCreditNote"),
    purchase_invoice: t("sourcePurchaseInvoice"),
    payment: t("sourcePayment"),
    debit_note: t("sourceDebitNote"),
  };
  const { rows } = await getPartyLedger(orgId, partyId, "supplier", sourceLabels);

  return (
    <div className="card-surface overflow-hidden">
      <PartyLedgerTable
        rows={rows}
        currency={currency}
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
  );
}

async function InvoicesTab({ orgId, partyId, currency }: { orgId: string; partyId: string; currency: string }) {
  const invoices = await listPartyInvoices(orgId, partyId, "supplier");
  const rows: ListRow[] = invoices.map((inv) => ({
    id: inv.id,
    href: `/purchase-invoices/${inv.id}`,
    number: inv.number,
    date: inv.date.toISOString().slice(0, 10),
    status: inv.status,
    total: formatAmount(inv.total, currency),
    _date: inv.date.toISOString().slice(0, 10),
  }));
  return (
    <ListView
      rows={rows}
      currency={currency}
      searchKeys={["number"]}
      hasDateFilter
      emptyText="No bills yet."
      columns={[
        { key: "number", header: "Number", kind: "link" },
        { key: "date", header: "Date", kind: "muted" },
        { key: "status", header: "Status", kind: "status" },
        { key: "total", header: "Total", kind: "amount", align: "right" },
      ]}
    />
  );
}

async function PaymentsTab({ orgId, partyId, currency }: { orgId: string; partyId: string; currency: string }) {
  const payments = await listPartyPayments(orgId, partyId, "supplier");
  const rows: ListRow[] = payments.map((p) => ({
    id: p.id,
    href: `/payments/${p.id}`,
    number: p.number,
    date: p.date.toISOString().slice(0, 10),
    method: p.paymentMethod ?? "—",
    total: formatAmount(p.total, currency),
    _date: p.date.toISOString().slice(0, 10),
  }));
  return (
    <ListView
      rows={rows}
      currency={currency}
      searchKeys={["number"]}
      hasDateFilter
      emptyText="No payments made yet."
      columns={[
        { key: "number", header: "Number", kind: "link" },
        { key: "date", header: "Date", kind: "muted" },
        { key: "method", header: "Method", kind: "muted" },
        { key: "total", header: "Amount", kind: "amount", align: "right" },
      ]}
    />
  );
}

async function ProductsTab({ orgId, partyId, currency }: { orgId: string; partyId: string; currency: string }) {
  const memory = await getPartyAiMemory(orgId, partyId, "supplier");
  const rows: ListRow[] = memory.usualProducts.map((p) => ({
    id: p.itemId,
    name: p.name,
    unit: p.unit ?? "—",
    quantity: p.totalQuantity,
    lastPrice: formatAmount(p.lastPrice, currency),
    avgPrice: formatAmount(p.averagePrice, currency),
    count: String(p.count),
  }));
  return (
    <ListView
      rows={rows}
      currency={currency}
      searchKeys={["name"]}
      emptyText="No product history yet."
      columns={[
        { key: "name", header: "Product", kind: "text" },
        { key: "unit", header: "Unit", kind: "muted" },
        { key: "quantity", header: "Total qty", kind: "muted", align: "right" },
        { key: "lastPrice", header: "Last price", kind: "amount", align: "right" },
        { key: "avgPrice", header: "Avg price", kind: "amount", align: "right" },
        { key: "count", header: "Times", kind: "muted", align: "right" },
      ]}
    />
  );
}

async function DocumentsTab({ orgId, partyId, currency }: { orgId: string; partyId: string; currency: string }) {
  const docs = await listPartyOtherDocuments(orgId, partyId, "supplier");
  const rows: ListRow[] = docs.map((d) => ({
    id: d.id,
    href: d.href,
    kind: d.kind.replace("_", " "),
    number: d.number,
    date: d.date.toISOString().slice(0, 10),
    total: formatAmount(d.total, currency),
    _date: d.date.toISOString().slice(0, 10),
  }));
  return (
    <ListView
      rows={rows}
      currency={currency}
      searchKeys={["number"]}
      hasDateFilter
      emptyText="No other documents yet."
      columns={[
        { key: "number", header: "Number", kind: "link" },
        { key: "kind", header: "Type", kind: "muted" },
        { key: "date", header: "Date", kind: "muted" },
        { key: "total", header: "Total", kind: "amount", align: "right" },
      ]}
    />
  );
}

async function AiMemoryTab({ orgId, partyId, currency }: { orgId: string; partyId: string; currency: string }) {
  const memory = await getPartyAiMemory(orgId, partyId, "supplier");

  return (
    <div className="space-y-6">
      <div className="card-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Learned from this contact&apos;s history ({memory.sampleSize} line{memory.sampleSize === 1 ? "" : "s"} analyzed)
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-500">Usual payment terms</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {memory.usualPaymentTermsDays != null
                ? `~${memory.usualPaymentTermsDays} days${memory.usualPaymentTermsApproximate ? " (approximate)" : ""}`
                : "Not enough data yet"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Most common delivery weekday</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{memory.mostCommonWeekday ?? "Not enough data yet"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Preferred payment method</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{memory.preferredPaymentMethod ?? "Not enough data yet"}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Usual products supplied</h3>
        <ListView
          rows={memory.usualProducts.map((p) => ({
            id: p.itemId,
            name: p.name,
            unit: p.unit ?? "—",
            usualQuantity: p.usualQuantity ?? "—",
            lastPrice: formatAmount(p.lastPrice, currency),
            avgPrice: formatAmount(p.averagePrice, currency),
          }))}
          currency={currency}
          searchKeys={["name"]}
          emptyText="Not enough history yet to learn a pattern."
          columns={[
            { key: "name", header: "Product", kind: "text" },
            { key: "unit", header: "Usual unit", kind: "muted" },
            { key: "usualQuantity", header: "Usual quantity", kind: "muted", align: "right" },
            { key: "lastPrice", header: "Last price", kind: "amount", align: "right" },
            { key: "avgPrice", header: "Avg price", kind: "amount", align: "right" },
          ]}
        />
      </div>
    </div>
  );
}
