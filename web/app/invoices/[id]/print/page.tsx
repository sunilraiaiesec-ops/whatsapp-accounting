import { PrintToolbar } from "@/components/PrintToolbar";
import { formatDate, formatFcfa, formatNumber } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { InvoiceDetail } from "@/lib/types";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await serverApi<InvoiceDetail>(`invoices/${id}`);

  return (
    <div className="min-h-screen bg-slate-100 p-6 print:bg-white print:p-0">
      <PrintToolbar invoiceId={id} />

      <article className="mx-auto max-w-3xl rounded-lg bg-white p-10 shadow-sm print:max-w-none print:shadow-none">
        <header className="mb-8 flex items-start justify-between border-b-2 border-brand pb-6">
          <div>
            <p className="text-sm font-medium text-brand">RR Foods SARL</p>
            <h1 className="mt-2 text-3xl font-bold tracking-wide">FACTURE</h1>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p className="text-lg font-semibold text-slate-900">
              {invoice.invoice_number}
            </p>
            <p>Date: {formatDate(invoice.invoice_date)}</p>
            {invoice.due_date ? <p>Due: {formatDate(invoice.due_date)}</p> : null}
            {invoice.linked_receipt_id ? (
              <p>Receipt: {invoice.linked_receipt_id}</p>
            ) : null}
          </div>
        </header>

        <section className="mb-8 rounded-lg bg-slate-50 p-4 print:bg-transparent print:p-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">Client</p>
          <p className="text-lg font-semibold">{invoice.party_name}</p>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 pr-3 text-right">Unit</th>
              <th className="py-2 pr-3 text-right">Unit price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b border-slate-100">
                <td className="py-3 pr-3">{line.description}</td>
                <td className="py-3 pr-3 text-right">{formatNumber(line.quantity)}</td>
                <td className="py-3 pr-3 text-right">{line.unit ?? "—"}</td>
                <td className="py-3 pr-3 text-right">
                  {formatFcfa(line.unit_price_fcfa)}
                </td>
                <td className="py-3 text-right">{formatFcfa(line.line_total_fcfa)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-4 text-right text-base font-semibold">
                TOTAL
              </td>
              <td className="pt-4 text-right text-base font-bold">
                {formatFcfa(invoice.total_fcfa)}
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes ? (
          <p className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
            <strong>Notes:</strong> {invoice.notes}
          </p>
        ) : null}

        <p className="mt-10 text-center text-xs text-slate-400">
          Merci pour votre confiance — Thank you for your business
        </p>
      </article>
    </div>
  );
}
