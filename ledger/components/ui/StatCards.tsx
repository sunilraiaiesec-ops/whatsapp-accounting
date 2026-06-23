import type { ReactNode } from "react";

type Tone = "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";

const TONES: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
};

export type IconName =
  | "count"
  | "sum"
  | "avg"
  | "calendar"
  | "in"
  | "out"
  | "transfer"
  | "users"
  | "box"
  | "wallet"
  | "doc";

const ICONS: Record<IconName, { d: string }> = {
  count: { d: "M4 5.5A1.5 1.5 0 015.5 4h9A1.5 1.5 0 0116 5.5v11l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L4 16.5v-11z" },
  sum: { d: "M3 14l4-4 3 3 7-7v4M17 6h-4" },
  avg: { d: "M6 3.5h6.2L16 7.3V16a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 014 16V5A1.5 1.5 0 015.5 3.5H6zm6 0V7h3.5M7 11h6M7 13.5h6" },
  calendar: { d: "M6 3v2m8-2v2M4.5 6.5h11A1.5 1.5 0 0117 8v7.5A1.5 1.5 0 0115.5 17h-11A1.5 1.5 0 013 15.5V8a1.5 1.5 0 011.5-1.5z" },
  in: { d: "M10 4v9m0 0l-3.5-3.5M10 13l3.5-3.5M4 16.5h12" },
  out: { d: "M10 16V7m0 0L6.5 10.5M10 7l3.5 3.5M4 3.5h12" },
  transfer: { d: "M5 7h10l-2.5-2.5M15 13H5l2.5 2.5" },
  users: { d: "M7 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm6 0a2 2 0 100-4 2 2 0 000 4zM3 16c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M13 12.6c1.8.1 3 1.2 3 3.4" },
  box: { d: "M10 3l6 3.2v6.6L10 16l-6-3.2V6.2L10 3zm0 0v13M4 6.3l6 3.2 6-3.2" },
  wallet: { d: "M3.5 6.5h11A1.5 1.5 0 0116 8v6a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 013 14V6.5zm0 0V5.5A1.5 1.5 0 015 4h8M13 11h1.5" },
  doc: { d: "M6 3.5h6.2L16 7.3V16a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 014 16V5A1.5 1.5 0 015.5 3.5H6zm6 0V7h3.5" },
};

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function StatCard({
  icon,
  tone = "emerald",
  label,
  value,
  unit,
  sub,
}: {
  icon: IconName;
  tone?: Tone;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="card-surface flex items-start gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <svg
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={ICONS[icon].d} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
        <p className="mt-1 truncate text-xl font-bold tracking-tight text-slate-900">
          {value}
          {unit ? <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span> : null}
        </p>
        {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
      </div>
    </div>
  );
}
