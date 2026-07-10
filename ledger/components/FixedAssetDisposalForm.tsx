"use client";

import { useActionState, useMemo, useState } from "react";

import { disposeFixedAssetAction, type FixedAssetState } from "@/app/actions/fixed-assets";
import { AccountingPreview, type AccountingPreviewLine } from "@/components/ui/AccountingPreview";
import { formatAmount, parseAmount } from "@/lib/money";

type Option = { id: string; label: string };

const initial: FixedAssetState = {};

export function FixedAssetDisposalForm({
  assetId,
  currency,
  purchaseCost,
  accumulatedDepreciation,
  fixedAssetAccountLabel,
  accumulatedDeprecAccountLabel,
  receivingAccounts,
}: {
  assetId: string;
  currency: string;
  purchaseCost: string;
  accumulatedDepreciation: string;
  fixedAssetAccountLabel: string;
  accumulatedDeprecAccountLabel: string;
  receivingAccounts: Option[];
}) {
  const [state, action, pending] = useActionState(disposeFixedAssetAction, initial);
  const today = new Date().toISOString().slice(0, 10);

  const cost = BigInt(purchaseCost);
  const accumDep = BigInt(accumulatedDepreciation);
  const bookValue = cost - accumDep;

  const [proceedsInput, setProceedsInput] = useState("0");
  const [receivingAccountId, setReceivingAccountId] = useState(receivingAccounts[0]?.id ?? "");

  const proceeds = parseAmount(proceedsInput || "0", currency);
  const gainLoss = proceeds - bookValue;

  const receivingLabel =
    receivingAccounts.find((a) => a.id === receivingAccountId)?.label ?? "Receiving account";

  const previewLines = useMemo(() => {
    const lines: AccountingPreviewLine[] = [];
    if (proceeds > 0n) lines.push({ label: receivingLabel, debit: proceeds });
    if (accumDep > 0n) {
      lines.push({ label: accumulatedDeprecAccountLabel, debit: accumDep });
    }
    lines.push({ label: fixedAssetAccountLabel, credit: cost });
    if (gainLoss > 0n) {
      lines.push({ label: "Gain on disposal of assets", credit: gainLoss });
    } else if (gainLoss < 0n) {
      lines.push({ label: "Loss on disposal of assets", debit: -gainLoss });
    }
    return lines;
  }, [proceeds, accumDep, cost, gainLoss, receivingLabel, accumulatedDeprecAccountLabel, fixedAssetAccountLabel]);

  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="assetId" value={assetId} />

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Disposal date</span>
        <input
          type="date"
          name="date"
          defaultValue={today}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Sale proceeds (0 for a write-off)</span>
          <input
            inputMode="decimal"
            name="proceeds"
            value={proceedsInput}
            onChange={(e) => setProceedsInput(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Receiving account</span>
          <select
            name="receivingAccountId"
            value={receivingAccountId}
            onChange={(e) => setReceivingAccountId(e.target.value)}
            disabled={proceeds === 0n}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            {receivingAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="card-surface p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Book value</span>
          <span className="tabular-nums">{formatAmount(bookValue, currency)}</span>
        </div>
        <div className="mt-1 flex justify-between font-medium">
          <span className="text-slate-500">{gainLoss >= 0n ? "Gain" : "Loss"} on disposal</span>
          <span className={`tabular-nums ${gainLoss >= 0n ? "text-emerald-600" : "text-red-600"}`}>
            {formatAmount(gainLoss < 0n ? -gainLoss : gainLoss, currency)}
          </span>
        </div>
      </div>

      <AccountingPreview lines={previewLines} currency={currency} title="Disposal journal entry preview" />

      <div className="flex items-center justify-between">
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : <span />}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Posting…" : "Dispose asset"}
        </button>
      </div>
    </form>
  );
}
