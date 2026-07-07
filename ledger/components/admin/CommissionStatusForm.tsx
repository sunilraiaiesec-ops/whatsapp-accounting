"use client";

import { useActionState } from "react";
import type { CommissionStatus } from "@prisma/client";

import { setCommissionStatusAction, type PartnerActionState } from "@/app/actions/partners";

const initial: PartnerActionState = {};
const STATUSES: CommissionStatus[] = ["PENDING", "APPROVED", "PAID", "CANCELLED"];

export function CommissionStatusForm({
  commissionId,
  currentStatus,
}: {
  commissionId: string;
  currentStatus: CommissionStatus;
}) {
  const [state, action, pending] = useActionState(setCommissionStatusAction, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="commissionId" value={commissionId} />
      <select
        name="status"
        defaultValue={currentStatus}
        disabled={pending}
        className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-[var(--brand)]"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
