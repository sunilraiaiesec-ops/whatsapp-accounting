"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ClientWizardState } from "@/lib/migration/types";
import { WIZARD_STEP_COUNT } from "@/lib/migration/types";
import { setStepAction, getValidationSnapshotAction, finishMigrationAction } from "@/app/actions/migration";
import { ProgressBar, STEP_LABELS } from "@/components/migration/ProgressBar";
import { AskBantooDrawer } from "@/components/migration/AskBantooDrawer";
import { StepDate } from "@/components/migration/StepDate";
import { StepImport } from "@/components/migration/StepImport";
import { StepOpeningBalances } from "@/components/migration/StepOpeningBalances";
import { StepSubledgers } from "@/components/migration/StepSubledgers";
import { StepValidation } from "@/components/migration/StepValidation";
import { StepPreview } from "@/components/migration/StepPreview";

// The main orchestrator for Steps 1-7. Owns the current step and the
// authoritative `ClientWizardState`, and passes both down. Every child step
// mutates via a server action and hands back the fresh state through
// `onStateChange`, so there is exactly one source of truth on the client at
// any time (no step keeps its own copy of staged data).
export function MigrationWizardApp({ initialState }: { initialState: ClientWizardState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [step, setStep] = useState(clampStep(initialState.wizard.currentStep));
  const [navigating, startNavigating] = useTransition();
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [canFinish, setCanFinish] = useState<boolean | null>(null);

  function clampStep(s: number): number {
    return Math.min(Math.max(1, s), WIZARD_STEP_COUNT);
  }

  function goTo(next: number) {
    const clamped = clampStep(next);
    setStep(clamped);
    setFinishError(null);
    startNavigating(async () => {
      const res = await setStepAction(clamped);
      if (res.state) setState(res.state);
    });
  }

  async function handleFinish() {
    setFinishing(true);
    setFinishError(null);
    const res = await finishMigrationAction();
    setFinishing(false);
    if (res.error) {
      setFinishError(res.error);
      return;
    }
    if (res.state) setState(res.state);
    router.push("/dashboard");
  }

  // Preview (Step 6) is where we know for certain whether Finish is safe —
  // re-check right before rendering the Finish gate rather than trusting a
  // stale flag, since staged data can change on any earlier step.
  async function refreshCanFinish() {
    const res = await getValidationSnapshotAction();
    if ("snapshot" in res) setCanFinish(res.snapshot.preview.balanced && res.snapshot.trialBalance.balanced);
  }

  // Also re-check automatically on arrival at Step 7 (e.g. resuming a saved
  // wizard directly onto Finish), not just when navigated to via Continue.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step === 7) void refreshCanFinish();
  }, [step]);

  return (
    <div className="space-y-5 pb-24">
      <ProgressBar currentStep={step} />

      <div className="flex flex-wrap gap-1.5">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const reachable = n <= step || n <= state.wizard.currentStep + 1;
          return (
            <button
              key={label}
              type="button"
              disabled={!reachable || navigating}
              onClick={() => goTo(n)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                n === step
                  ? "bg-[var(--brand)] text-white"
                  : reachable
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    : "cursor-not-allowed bg-slate-50 text-slate-300"
              }`}
            >
              {n}. {label}
            </button>
          );
        })}
      </div>

      {step === 1 ? <StepDate state={state} onStateChange={setState} /> : null}
      {step === 2 ? <StepImport state={state} onStateChange={setState} /> : null}
      {step === 3 ? (
        <StepOpeningBalances state={state} onStateChange={setState} onGoToStep4={() => goTo(4)} />
      ) : null}
      {step === 4 ? <StepSubledgers state={state} onStateChange={setState} /> : null}
      {step === 5 ? <StepValidation state={state} onStateChange={setState} /> : null}
      {step === 6 ? <StepPreview state={state} /> : null}
      {step === 7 ? (
        <FinishStep
          state={state}
          canFinish={canFinish}
          onCheck={refreshCanFinish}
          onFinish={handleFinish}
          finishing={finishing}
          error={finishError}
        />
      ) : null}

      <div className="card-surface flex items-center justify-between p-4">
        <button
          type="button"
          disabled={step === 1 || navigating}
          onClick={() => goTo(step - 1)}
          className="pill-action disabled:opacity-40"
        >
          ← Back
        </button>
        {step < WIZARD_STEP_COUNT ? (
          <button
            type="button"
            disabled={navigating || (step === 1 && !state.wizard.openingDate)}
            onClick={() => goTo(step + 1)}
            className="btn-brand disabled:opacity-50"
          >
            Continue →
          </button>
        ) : null}
      </div>

      <AskBantooDrawer />
    </div>
  );
}

function FinishStep({
  state,
  canFinish,
  onCheck,
  onFinish,
  finishing,
  error,
}: {
  state: ClientWizardState;
  canFinish: boolean | null;
  onCheck: () => Promise<void>;
  onFinish: () => Promise<void>;
  finishing: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-5">
      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold text-slate-900">Step 7 · Finish</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          This posts the Opening Balances journal entry and updates customer, supplier, bank and
          inventory balances in one transaction. This cannot be partially applied — it either fully
          succeeds or nothing changes.
        </p>
      </div>

      <div className="card-surface p-6">
        {!state.isAdmin ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only an administrator (Owner or Admin) can finish this migration. You can review every
            other step, but the Finish button is disabled for your role.
          </p>
        ) : (
          <>
            {canFinish === null ? (
              <button type="button" onClick={onCheck} className="pill-action">
                Re-check readiness
              </button>
            ) : !canFinish ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Not ready yet — go back to Step 5 and resolve the imbalance before finishing.
              </p>
            ) : (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                ✓ Balanced and ready. Finishing will post real journal entries to your ledger.
              </p>
            )}
            <button
              type="button"
              disabled={finishing || canFinish === false || canFinish === null}
              onClick={onFinish}
              className="btn-brand mt-4 disabled:opacity-50"
            >
              {finishing ? "Posting…" : "Finish migration & post opening balances"}
            </button>
          </>
        )}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
