"use client";

import Link from "next/link";
import { forwardRef, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { CreateMenu } from "@/components/CreateMenu";

type NavItem = {
  href: string;
  labelKey: string;
  soon?: boolean;
  icon: string;
};

type NavGroup = {
  key: string;
  labelKey: string;
  items: NavItem[];
};

const PINNED: NavItem[] = [
  { href: "/dashboard", labelKey: "home", icon: "⌂" },
  { href: "/reports", labelKey: "reports", icon: "▤" },
];

// Grouped so the sidebar shows 5 expandable sections instead of ~20 flat
// items. Whichever group contains the active route auto-expands (see
// activeGroupKey below); groups otherwise open/close independently.
const NAV_GROUPS: NavGroup[] = [
  {
    key: "sales",
    labelKey: "groupSales",
    items: [
      { href: "/customers", labelKey: "customers", icon: "👤" },
      { href: "/sales-invoices", labelKey: "salesInvoices", icon: "📄" },
      { href: "/sales-receipts", labelKey: "salesReceipts", icon: "🧾" },
      { href: "/credit-notes", labelKey: "creditNotes", icon: "↩" },
      { href: "/refund-receipts", labelKey: "refundReceipts", icon: "⤺" },
      { href: "/sales-orders", labelKey: "salesOrders", soon: true, icon: "🛒" },
    ],
  },
  {
    key: "purchases",
    labelKey: "groupPurchases",
    items: [
      { href: "/suppliers", labelKey: "suppliers", icon: "🏭" },
      { href: "/purchase-invoices", labelKey: "purchaseInvoices", icon: "📥" },
      { href: "/debit-notes", labelKey: "debitNotes", icon: "↪" },
      { href: "/goods-receipts", labelKey: "goodsReceipts", icon: "📦" },
      { href: "/delivery-notes", labelKey: "deliveryNotes", soon: true, icon: "🚚" },
    ],
  },
  {
    key: "inventoryAssets",
    labelKey: "groupInventoryAssets",
    items: [
      { href: "/inventory-items", labelKey: "inventory", icon: "▦" },
      { href: "/inventory-write-offs", labelKey: "writeOffs", icon: "✕" },
      { href: "/inventory-adjustments", labelKey: "inventoryAdjustments", icon: "⇅" },
      { href: "/fixed-assets", labelKey: "fixedAssets", icon: "🏛" },
    ],
  },
  {
    key: "banking",
    labelKey: "groupBanking",
    items: [
      { href: "/bank-and-cash-accounts", labelKey: "bankCash", icon: "◉" },
      { href: "/receipts", labelKey: "receipts", icon: "↓" },
      { href: "/payments", labelKey: "payments", icon: "↑" },
      { href: "/inter-account-transfers", labelKey: "transfers", icon: "⇄" },
      { href: "/bank-reconciliations", labelKey: "bankRecon", soon: true, icon: "◎" },
    ],
  },
  {
    key: "accounting",
    labelKey: "groupAccounting",
    items: [
      { href: "/journal", labelKey: "journal", icon: "≡" },
      { href: "/settings", labelKey: "settings", icon: "⚙" },
    ],
  },
];

// Line-icon paths + tint for the 5 group headers (20x20 viewBox, same stroke
// style as components/ui/StatCards.tsx) — one distinct color per group,
// approximating the reference mockup's concepts (trend chart / inbox tray /
// package / bank building / ledger) without copying its multi-tone shading.
// Scoped to just these 5 group icons; every other icon in the sidebar
// (individual items, buttons) stays the existing plain monochrome style.
const GROUP_ICON_STYLE: Record<string, { paths: string[]; tone: string }> = {
  sales: {
    paths: ["M4 16v-4M8 16V9M12 16V6", "M3 11l3.5-3.5L9 10l6-6", "M12 4h3v3"],
    tone: "bg-emerald-50 text-emerald-600",
  },
  purchases: {
    paths: [
      "M10 3v8m0 0l-3-3m3 3l3-3",
      "M4 12v3.5a1 1 0 001 1h10a1 1 0 001-1V12",
      "M4 12h4l1 2h2l1-2h4",
    ],
    tone: "bg-blue-50 text-blue-600",
  },
  inventoryAssets: {
    paths: ["M10 3l6 3.2v6.6L10 16l-6-3.2V6.2L10 3zm0 0v13M4 6.3l6 3.2 6-3.2"],
    tone: "bg-violet-50 text-violet-600",
  },
  banking: {
    paths: ["M3 8l7-4.5L17 8", "M3 8h14", "M4.5 8v7M8 8v7M12 8v7M15.5 8v7", "M2.5 17h15"],
    tone: "bg-amber-50 text-amber-600",
  },
  accounting: {
    paths: [
      "M6 3.5h6.2L16 7.3V16a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 014 16V5A1.5 1.5 0 015.5 3.5H6zm6 0V7h3.5",
      "M7 10h6M7 12.5h6",
    ],
    tone: "bg-teal-50 text-teal-600",
  },
};

function GroupIcon({ groupKey }: { groupKey: string }) {
  return (
    <svg
      className="h-[18px] w-[18px]"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {GROUP_ICON_STYLE[groupKey].paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  item,
  label,
  active,
  onNavigate,
  soonLabel,
}: {
  item: NavItem;
  label: string;
  active: boolean;
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
    </Link>
  );
}

function GroupHeader({
  groupKey,
  label,
  isOpen,
  onToggle,
}: {
  groupKey: string;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${GROUP_ICON_STYLE[groupKey].tone}`}
      >
        <GroupIcon groupKey={groupKey} />
      </span>
      <span className="truncate">{label}</span>
      <svg
        className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M7.21 14.77a.75.75 0 01.02-1.06L10.94 10 7.23 6.29a.75.75 0 111.06-1.06l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.08-.02z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

export const Sidebar = forwardRef<
  HTMLElement,
  {
    orgName: string;
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

  const activeGroupKey = useMemo(
    () =>
      NAV_GROUPS.find((group) => group.items.some((item) => isItemActive(pathname, item.href)))
        ?.key,
    [pathname],
  );

  // Groups open/close independently; the group containing the current page
  // always auto-expands (without collapsing whichever others the user
  // already opened) so navigating never hides the page you're on. Expanding
  // it on a route change is handled by adjusting state during render (React's
  // recommended alternative to an effect for this — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than a useEffect, which would trigger an extra render pass.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroupKey ? [activeGroupKey] : []),
  );
  const [trackedActiveGroupKey, setTrackedActiveGroupKey] = useState(activeGroupKey);

  if (activeGroupKey !== trackedActiveGroupKey) {
    setTrackedActiveGroupKey(activeGroupKey);
    if (activeGroupKey && !openGroups.has(activeGroupKey)) {
      setOpenGroups(new Set(openGroups).add(activeGroupKey));
    }
  }

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
            active={isItemActive(pathname, item.href)}
            onNavigate={onNavigate}
            soonLabel={tc("soon")}
          />
        ))}

        <p className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("business")}
        </p>
        {NAV_GROUPS.map((group) => {
          const isOpen = openGroups.has(group.key);
          return (
            <div key={group.key}>
              <GroupHeader
                groupKey={group.key}
                label={t(group.labelKey)}
                isOpen={isOpen}
                onToggle={() => toggleGroup(group.key)}
              />
              {isOpen ? (
                <div className="ml-4 space-y-1 border-l border-slate-100 pl-2">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      label={t(item.labelKey)}
                      active={isItemActive(pathname, item.href)}
                      onNavigate={onNavigate}
                      soonLabel={tc("soon")}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
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
