"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { CreateMenu } from "@/components/CreateMenu";
import type { SidebarCounts } from "@/lib/sidebar";

type NavItem = {
  href: string;
  labelKey: string;
  soon?: boolean;
  icon: string;
};

const PINNED: NavItem[] = [
  { href: "/dashboard", labelKey: "home", icon: "⌂" },
  { href: "/reports", labelKey: "reports", icon: "▤" },
];

const NAV: NavItem[] = [
  { href: "/bank-and-cash-accounts", labelKey: "bankCash", icon: "◉" },
  { href: "/receipts", labelKey: "receipts", icon: "↓" },
  { href: "/payments", labelKey: "payments", icon: "↑" },
  { href: "/inter-account-transfers", labelKey: "transfers", icon: "⇄" },
  { href: "/customers", labelKey: "customers", icon: "👤" },
  { href: "/sales-invoices", labelKey: "salesInvoices", icon: "📄" },
  { href: "/credit-notes", labelKey: "creditNotes", icon: "↩" },
  { href: "/suppliers", labelKey: "suppliers", icon: "🏭" },
  { href: "/purchase-invoices", labelKey: "purchaseInvoices", icon: "📥" },
  { href: "/debit-notes", labelKey: "debitNotes", icon: "↪" },
  { href: "/goods-receipts", labelKey: "goodsReceipts", icon: "📦" },
  { href: "/inventory-items", labelKey: "inventory", icon: "▦" },
  { href: "/inventory-write-offs", labelKey: "writeOffs", icon: "✕" },
  { href: "/journal", labelKey: "journal", icon: "≡" },
  { href: "/settings", labelKey: "settings", icon: "⚙" },
  { href: "/bank-reconciliations", labelKey: "bankRecon", soon: true, icon: "◎" },
  { href: "/sales-orders", labelKey: "salesOrders", soon: true, icon: "🛒" },
  { href: "/delivery-notes", labelKey: "deliveryNotes", soon: true, icon: "🚚" },
];

function NavLink({
  item,
  label,
  active,
  count,
  onNavigate,
  soonLabel,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  count?: number;
  onNavigate?: () => void;
  soonLabel: string;
}) {
  if (item.soon) {
    return (
      <span className="flex items-center gap-3 px-3 py-2 text-sm text-slate-400">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-base">
          {item.icon}
        </span>
        <span className="truncate">{label}</span>
        <span className="ml-auto text-[10px] uppercase">{soonLabel}</span>
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
      <span className="truncate">{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-500">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export const Sidebar = forwardRef<
  HTMLElement,
  {
    orgName: string;
    counts: SidebarCounts;
    open?: boolean;
    onNavigate?: () => void;
    onClose?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onCreateMenuOpenChange?: (open: boolean) => void;
  }
>(function Sidebar(
  {
    orgName,
    counts,
    open = false,
    onNavigate,
    onClose,
    onMouseEnter,
    onMouseLeave,
    onCreateMenuOpenChange,
  },
  ref,
) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tc = useTranslations("common");

  return (
    <aside
      ref={ref}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,17rem)] flex-col border-r border-[var(--border)] bg-white shadow-xl transition-transform duration-200 ease-out print:hidden md:w-56 lg:w-60 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-start justify-between px-4 py-4 md:hidden">
        <div className="min-w-0">
          <BrandLogo href="/dashboard" />
          <div className="mt-1 truncate text-xs text-[var(--muted)]">{orgName}</div>
        </div>
        <button
          type="button"
          aria-label={t("closeMenu")}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="overflow-visible px-3 pb-2">
        <CreateMenu onNavigate={onNavigate} onOpenChange={onCreateMenuOpenChange} />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("menu")}
        </p>
        {PINNED.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            label={t(item.labelKey)}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
            count={counts[item.href]}
            onNavigate={onNavigate}
            soonLabel={tc("soon")}
          />
        ))}

        <p className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("business")}
        </p>
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            label={t(item.labelKey)}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
            count={counts[item.href]}
            onNavigate={onNavigate}
            soonLabel={tc("soon")}
          />
        ))}
      </nav>

      <form action={logoutAction} className="border-t border-[var(--border)] p-3">
        <button
          type="submit"
          className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
        >
          {t("signOut")}
        </button>
      </form>
    </aside>
  );
});
