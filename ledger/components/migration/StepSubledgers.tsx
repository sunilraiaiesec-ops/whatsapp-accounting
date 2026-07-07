"use client";

import { useMemo, useState } from "react";

import type { ClientWizardState } from "@/lib/migration/types";
import { MoneyInput } from "@/components/migration/MoneyInput";
import { BankCategoryRows } from "@/components/migration/StepOpeningBalances";
import {
  saveCustomerBalanceAction,
  saveSupplierBalanceAction,
  saveInventoryBalanceAction,
  removeInventoryBalanceAction,
} from "@/app/actions/migration";

type Tab = "ar" | "ap" | "inventory" | "bank";

function sum(values: string[]): number {
  return values.reduce((s, v) => s + (Number(v.replace(/,/g, "")) || 0), 0);
}

export function StepSubledgers({
  state,
  onStateChange,
}: {
  state: ClientWizardState;
  onStateChange: (s: ClientWizardState) => void;
}) {
  const [tab, setTab] = useState<Tab>("ar");
  const [query, setQuery] = useState("");

  const arTotal = sum(state.customerBalances.map((r) => r.amount));
  const apTotal = sum(state.supplierBalances.map((r) => r.amount));
  const invTotal = sum(state.inventoryBalances.map((r) => r.totalValue));

  const filteredCustomers = useMemo(
    () => state.customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [state.customers, query],
  );
  const filteredSuppliers = useMemo(
    () => state.suppliers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [state.suppliers, query],
  );
  const filteredItems = useMemo(
    () => state.items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()) || i.code.toLowerCase().includes(query.toLowerCase())),
    [state.items, query],
  );

  const tabs: { key: Tab; label: string; total: string }[] = [
    { key: "ar", label: "Customers (AR)", total: `${arTotal.toLocaleString()} ${state.currency}` },
    { key: "ap", label: "Suppliers (AP)", total: `${apTotal.toLocaleString()} ${state.currency}` },
    { key: "inventory", label: "Inventory", total: `${invTotal.toLocaleString()} ${state.currency}` },
    { key: "bank", label: "Bank", total: "" },
  ];

  return (
    <div className="space-y-5">
      <div className="card-surface p-6">
        <h2 className="text-lg font-semibold text-slate-900">Step 4 · Subledgers</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Assign your Accounts Receivable and Accounts Payable totals to specific customers and
          suppliers, stage opening inventory quantities/costs, and confirm every bank account
          balance. These totals automatically become Step 3&apos;s AR / AP / Inventory figures.
        </p>
      </div>

      <div className="card-surface p-2">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setQuery("");
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t.key ? "bg-[var(--brand)] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label} {t.total ? <span className="ml-1 opacity-80">· {t.total}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="card-surface p-5">
        {tab !== "bank" ? (
          <input
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-modern mb-4 max-w-xs"
          />
        ) : null}

        {tab === "ar" ? (
          <div className="space-y-2">
            {filteredCustomers.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No customers yet — import them in Step 2 or add one from the Customers page.</p>
            ) : (
              filteredCustomers.map((c) => {
                const row = state.customerBalances.find((r) => r.partyId === c.id);
                return (
                  <div key={c.id} className="grid grid-cols-[1fr_180px] items-center gap-3 border-b border-slate-100 py-2 last:border-0">
                    <div>
                      <p className="text-sm text-slate-800">{c.name}</p>
                      {c.phone ? <p className="text-xs text-[var(--muted)]">{c.phone}</p> : null}
                    </div>
                    <MoneyInput
                      initialValue={row?.amount ?? "0"}
                      onCommit={async (v) => {
                        const res = await saveCustomerBalanceAction(c.id, v);
                        if (res.state) onStateChange(res.state);
                      }}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {tab === "ap" ? (
          <div className="space-y-2">
            {filteredSuppliers.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No suppliers yet — import them in Step 2 or add one from the Suppliers page.</p>
            ) : (
              filteredSuppliers.map((s) => {
                const row = state.supplierBalances.find((r) => r.partyId === s.id);
                return (
                  <div key={s.id} className="grid grid-cols-[1fr_180px] items-center gap-3 border-b border-slate-100 py-2 last:border-0">
                    <div>
                      <p className="text-sm text-slate-800">{s.name}</p>
                      {s.phone ? <p className="text-xs text-[var(--muted)]">{s.phone}</p> : null}
                    </div>
                    <MoneyInput
                      initialValue={row?.amount ?? "0"}
                      onCommit={async (v) => {
                        const res = await saveSupplierBalanceAction(s.id, v);
                        if (res.state) onStateChange(res.state);
                      }}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {tab === "inventory" ? (
          <div className="space-y-2">
            <p className="mb-2 text-xs text-[var(--muted)]">
              Warehouse is a free-text field — this app doesn&apos;t yet have a dedicated multi-location
              model, so it&apos;s a label only (see report limitations).
            </p>
            {filteredItems.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No inventory items yet — import them in Step 2 or add them from the Inventory page.</p>
            ) : (
              filteredItems.map((item) => {
                const row = state.inventoryBalances.find((r) => r.itemId === item.id);
                return (
                  <div key={item.id} className="grid grid-cols-2 gap-2 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[1.4fr_0.8fr_0.6fr_0.9fr_0.9fr_1fr_auto] sm:items-center">
                    <p className="text-sm text-slate-800 sm:col-span-1">
                      {item.name} <span className="text-xs text-[var(--muted)]">({item.code})</span>
                    </p>
                    <MoneyInput
                      initialValue={row?.quantity ?? "0"}
                      placeholder="Qty"
                      onCommit={async (v) => {
                        const res = await saveInventoryBalanceAction(
                          item.id,
                          v,
                          row?.unit ?? item.unit ?? "",
                          row?.unitCost ?? "0",
                          row?.warehouse ?? "",
                        );
                        if (res.state) onStateChange(res.state);
                      }}
                    />
                    <input
                      type="text"
                      defaultValue={row?.unit ?? item.unit ?? ""}
                      placeholder="Unit"
                      className="input-modern"
                      onBlur={async (e) => {
                        const res = await saveInventoryBalanceAction(
                          item.id,
                          row?.quantity ?? "0",
                          e.target.value,
                          row?.unitCost ?? "0",
                          row?.warehouse ?? "",
                        );
                        if (res.state) onStateChange(res.state);
                      }}
                    />
                    <MoneyInput
                      initialValue={row?.unitCost ?? "0"}
                      placeholder="Unit cost"
                      onCommit={async (v) => {
                        const res = await saveInventoryBalanceAction(
                          item.id,
                          row?.quantity ?? "0",
                          row?.unit ?? item.unit ?? "",
                          v,
                          row?.warehouse ?? "",
                        );
                        if (res.state) onStateChange(res.state);
                      }}
                    />
                    <p className="tabular-nums text-sm font-medium text-slate-900">
                      {row?.totalValue ?? "0"} {state.currency}
                    </p>
                    <input
                      type="text"
                      defaultValue={row?.warehouse ?? ""}
                      placeholder="Warehouse (optional)"
                      className="input-modern"
                      onBlur={async (e) => {
                        const res = await saveInventoryBalanceAction(
                          item.id,
                          row?.quantity ?? "0",
                          row?.unit ?? item.unit ?? "",
                          row?.unitCost ?? "0",
                          e.target.value,
                        );
                        if (res.state) onStateChange(res.state);
                      }}
                    />
                    {row ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={async () => {
                          const res = await removeInventoryBalanceAction(item.id);
                          if (res.state) onStateChange(res.state);
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {tab === "bank" ? <BankCategoryRows state={state} onStateChange={onStateChange} /> : null}
      </div>
    </div>
  );
}
