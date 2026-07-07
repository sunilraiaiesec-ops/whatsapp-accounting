const STEP_LABELS = [
  "Migration Date",
  "Import Data",
  "Opening Balances",
  "Subledgers",
  "Validation",
  "Preview",
  "Finish",
];

// Renders exactly the format described in the spec: "✓ Step 1 · ✓ Step 2 ·
// ✓ Step 3 · ⏳ Step 4 · Remaining: Validation, Preview, Finish".
export function ProgressBar({ currentStep }: { currentStep: number }) {
  const segments: string[] = [];
  for (let i = 1; i <= STEP_LABELS.length; i++) {
    if (i < currentStep) segments.push(`✓ Step ${i}`);
    else if (i === currentStep) segments.push(`⏳ Step ${i}`);
    else break;
  }
  const remainingLabels = STEP_LABELS.slice(currentStep);

  return (
    <div className="card-surface flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
      {segments.map((s, i) => (
        <span key={i} className={i === segments.length - 1 ? "font-semibold text-slate-900" : "text-slate-500"}>
          {s}
          {i < segments.length - 1 ? <span className="mx-1 text-slate-300">·</span> : null}
        </span>
      ))}
      {remainingLabels.length > 0 ? (
        <span className="text-slate-400">
          {segments.length > 0 ? <span className="mx-1 text-slate-300">·</span> : null}
          Remaining: {remainingLabels.join(", ")}
        </span>
      ) : null}
    </div>
  );
}

export { STEP_LABELS };
