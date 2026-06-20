import Link from "next/link";

export function ReportBackLink() {
  return (
    <Link
      href="/reports"
      className="text-sm font-medium text-[var(--brand)] hover:underline"
    >
      ← Reports
    </Link>
  );
}
