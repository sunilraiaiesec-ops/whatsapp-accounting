"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/BrandLogo";
import { logoutAction } from "@/app/actions/auth";
import type { SidebarCounts } from "@/lib/sidebar";

type NavItem = { href: string; label: string; soon?: boolean; icon: string };

const PINNED: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/reports", label: "Reports", icon: "▤" },
];

const NAV: NavItem[] = [
  { href: "/bank-and-cash-accounts", label: "Bank & Cash", icon: "◉" },
  { href: "/receipts", label: "Receipts", icon: "↓" },
  { href: "/payments", label: "Payments", icon: "↑" },
  { href: "/inter-account-transfers", label: "Transfers", icon: "⇄" },
  { href: "/customers", label: "Customers", icon: "👤" },
  { href: "/sales-invoices", label: "Sales Invoices", icon: "📄" },
  { href: "/credit-notes", label: "Credit Notes", icon: "↩" },
  { href: "/suppliers", label: "Suppliers", icon: "🏭" },
  { href: "/purchase-invoices", label: "Purchase Invoices", icon: "📥" },
  { href: "/debit-notes", label: "Debit Notes", icon: "↪" },
  { href: "/goods-receipts", label: "Goods Receipts", icon: "📦" },
  { href: "/inventory-items", label: "Inventory", icon: "▦" },
  { href: "/inventory-write-offs", label: "Write-offs", icon: "✕" },
  { href: "/journal", label: "Journal", icon: "≡" },
  { href: "/settings", label: "Settings", icon: "⚙" },
  { href: "/bank-reconciliations", label: "Bank Recon", soon: true, icon: "◎" },
  { href: "/sales-orders", label: "Sales Orders", soon: true, icon: "🛒" },
  { href: "/delivery-notes", label: "Delivery Notes", soon: true, icon: "🚚" },
];

function NavLink({
  item,
  active,
  count,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
  onNavigate?: () => void;
}) {
  if (item.soon) {
    return (
      <span className="flex items-center gap-3 px-3 py-2 text-sm text-slate-400">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-base">
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
        <span className="ml-auto text-[10px] uppercase">soon</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
        active
          ? "bg-[var(--brand)]/10 font-semibold text-[var(--brand)]"
          : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${
          active ? "bg-[var(--brand)]/15" : "bg-slate-50"
        }`}
      >
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-500">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({
  orgName,
  counts,
  open = false,
  onNavigate,
  onClose,
}: {
  orgName: string;
  counts: SidebarCounts;
  open?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,17rem)] flex-col border-r border-[var(--border)] bg-white shadow-xl transition-transform duration-200 ease-out print:hidden md:static md:z-auto md:w-56 md:shrink-0 md:shadow-none lg:w-60 ${
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
    >
      <div className="flex items-start justify-between px-4 py-4 md:hidden">
        <div className="min-w-0">
          <BrandLogo href="/dashboard" />
          <div className="mt-1 truncate text-xs text-[var(--muted)]">{orgName}</div>
        </div>
        <button
          type="button"
          aria-label="Close menu"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="px-3 pb-2">
        <Link
          href="/receipts/new"
          onClick={onNavigate}
          className="btn-brand w-full gap-2"
        >
          <span className="text-lg leading-none">+</span>
          Create
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Menu
        </p>
        {PINNED.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={
              pathname === item.href || pathname.startsWith(item.href + "/")
            }
            count={counts[item.href]}
            onNavigate={onNavigate}
          />
        ))}

        <p className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Business
        </p>
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={
              pathname === item.href || pathname.startsWith(item.href + "/")
            }
            count={counts[item.href]}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <form action={logoutAction} className="border-t border-[var(--border)] p-3">
        <button
          type="submit"
          className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
