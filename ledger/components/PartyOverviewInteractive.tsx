"use client";

import { useRef } from "react";

import { PartyEnrichmentSuggestions } from "@/components/PartyEnrichmentSuggestions";
import { PartyProfileForm, type PartyProfileFormHandle } from "@/components/PartyProfileForm";
import type { PartyEnrichmentSuggestion } from "@/lib/party-insights";

type PartyProfileValues = Parameters<typeof PartyProfileForm>[0]["values"];

// Bridges the two Overview-tab client islands: accepting a "missing phone
// number" suggestion should focus the matching field in the Profile form
// below it, so this small wrapper holds the shared ref between them (the
// server page above only deals in plain strings/numbers, never JSX refs).
export function PartyOverviewInteractive({
  partyId,
  suggestions,
  profileValues,
  currency,
}: {
  partyId: string;
  suggestions: PartyEnrichmentSuggestion[];
  profileValues: PartyProfileValues;
  currency: string;
}) {
  const profileRef = useRef<PartyProfileFormHandle>(null);

  return (
    <div className="space-y-5">
      {suggestions.length > 0 ? (
        <PartyEnrichmentSuggestions
          partyId={partyId}
          suggestions={suggestions}
          onFocusField={(field) => profileRef.current?.focusField(field)}
        />
      ) : null}
      <PartyProfileForm partyId={partyId} values={profileValues} currency={currency} formRef={profileRef} />
    </div>
  );
}
