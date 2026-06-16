import { AppShell } from "@/components/AppShell";
import { ReviewActions } from "@/components/ReviewActions";
import { StatCard } from "@/components/StatCard";
import { formatDate, formatFcfa, formatNumber } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Delivery, ReviewCounts, Transaction } from "@/lib/types";

type ReviewResponse = {
  counts: ReviewCounts;
  transactions: Transaction[];
  deliveries: Delivery[];
};

export default async function ReviewPage() {
  const data = await serverApi<ReviewResponse>("review");

  return (
    <AppShell
      title="Review queue"
      subtitle="Confirm or reject pending cash entries and delivery notes"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending cash" value={String(data.counts.pending_transactions)} tone={data.counts.pending_transactions > 0 ? "warning" : "default"} />
        <StatCard label="Pending deliveries" value={String(data.counts.pending_deliveries)} tone={data.counts.pending_deliveries > 0 ? "warning" : "default"} />
        <StatCard label="Total pending" value={String(data.counts.total)} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Cash entries</h2>
        {data.transactions.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No pending cash entries.
          </p>
        ) : (
          <div className="space-y-3">
            {data.transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium capitalize">
                      {tx.transaction_type} · {formatFcfa(tx.amount)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {tx.party ?? "Unknown party"} · {formatDate(tx.created_at)}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {tx.original_message ?? "—"}
                    </p>
                  </div>
                  <ReviewActions kind="transactions" id={tx.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Delivery notes</h2>
        {data.deliveries.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No pending delivery notes.
          </p>
        ) : (
          <div className="space-y-3">
            {data.deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {delivery.client_name ?? "Unknown client"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {delivery.product_name ?? delivery.description ?? "—"} ·{" "}
                      {delivery.quantity != null
                        ? formatNumber(delivery.quantity)
                        : "—"}{" "}
                      · {formatDate(delivery.created_at)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Doc {delivery.document_number ?? "—"} ·{" "}
                      {formatFcfa(delivery.line_total_fcfa)}
                    </p>
                  </div>
                  <ReviewActions kind="deliveries" id={delivery.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
