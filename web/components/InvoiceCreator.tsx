"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { clientApi } from "@/lib/client-api";
import { formatFcfa } from "@/lib/format";

type PartyOption = { id: number; name: string; party_type: string };
type ProductOption = {
  id: number;
  name: string;
  default_unit: string | null;
  default_unit_price_fcfa: number | null;
};

type LineDraft = {
  key: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price_fcfa: string;
  product_id?: number;
};

function emptyLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    description: "",
    quantity: "1",
    unit: "",
    unit_price_fcfa: "",
  };
}

export function InvoiceCreator({
  parties,
  products,
  initialPartyId,
  initialAmount,
  initialReceiptId,
  initialDescription,
}: {
  parties: PartyOption[];
  products: ProductOption[];
  initialPartyId?: number;
  initialAmount?: number;
  initialReceiptId?: string;
  initialDescription?: string;
}) {
  const router = useRouter();
  const customers = useMemo(
    () =>
      parties.filter((p) =>
        ["customer", "both"].includes(p.party_type),
      ),
    [parties],
  );

  const [partyId, setPartyId] = useState(
    initialPartyId ? String(initialPartyId) : "",
  );
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedReceiptId, setLinkedReceiptId] = useState(
    initialReceiptId ?? "",
  );
  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (initialAmount || initialDescription) {
      return [
        {
          ...emptyLine(),
          description: initialDescription ?? "",
          unit_price_fcfa: initialAmount ? String(initialAmount) : "",
        },
      ];
    }
    return [emptyLine()];
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = lines.reduce((sum, line) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseInt(line.unit_price_fcfa, 10) || 0;
    return sum + Math.round(qty * price);
  }, 0);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((current) =>
      current.length <= 1 ? current : current.filter((_, i) => i !== index),
    );
  }

  function applyProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === Number(productId));
    if (!product) return;
    updateLine(index, {
      description: product.name,
      unit: product.default_unit ?? "",
      unit_price_fcfa: product.default_unit_price_fcfa
        ? String(product.default_unit_price_fcfa)
        : "",
      product_id: product.id,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!partyId) {
      setError("Please select a client.");
      return;
    }

    const payloadLines = lines.map((line) => ({
      description: line.description.trim(),
      quantity: parseFloat(line.quantity) || 1,
      unit: line.unit.trim() || null,
      unit_price_fcfa: parseInt(line.unit_price_fcfa, 10) || 0,
      product_id: line.product_id ?? null,
    }));

    if (payloadLines.some((line) => !line.description)) {
      setError("Each line needs a description.");
      return;
    }

    setSaving(true);
    try {
      const invoice = await clientApi<{ id: number }>("invoices", {
        method: "POST",
        body: JSON.stringify({
          party_id: Number(partyId),
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          notes: notes.trim() || null,
          linked_receipt_id: linkedReceiptId.trim() || null,
          lines: payloadLines,
        }),
      });
      router.push(`/invoices/${invoice.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Client</span>
          <select
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          >
            <option value="">Select client…</option>
            {customers.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Invoice date</span>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Due date (optional)</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Linked receipt (optional)</span>
          <input
            type="text"
            value={linkedReceiptId}
            onChange={(e) => setLinkedReceiptId(e.target.value)}
            placeholder="RR-000005"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Payment terms, shipment reference…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Line items</h2>
          <button
            type="button"
            onClick={addLine}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            + Add line
          </button>
        </div>

        <div className="space-y-4">
          {lines.map((line, index) => (
            <div
              key={line.key}
              className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4 md:grid-cols-6"
            >
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-slate-600">Product shortcut</span>
                <select
                  value=""
                  onChange={(e) => applyProduct(index, e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">Pick product…</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm md:col-span-4">
                <span className="mb-1 block text-slate-600">Description</span>
                <input
                  type="text"
                  value={line.description}
                  onChange={(e) =>
                    updateLine(index, { description: e.target.value })
                  }
                  placeholder="Rice shipment, 50kg bags…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  required
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Qty</span>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(index, { quantity: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Unit</span>
                <input
                  type="text"
                  value={line.unit}
                  onChange={(e) => updateLine(index, { unit: e.target.value })}
                  placeholder="bag, ton…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-slate-600">Unit price (FCFA)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={line.unit_price_fcfa}
                  onChange={(e) =>
                    updateLine(index, { unit_price_fcfa: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <div className="flex items-end justify-between md:col-span-2">
                <p className="text-sm text-slate-600">
                  Line total:{" "}
                  <strong>
                    {formatFcfa(
                      Math.round(
                        (parseFloat(line.quantity) || 0) *
                          (parseInt(line.unit_price_fcfa, 10) || 0),
                      ),
                    )}
                  </strong>
                </p>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-right text-lg font-semibold">
          Total: {formatFcfa(total)}
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Creating…" : "Create invoice"}
        </button>
      </div>
    </form>
  );
}
