"use client";

import { useActionState, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import {
  confirmImportAction,
  type ImportActionState,
} from "@/app/actions/import";

const initial: ImportActionState = {};

const kindLabel: Record<string, string> = {
  journal: "Journal",
  receipt: "Receipt",
  payment: "Payment",
  party: "Party",
};

export function ImportWizard() {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const [parseState, setParseState] = useState<ImportActionState>(initial);
  const [parsePending, setParsePending] = useState(false);
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmImportAction,
    initial,
  );
  const [createParties, setCreateParties] = useState(true);

  const preview = parseState.preview;
  const result = confirmState.result;

  const rowsJson = useMemo(
    () => (preview?.resolvedRows ? JSON.stringify(preview.resolvedRows) : ""),
    [preview?.resolvedRows],
  );

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParsePending(true);
    setParseState(initial);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/import/analyze", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as ImportActionState;
      setParseState(data);
    } catch {
      setParseState({
        error: "Could not read this file. Try Excel export from your previous software.",
      });
    } finally {
      setParsePending(false);
    }
  }

  if (result) {
    return (
      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold text-green-800">{t("doneTitle")}</h2>
        <p className="mt-2 text-sm text-slate-700">
          {t("doneSummary", { imported: result.imported, skipped: result.skipped })}
        </p>
        {result.errors.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-red-700">
            {result.errors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card-surface p-6">
        <h2 className="text-lg font-semibold text-slate-900">{t("uploadTitle")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("uploadSubtitle")}</p>
        <ul className="mt-3 list-inside list-disc text-sm text-slate-500">
          <li>{t("hintExcel")}</li>
          <li>{t("hintPdf")}</li>
        </ul>

        <form onSubmit={handleAnalyze} className="mt-5 space-y-4">
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv,.pdf,application/pdf"
            required
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          />
          <button
            type="submit"
            disabled={parsePending}
            className="btn-brand disabled:opacity-50"
          >
            {parsePending ? tc("loading") : t("analyzeFile")}
          </button>
        </form>

        {parseState.error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {parseState.error}
          </p>
        ) : null}
        {confirmState.error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {confirmState.error}
          </p>
        ) : null}
      </section>

      {preview ? (
        <section className="card-surface overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-slate-900">{t("previewTitle")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {preview.fileName} · {preview.detectedFormat} · {preview.summary.total}{" "}
              {t("rowsDetected")}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
              <span>{t("countJournal", { n: preview.summary.journal })}</span>
              <span>{t("countReceipts", { n: preview.summary.receipts })}</span>
              <span>{t("countPayments", { n: preview.summary.payments })}</span>
              <span>{t("countParties", { n: preview.summary.parties })}</span>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">{t("colType")}</th>
                  <th className="px-4 py-2">{tc("date")}</th>
                  <th className="px-4 py-2">{tc("description")}</th>
                  <th className="px-4 py-2">{t("colAmount")}</th>
                  <th className="px-4 py-2">{t("colParty")}</th>
                  <th className="px-4 py-2">{t("colConfidence")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.resolvedRows?.map((row) => (
                  <tr key={row.rowNumber} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-400">{row.rowNumber}</td>
                    <td className="px-4 py-2 font-medium">{kindLabel[row.kind] ?? row.kind}</td>
                    <td className="px-4 py-2 tabular-nums">{row.date ?? "—"}</td>
                    <td className="px-4 py-2">
                      <p>{row.description || "—"}</p>
                      {row.warnings.length > 0 ? (
                        <p className="mt-0.5 text-xs text-amber-700">{row.warnings[0]}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {row.amount || row.debit || row.credit || "—"}
                    </td>
                    <td className="px-4 py-2">{row.partyName || "—"}</td>
                    <td className="px-4 py-2 capitalize">{row.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={confirmAction} className="space-y-4 border-t border-[var(--border)] bg-slate-50/80 px-5 py-4 sm:px-6">
            <input type="hidden" name="rows" value={rowsJson} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="createParties"
                checked={createParties}
                onChange={(e) => setCreateParties(e.target.checked)}
                className="rounded border-slate-300"
              />
              {t("createParties")}
            </label>
            <p className="text-xs text-slate-500">{t("confirmHint")}</p>
            <button
              type="submit"
              disabled={confirmPending || !rowsJson}
              className="btn-brand disabled:opacity-50"
            >
              {confirmPending ? tc("saving") : t("importNow")}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
