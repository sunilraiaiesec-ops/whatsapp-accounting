"use client";

import { useState } from "react";

import { acceptPartyEnrichmentSuggestionAction } from "@/app/actions/parties";
import type { PartyEnrichmentSuggestion } from "@/lib/party-insights";

// Gentle, dismissible "Ask Bantoo" enrichment prompts on the contact's
// Overview tab: missing-field nudges ("no phone number — add it?") and
// frequency-based nudges ("usually paid after 30 days — set payment terms?").
// Never blocks anything else on the page; accepting persists a real field via
// acceptPartyEnrichmentSuggestionAction, dismissing is purely client-side.
export function PartyEnrichmentSuggestions({
  partyId,
  suggestions,
  onFocusField,
}: {
  partyId: string;
  suggestions: PartyEnrichmentSuggestion[];
  onFocusField?: (field: "phone" | "whatsapp") => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  const visible = suggestions.filter((s) => !dismissed.has(s.id) && !applied.has(s.id));
  if (visible.length === 0) return null;

  async function accept(s: PartyEnrichmentSuggestion) {
    if (s.accept.type === "focus_field") {
      onFocusField?.(s.accept.field);
      setApplied((prev) => new Set(prev).add(s.id));
      return;
    }
    setPending(s.id);
    try {
      const res = await acceptPartyEnrichmentSuggestionAction(partyId, s.accept);
      if (res.ok) setApplied((prev) => new Set(prev).add(s.id));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      {visible.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--brand)]/25 bg-[var(--brand)]/5 px-4 py-3"
        >
          <p className="text-sm text-slate-800">
            <span aria-hidden className="mr-1.5">
              💡
            </span>
            {s.text}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void accept(s)}
              disabled={pending === s.id}
              className="btn-brand px-3 py-1.5 text-xs"
            >
              {pending === s.id ? "…" : "Accept"}
            </button>
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(s.id))}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
