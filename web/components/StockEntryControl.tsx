"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientApi } from "@/lib/client-api";

type Mode = "opening" | "receipt";

const CONFIG: Record<
  Mode,
  { path: string; label: string; placeholder: string; clearAfter: boolean }
> = {
  opening: {
    path: "inventory/opening",
    label: "Set",
    placeholder: "Count",
    clearAfter: false,
  },
  receipt: {
    path: "inventory/receipts",
    label: "Add",
    placeholder: "Qty in",
    clearAfter: true,
  },
};

export function StockEntryControl({
  productId,
  mode,
  unit,
  initialValue,
  withCost = false,
}: {
  productId: number;
  mode: Mode;
  unit: string | null;
  initialValue?: number | null;
  withCost?: boolean;
}) {
  const router = useRouter();
  const config = CONFIG[mode];
  const [value, setValue] = useState(
    initialValue != null ? String(initialValue) : "",
  );
  const [cost, setCost] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const quantity = Number(value);
    if (Number.isNaN(quantity)) {
      alert("Enter a valid quantity");
      return;
    }
    if (mode === "receipt" && quantity <= 0) {
      alert("Quantity must be positive");
      return;
    }

    const body: {
      product_id: number;
      quantity: number;
      unit: string | null;
      unit_cost_fcfa?: number;
    } = { product_id: productId, quantity, unit };

    if (withCost && cost.trim() !== "") {
      const costValue = Number(cost);
      if (Number.isNaN(costValue) || costValue < 0) {
        alert("Enter a valid unit cost");
        return;
      }
      body.unit_cost_fcfa = costValue;
    }

    setLoading(true);
    try {
      await clientApi(config.path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (config.clearAfter) {
        setValue("");
        setCost("");
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={config.placeholder}
        className="w-24 rounded-lg border border-slate-300 px-2 py-1"
      />
      {withCost ? (
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={cost}
          onChange={(event) => setCost(event.target.value)}
          placeholder="Unit cost"
          className="w-24 rounded-lg border border-slate-300 px-2 py-1"
        />
      ) : null}
      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {loading ? "…" : config.label}
      </button>
    </div>
  );
}
