"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import type { SidebarCounts } from "@/lib/sidebar";

type NavItem = { href: string; label: string; soon?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Summary" },
  { href: "/bank-and-cash-accounts", label: "Bank and Cash Accounts" },
  { href: "/receipts", label: "Receipts" },
  { href: "/payments", label: "Payments" },
  { href: "/inter-account-transfers", label: "Inter Account Transfers" },
  { href: "/bank-reconciliations", label: "Bank Reconciliations", soon: true },
  { href: "/customers", label: "Customers" },
  { href: "/sales-orders", label: "Sales Orders", soon: true },
  { href: "/sales-invoices", label: "Sales Invoices" },
  { href: "/credit-notes", label: "Credit Notes" },
  { href: "/delivery-notes", label: "Delivery Notes", soon: true },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/purchase-invoices", label: "Purchase Invoices" },
  { href: "/debit-notes", label: "Debit Notes" },
  { href: "/goods-receipts", label: "Goods Receipts" },
  { href: "/inventory-items", label: "Inventory Items" },
  { href: "/inventory-transfers", label: "Inventory Transfers", soon: true },
  { href: "/inventory-write-offs", label: "Inventory Write-offs" },
  { href: "/fixed-assets", label: "Fixed Assets", soon: true },
  { href: "/special-accounts", label: "Special Accounts", soon: true },
  { href: "/journal", label: "Journal Entries" },
  { href: "/folders", label: "Folders", soon: true },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

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
      className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,18rem)] flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 ease-out print:hidden md:static md:z-auto md:w-64 md:shrink-0 md:shadow-none ${
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
    >
      <div className="flex items-start justify-between border-b border-slate-200 px-4 py-4 md:px-5">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Bantoo Books
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
            {orgName}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close menu"
          className="ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
          onClick={onClose}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <ul>
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const count = counts[item.href];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm md:px-5 md:py-1.5 ${
                    active
                      ? "bg-slate-100 font-medium text-slate-900"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">
                    {item.label}
                    {item.soon ? (
                      <span className="ml-1 align-middle text-[10px] uppercase tracking-wide text-slate-300">
                        soon
                      </span>
                    ) : null}
                  </span>
                  {typeof count === "number" ? (
                    <span className="shrink-0 tabular-nums text-xs text-slate-400">
                      {count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form action={logoutAction} className="border-t border-slate-200 p-3">
        <button
          type="submit"
          className="w-full rounded-md px-2 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-100 md:py-1.5"
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
