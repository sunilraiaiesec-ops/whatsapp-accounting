"use client";

import { useActionState } from "react";

type ActionState = { error?: string; info?: string };
type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

// A single-button form bound to a (prevState, formData) => State server
// action (the useActionState shape every action in app/actions/fixed-assets.ts
// uses) — for the simple "post due periods" / "delete" buttons that don't
// need a full form component of their own.
export function FixedAssetActionButton({
  action,
  hiddenFields,
  label,
  pendingLabel,
  confirmMessage,
  variant = "primary",
}: {
  action: Action;
  hiddenFields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  confirmMessage?: string;
  variant?: "primary" | "danger" | "outline";
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const variantClass = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    danger: "border border-red-200 text-red-600 hover:bg-red-50",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
  }[variant];

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {Object.entries(hiddenFields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 ${variantClass}`}
      >
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
      {state.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
      {state.info ? <p className="mt-2 text-xs text-emerald-600">{state.info}</p> : null}
    </form>
  );
}
