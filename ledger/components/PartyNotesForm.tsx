"use client";

import { useActionState } from "react";

import { updatePartyNotesAction, type PartyNotesState } from "@/app/actions/parties";

const initial: PartyNotesState = {};

export function PartyNotesForm({ partyId, notes }: { partyId: string; notes: string | null }) {
  const boundAction = updatePartyNotesAction.bind(null, partyId);
  const [state, action, pending] = useActionState(boundAction, initial);

  return (
    <form action={action} className="card-surface space-y-3 p-5">
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Notes</span>
        <textarea
          name="notes"
          defaultValue={notes ?? ""}
          rows={8}
          placeholder="Freeform notes about this contact — preferences, history, reminders…"
          className="input-modern mt-1 resize-y"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-brand">
          {pending ? "Saving…" : "Save notes"}
        </button>
        {state.ok ? <span className="text-sm text-[var(--brand)]">Saved.</span> : null}
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
