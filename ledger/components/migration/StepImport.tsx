"use client";

import { useRef, useState } from "react";

import type { ClientWizardState } from "@/lib/migration/types";
import { importMasterDataAction } from "@/app/actions/migration";
import type { MigrationEntityKind } from "@/lib/migration/import-sources";

const ENTITY_OPTIONS: { value: MigrationEntityKind; label: string }[] = [
  { value: "customers", label: "Customers" },
  { value: "suppliers", label: "Suppliers" },
  { value: "products", label: "Products" },
  { value: "services", label: "Services" },
  { value: "inventory", label: "Inventory (quantity & cost)" },
  { value: "chart_of_accounts", label: "Chart of Accounts" },
];

// Step 2 — entirely optional/skippable. CSV is the only import source
// registered in v1 (lib/migration/import-sources.ts), but the wizard talks
// only to the MigrationImportSource interface, so future importers
// (QuickBooks, Manager.io, Xero, Sage, Excel, PDF/AI-OCR) can register
// themselves without this component changing.
export function StepImport({
  state,
  onStateChange,
}: {
  state: ClientWizardState;
  onStateChange: (s: ClientWizardState) => void;
}) {
  const [entityKind, setEntityKind] = useState<MigrationEntityKind>("customers");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV or Excel file first.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("entityKind", entityKind);
    const res = await importMasterDataAction(formData);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.state) onStateChange(res.state);
    setResult({ imported: res.imported ?? 0, skipped: res.skipped ?? 0, errors: res.errors ?? [] });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="card-surface p-6">
      <h2 className="text-lg font-semibold text-slate-900">Step 2 · Import Existing Master Data</h2>
      <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
        Optional. Bring in Customers, Suppliers, Products, Services, Inventory or your Chart of
        Accounts from a CSV/Excel export of your previous system. You can skip this step entirely
        and enter everything manually in Steps 3–4.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-xl border border-[var(--border)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">What are you importing?</span>
            <select
              className="input-modern mt-1"
              value={entityKind}
              onChange={(e) => setEntityKind(e.target.value as MigrationEntityKind)}
            >
              {ENTITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">File</span>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="mt-1 block w-full text-sm" />
          </label>
        </div>
        <button type="submit" disabled={pending} className="btn-brand disabled:opacity-50">
          {pending ? "Importing…" : "Import"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {result ? (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Imported {result.imported}, skipped {result.skipped}.
            {result.errors.length > 0 ? (
              <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-3">
        <p>Customers/suppliers so far: {state.customers.length} / {state.suppliers.length}</p>
        <p>Inventory items so far: {state.items.length}</p>
        <p>
          Accounts so far: {state.accounts.length}
        </p>
      </div>
    </div>
  );
}
