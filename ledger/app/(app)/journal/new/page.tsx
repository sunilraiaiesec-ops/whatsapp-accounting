import Link from "next/link";

import { requireContext } from "@/lib/auth/current";
import { listAccounts } from "@/lib/accounts";
import { JournalEntryForm } from "@/components/JournalEntryForm";

export default async function NewJournalEntryPage() {
  const ctx = await requireContext();
  const accounts = await listAccounts(ctx.orgId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/journal" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to journal
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New Journal Entry</h1>
      <p className="text-sm text-slate-500">
        Post a balanced entry. Total debits must equal total credits.
      </p>

      <JournalEntryForm
        accounts={accounts.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          isControl: a.isControl,
        }))}
        currency={ctx.baseCurrency}
      />
    </div>
  );
}
