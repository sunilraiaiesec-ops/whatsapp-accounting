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
    titleKey: "accounting",
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
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
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
        <span className="text-lg leading-none">{open ? "×" : "+"}</span>
        {tc("create")}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label={t("close")}
            className="fixed inset-0 z-[60] bg-slate-900/30 md:left-56 lg:left-60"
            onClick={close}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("title")}
            className="fixed left-0 top-0 z-[70] flex h-full w-full flex-col overflow-hidden border-r border-[var(--border)] bg-white shadow-2xl md:left-56 md:max-w-3xl lg:left-60"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
              <button
                type="button"
                aria-label={t("close")}
                onClick={close}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {SECTIONS.map((section) => (
                  <section key={section.titleKey}>
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t(`sections.${section.titleKey}`)}
                    </h3>
                    <ul className="space-y-0.5">
                      {section.items.map((item) =>
                        item.soon || !item.href ? (
                          <li key={item.labelKey}>
                            <span className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-slate-400">
                              {t(`items.${item.labelKey}`)}
                              {item.soon ? (
                                <span className="text-[10px] font-semibold uppercase">
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
                              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]"
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
