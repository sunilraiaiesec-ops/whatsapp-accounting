"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import type { SidebarCounts } from "@/lib/sidebar";

type NavItem = { href: string; label: string; soon?: boolean };

// Order mirrors manager.io's sidebar.
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
}: {
  orgName: string;
  counts: SidebarCounts;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white print:hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Bantoo Books
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
          {orgName}
        </div>
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
                  className={`flex items-center justify-between gap-2 px-5 py-1.5 text-sm ${
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
          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-100"
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
