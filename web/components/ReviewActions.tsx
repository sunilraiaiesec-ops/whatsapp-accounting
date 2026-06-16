"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clientApi } from "@/lib/client-api";

export function ReviewActions({
  kind,
  id,
}: {
  kind: "transactions" | "deliveries";
  id: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(action: "confirm" | "reject") {
    setLoading(action);
    try {
      await clientApi(`review/${kind}/${id}/${action}`, { method: "PATCH" });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => handleAction("confirm")}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {loading === "confirm" ? "…" : "Confirm"}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => handleAction("reject")}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {loading === "reject" ? "…" : "Reject"}
      </button>
    </div>
  );
}
