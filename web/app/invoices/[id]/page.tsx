import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { formatDate, formatFcfa, formatNumber } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { InvoiceDetail } from "@/lib/types";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await serverApi<InvoiceDetail>(`invoices/${id}`);

  return (
    <AppShell
      title={invoice.invoice_number}
      subtitle={`Invoice for ${invoice.party_name}`}
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href={`/invoices/${id}/print`}
          target="_blank"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Print / Save PDF
        </Link>
        <Link
          href="/invoices/new"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
        >
          + New invoice
        </Link>
        <Link
          href="/invoices"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
        >
          All invoices
        </Link>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <div>
          <p className="text-sm text-slate-500">Client</p>
          <p className="font-medium">{invoice.party_name}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Invoice date</p>
          <p className="font-medium">{formatDate(invoice.invoice_date)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Due date</p>
          <p className="font-medium">{formatDate(invoice.due_date)}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Status</p>
          <p className="font-medium capitalize">{invoice.status}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Linked receipt</p>
          <p className="font-medium">{invoice.linked_receipt_id ?? "—"}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-lg font-semibold">{formatFcfa(invoice.total_fcfa)}</p>
        </div>
        {invoice.notes ? (
          <div className="md:col-span-2">
            <p className="text-sm text-slate-500">Notes</p>
            <p>{invoice.notes}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{line.description}</td>
                <td className="px-4 py-3">{formatNumber(line.quantity)}</td>
                <td className="px-4 py-3">{line.unit ?? "—"}</td>
                <td className="px-4 py-3">{formatFcfa(line.unit_price_fcfa)}</td>
                <td className="px-4 py-3">{formatFcfa(line.line_total_fcfa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
