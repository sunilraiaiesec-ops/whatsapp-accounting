"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type CreateItem = {
  labelKey: string;
  href?: string;
  soon?: boolean;
};

type CreateSection = {
  titleKey: string;
  items: CreateItem[];
};

const SECTIONS: CreateSection[] = [
  {
    titleKey: "customers",
    items: [
      { labelKey: "salesInvoice", href: "/sales-invoices/new" },
      { labelKey: "receivePayment", href: "/receipts/new" },
      { labelKey: "creditNote", href: "/credit-notes/new" },
      { labelKey: "addCustomer", href: "/customers" },
      { labelKey: "salesOrder", soon: true },
    ],
  },
  {
    titleKey: "suppliers",
    items: [
      { labelKey: "purchaseInvoice", href: "/purchase-invoices/new" },
      { labelKey: "payment", href: "/payments/new" },
      { labelKey: "debitNote", href: "/debit-notes/new" },
      { labelKey: "goodsReceipt", href: "/goods-receipts/new" },
      { labelKey: "addSupplier", href: "/suppliers" },
    ],
  },
  {
    titleKey: "other",
    items: [
      { labelKey: "journalEntry", href: "/journal/new" },
      { labelKey: "transfer", href: "/inter-account-transfers/new" },
      { labelKey: "inventoryItem", href: "/inventory-items" },
      { labelKey: "writeOff", href: "/inventory-write-offs/new" },
      { labelKey: "bankAccount", href: "/bank-and-cash-accounts" },
    ],
  },
];

export function CreateMenu({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("create");
  const tc = useTranslations("common");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
  }

  function handleNavigate() {
    close();
    onNavigate?.();
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={`btn-brand w-full gap-2 ${open ? "ring-2 ring-[var(--brand)]/40" : ""}`}
      >
        <span className="text-lg leading-none">+</span>
        {tc("create")}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label={t("close")}
            className="fixed inset-0 z-[60] bg-slate-900/25 md:left-56 lg:left-60"
            onClick={close}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("title")}
            className="fixed z-[70] flex max-h-[min(34rem,calc(100vh-5rem))] w-[min(100vw-1.5rem,52rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl left-3 right-3 top-[4.5rem] mx-auto md:left-56 md:right-auto md:top-[3.75rem] md:mx-0 lg:left-60"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-slate-50/80 px-6 py-3.5">
              <h2 className="text-base font-semibold text-slate-900">{t("title")}</h2>
              <button
                type="button"
                aria-label={t("close")}
                onClick={close}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto">
              <div className="divide-y divide-[var(--border)] md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
                {SECTIONS.map((section) => (
                  <section key={section.titleKey} className="px-6 py-5 md:py-6">
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">
                      {t(`sections.${section.titleKey}`)}
                    </h3>
                    <ul className="space-y-1">
                      {section.items.map((item) =>
                        item.soon || !item.href ? (
                          <li key={item.labelKey}>
                            <span className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-[15px] leading-snug text-slate-400">
                              <span>{t(`items.${item.labelKey}`)}</span>
                              {item.soon ? (
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide">
                                  {tc("soon")}
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ) : (
                          <li key={item.labelKey}>
                            <Link
                              href={item.href}
                              onClick={handleNavigate}
                              className="block rounded-lg px-2 py-2.5 text-[15px] leading-snug text-slate-700 transition hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]"
                            >
                              {t(`items.${item.labelKey}`)}
                            </Link>
                          </li>
                        ),
                      )}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
