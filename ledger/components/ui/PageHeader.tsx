import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  actionHref,
  actionLabel,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mb-6">
      {backHref ? (
        <Link
          href={backHref}
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          ← {backLabel ?? "Back"}
        </Link>
      ) : null}
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
          ) : null}
        </div>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="btn-brand shrink-0">
            + {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export { StatusBadge } from "@/components/ui/StatusBadge";
