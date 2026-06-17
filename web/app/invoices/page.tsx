import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { formatDate, formatFcfa } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { InvoiceSummary } from "@/lib/types";

type InvoicesResponse = {
  items: InvoiceSummary[];
  count: number;
};

export default async function InvoicesPage() {
  const data = await serverApi<InvoicesResponse>("invoices");

  return (
    <AppShell
      title="Invoices"
      subtitle={`${data.count} sales invoices`}
    >
      <div className="mb-6 flex justify-end">
        <Link
          href="/invoices/new"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          + New invoice
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No invoices yet.{" "}
                  <Link href="/invoices/new" className="text-brand hover:underline">
                    Create your first invoice
                  </Link>
                </td>
              </tr>
            ) : (
              data.items.map((invoice) => (
                <tr key={invoice.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {invoice.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(invoice.invoice_date)}
                  </td>
                  <td className="px-4 py-3">{invoice.party_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatFcfa(invoice.total_fcfa)}
                  </td>
                  <td className="px-4 py-3 capitalize">{invoice.status}</td>
                  <td className="px-4 py-3">{invoice.linked_receipt_id ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
