"use client";

import { useActionState } from "react";

import { createPartnerAction, type PartnerActionState } from "@/app/actions/partners";

const initial: PartnerActionState = {};

export function CreatePartnerForm() {
  const [state, action, pending] = useActionState(createPartnerAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Name</span>
        <input name="name" required className="input-modern mt-1 w-48" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Email</span>
        <input name="email" type="email" className="input-modern mt-1 w-52" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Phone</span>
        <input name="phone" className="input-modern mt-1 w-36" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Referral code (optional)</span>
        <input name="referralCode" placeholder="auto-generated if blank" className="input-modern mt-1 w-48" />
      </label>
      <button type="submit" disabled={pending} className="btn-brand">
        {pending ? "Adding…" : "Add partner"}
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      {state.done ? <span className="text-sm text-[var(--brand)]">Partner added.</span> : null}
    </form>
  );
}
