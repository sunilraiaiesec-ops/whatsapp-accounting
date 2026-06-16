"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientApi } from "@/lib/client-api";

export function ProductPriceEditor({
  productId,
  initialPrice,
}: {
  productId: number;
  initialPrice: number | null;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(
    initialPrice != null ? String(initialPrice) : "",
  );
  const [loading, setLoading] = useState(false);

  async function savePrice() {
    const value = Number(price);
    if (Number.isNaN(value) || value < 0) {
      alert("Enter a valid price");
      return;
    }

    setLoading(true);
    try {
      await clientApi(`products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify({ default_unit_price_fcfa: value }),
      });
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
        min="0"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        className="w-28 rounded-lg border border-slate-300 px-2 py-1"
      />
      <button
        type="button"
        onClick={savePrice}
        disabled={loading}
        className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {loading ? "…" : "Save"}
      </button>
    </div>
  );
}
