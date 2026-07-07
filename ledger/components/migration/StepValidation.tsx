"use client";

import { useEffect, useState } from "react";

import type { ClientWizardState } from "@/lib/migration/types";
import {
  getValidationSnapshotAction,
  explainImbalanceAction,
  applySuggestionAction,
  acknowledgeWarningAction,
  unacknowledgeWarningAction,
  type ValidationSnapshot,
} from "@/app/actions/migration";
import type { ImbalanceExplanation } from "@/lib/migration/suggestions";

function fmt(amount: string, currency: string): string {
  return `${amount} ${currency}`;
}

export function StepValidation({
  state,
  onStateChange,
}: {
  state: ClientWizardState;
  onStateChange: (s: ClientWizardState) => void;
}) {
  const [snapshot, setSnapshot] = useState<ValidationSnapshot | null>(null);
  const [explanation, setExplanation] = useState<ImbalanceExplanation | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getValidationSnapshotAction().then((r) => {
      if (cancelled) return;
      if ("snapshot" in r) setSnapshot(r.snapshot);
    });
    return () => {
      cancelled = true;
    };
    // Recompute whenever staged data changes.
  }, [state]);

  useEffect(() => {
    if (!snapshot || snapshot.trialBalance.balanced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExplanation(null);
      return;
    }
    let cancelled = false;
    setLoadingExplanation(true);
    explainImbalanceAction().then((r) => {
      if (cancelled) return;
      setLoadingExplanation(false);
      if ("explanation" in r) setExplanation(r.explanation);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.trialBalance.balanced]);

  if (!snapshot) {
    return <div className="card-surface p-6 text-sm text-[var(--muted)]">Computing validation…</div>;
  }

  const { trialBalance, warnings, healthScore } = snapshot;
  const unacknowledged = warnings.filter((w) => !w.acknowledged);

  return (
    <div className="space-y-5">
      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold text-slate-900">Step 5 · Live Validation</h2>
        <div className={`mt-4 grid gap-3 sm:grid-cols-4 rounded-xl p-4 ${trialBalance.balanced ? "bg-emerald-50" : "bg-amber-50"}`}>
          <div>
            <p className="text-xs uppercase text-[var(--muted)]">Assets</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt(trialBalance.totalAssets.toString(), state.currency)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--muted)]">Liabilities</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt(trialBalance.totalLiabilities.toString(), state.currency)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--muted)]">Equity</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt(trialBalance.totalEquity.toString(), state.currency)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--muted)]">Difference</p>
            <p className={`text-lg font-semibold tabular-nums ${trialBalance.balanced ? "text-emerald-700" : "text-amber-800"}`}>
              {trialBalance.balanced ? "✓ Balanced" : fmt(trialBalance.difference.toString(), state.currency)}
            </p>
          </div>
        </div>
      </div>

      {!trialBalance.balanced ? (
        <div className="card-surface p-6">
          <h3 className="text-sm font-semibold text-slate-900">5A · Why is this out of balance?</h3>
          {loadingExplanation && !explanation ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Thinking…</p>
          ) : explanation ? (
            <div className="mt-3 space-y-3">
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                {explanation.findings.length === 0 ? (
                  <li>{explanation.ruleBasedSummary}</li>
                ) : (
                  explanation.findings.map((f) => <li key={f.code}>{f.message}</li>)
                )}
              </ul>
              {explanation.aiMessage ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="mr-1 font-semibold text-[var(--brand)]">Bantoo AI:</span>
                  {explanation.aiMessage}
                </p>
              ) : null}
              {explanation.actions.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {explanation.actions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={applying !== null}
                      onClick={async () => {
                        setApplying(a.id);
                        const res = await applySuggestionAction(a.id);
                        setApplying(null);
                        if (res.state) onStateChange(res.state);
                      }}
                      className="pill-action disabled:opacity-50"
                    >
                      {applying === a.id ? "Applying…" : a.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-[var(--muted)]">
                Accepting a suggestion only stages a draft adjustment — nothing posts to your ledger
                until you confirm Finish in Step 7.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card-surface p-6">
        <h3 className="text-sm font-semibold text-slate-900">5B · Consistency Checks</h3>
        {warnings.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-700">✓ No issues detected.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {warnings.map((w) => (
              <li
                key={w.code}
                className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                  w.acknowledged ? "bg-slate-50 text-slate-500" : "bg-amber-50 text-amber-900"
                }`}
              >
                <div>
                  <p className="font-medium">
                    {w.acknowledged ? "✓" : "⚠"} {w.title}
                  </p>
                  <p className="text-xs opacity-90">{w.detail}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 whitespace-nowrap text-xs font-medium underline"
                  onClick={async () => {
                    const res = w.acknowledged
                      ? await unacknowledgeWarningAction(w.code)
                      : await acknowledgeWarningAction(w.code);
                    if (res.state) onStateChange(res.state);
                  }}
                >
                  {w.acknowledged ? "Reopen" : "Acknowledge"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card-surface p-6">
        <h3 className="text-sm font-semibold text-slate-900">5C · Migration Health Score</h3>
        <div className="mt-3 flex items-center gap-4">
          <div className="text-3xl font-bold text-slate-900">{healthScore.score}%</div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${healthScore.score >= 80 ? "bg-emerald-500" : healthScore.score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${healthScore.score}%` }}
            />
          </div>
        </div>
        <ul className="mt-4 space-y-1 text-sm">
          {healthScore.checklist.map((c) => (
            <li key={c.label} className={c.pass ? "text-emerald-700" : "text-amber-800"}>
              {c.pass ? "✓" : "⚠"} {c.label}
            </li>
          ))}
          {healthScore.warningItems.map((w) => (
            <li key={w} className="text-amber-800">
              {w}
            </li>
          ))}
        </ul>
      </div>

      {!trialBalance.balanced || unacknowledged.length > 0 ? (
        <p className="text-sm text-amber-800">
          {!trialBalance.balanced
            ? "Continue to Preview is blocked until Difference = 0."
            : `Acknowledge or fix ${unacknowledged.length} warning(s) to continue.`}
        </p>
      ) : (
        <p className="text-sm text-emerald-700">✓ Ready to continue to Preview.</p>
      )}
    </div>
  );
}
