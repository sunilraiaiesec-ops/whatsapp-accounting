"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { createPartyAction, type PartyState } from "@/app/actions/parties";

const initial: PartyState = {};

// Quick-add stays deliberately minimal: Name, Type, Phone, WhatsApp, Country,
// City. Extended profile fields (email, address, tax id, terms, etc.) live
// on the contact's Profile tab instead — see components/PartyProfileForm.tsx.
export function PartyCreateForm({
  defaultType = "customer",
}: {
  defaultType?: "customer" | "supplier" | "both";
}) {
  const [state, action, pending] = useActionState(createPartyAction, initial);
  const [expanded, setExpanded] = useState(false);

  const hrefForCandidate = (type: string, id: string) =>
    type === "supplier" ? `/suppliers/${id}` : `/customers/${id}`;

  return (
    <div className="card-surface p-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Name</span>
          <input name="name" required defaultValue={state.pending?.name} className="input-modern mt-1 w-56" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Type</span>
          <select
            name="type"
            defaultValue={state.pending?.type ?? defaultType}
            className="input-modern mt-1 w-36"
          >
            <option value="customer">Customer</option>
            <option value="supplier">Supplier</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Phone</span>
          <input name="phone" defaultValue={state.pending?.phone} className="input-modern mt-1 w-40" />
        </label>

        {expanded ? (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">WhatsApp</span>
              <input name="whatsapp" defaultValue={state.pending?.whatsapp} className="input-modern mt-1 w-40" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Country</span>
              <input name="country" defaultValue={state.pending?.country} className="input-modern mt-1 w-32" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">City</span>
              <input name="city" defaultValue={state.pending?.city} className="input-modern mt-1 w-32" />
            </label>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mb-2.5 text-xs font-semibold text-[var(--brand)] hover:underline"
          >
            + WhatsApp / Country / City
          </button>
        )}

        <button type="submit" disabled={pending} className="btn-brand">
          {pending ? "Adding…" : "Add contact"}
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </form>

      {state.duplicates && state.duplicates.length > 0 ? (
        <div className="mt-4 rounded-xl border-2 border-amber-300/60 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Possible existing contact found</p>
          <ul className="mt-2 space-y-1.5">
            {state.duplicates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-800">
                  <Link href={hrefForCandidate(d.type, d.id)} className="font-medium text-[var(--brand)] hover:underline">
                    {d.name}
                  </Link>
                  {d.phone ? <span className="text-slate-500"> · {d.phone}</span> : null}
                  <span className="ml-2 text-xs text-slate-500">
                    {d.matchedOn === "name" ? `${d.score}% name match` : `${d.matchedOn} match`}
                  </span>
                </span>
                <Link
                  href={hrefForCandidate(d.type, d.id)}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300"
                >
                  Use existing contact
                </Link>
              </li>
            ))}
          </ul>
          <form action={action} className="mt-3">
            <input type="hidden" name="confirmCreate" value="1" />
            <input type="hidden" name="name" value={state.pending?.name ?? ""} />
            <input type="hidden" name="type" value={state.pending?.type ?? defaultType} />
            <input type="hidden" name="phone" value={state.pending?.phone ?? ""} />
            <input type="hidden" name="whatsapp" value={state.pending?.whatsapp ?? ""} />
            <input type="hidden" name="country" value={state.pending?.country ?? ""} />
            <input type="hidden" name="city" value={state.pending?.city ?? ""} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Create new anyway
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
