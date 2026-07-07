"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { getSupplierContactAction } from "@/app/actions/reorder";
import { searchBantooEntities } from "@/app/actions/bantoo";
import { BantooCombobox } from "@/components/BantooCombobox";
import type { BantooOption } from "@/lib/bantoo/types";
import { buildSupplierQuoteMessage, buildWhatsAppLink } from "@/lib/reorder-message";
import { resolveContactWhatsAppNumber } from "@/lib/phone";

export type LowStockSupplierVM = {
  source: "preferred" | "recent" | "frequent" | "none";
  partyId: string | null;
  partyName: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export type LowStockItemVM = {
  id: string;
  code: string;
  name: string;
  unit: string;
  qtyOnHand: string;
  reorderLevel: string;
  suggestedReorderQty: string;
  supplier: LowStockSupplierVM;
  lastPurchase: { priceFormatted: string; date: string; partyName: string } | null;
};

async function searchSuppliers(query: string): Promise<BantooOption[]> {
  const { candidates } = await searchBantooEntities("supplier", query);
  return candidates;
}

export function LowStockReorderList({ items }: { items: LowStockItemVM[] }) {
  const t = useTranslations("reorder");
  if (items.length === 0) return null;

  return (
    <div id="low-stock" className="scroll-mt-20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t("sectionTitle")}</h2>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          {t("itemCount", { count: items.length })}
        </span>
      </div>
      <p className="mb-4 text-sm text-[var(--muted)]">{t("sectionSubtitle")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <LowStockCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

const SUPPLIER_SOURCE_LABEL: Record<LowStockSupplierVM["source"], string> = {
  preferred: "supplierSourcePreferred",
  recent: "supplierSourceRecent",
  frequent: "supplierSourceFrequent",
  none: "supplierSourceNone",
};

function LowStockCard({ item }: { item: LowStockItemVM }) {
  const t = useTranslations("reorder");
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{item.name}</p>
          <p className="text-xs text-slate-400">{item.code}</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
          {t("lowStockBadge")}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-[var(--muted)]">{t("currentStock")}</dt>
          <dd className="font-semibold text-slate-900">
            {item.qtyOnHand} {item.unit}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">{t("reorderLevel")}</dt>
          <dd className="font-semibold text-slate-900">
            {item.reorderLevel} {item.unit}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">{t("suggestedQty")}</dt>
          <dd className="font-semibold text-[var(--brand)]">
            {item.suggestedReorderQty} {item.unit}
          </dd>
        </div>
      </dl>

      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
        <p className="text-slate-700">
          <span className="text-[var(--muted)]">{t("supplierLabel")}: </span>
          <span className="font-medium">{item.supplier.partyName ?? t("noSupplierSuggested")}</span>
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{t(SUPPLIER_SOURCE_LABEL[item.supplier.source])}</p>
        {item.lastPurchase ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t("lastPurchase", {
              price: item.lastPurchase.priceFormatted,
              date: item.lastPurchase.date,
              supplier: item.lastPurchase.partyName,
            })}
          </p>
        ) : null}
      </div>

      <button type="button" onClick={() => setModalOpen(true)} className="btn-brand mt-4 w-full text-sm">
        {t("requestQuote")}
      </button>

      {modalOpen ? <QuoteRequestModal item={item} onClose={() => setModalOpen(false)} /> : null}
    </div>
  );
}

function QuoteRequestModal({ item, onClose }: { item: LowStockItemVM; onClose: () => void }) {
  const t = useTranslations("reorder");
  const tc = useTranslations("command");
  const titleId = useId();

  const [supplierId, setSupplierId] = useState<string | null>(item.supplier.partyId);
  const [supplierText, setSupplierText] = useState(item.supplier.partyName ?? "");
  const [supplierPhone, setSupplierPhone] = useState<string | null>(item.supplier.phone);
  const [supplierWhatsapp, setSupplierWhatsapp] = useState<string | null>(item.supplier.whatsapp);
  const [loadingContact, setLoadingContact] = useState(false);

  const [quantity, setQuantity] = useState(item.suggestedReorderQty);
  const [unit, setUnit] = useState(item.unit || "");

  const initialMessage = buildSupplierQuoteMessage({
    supplierName: supplierText,
    quantity,
    unit,
    productName: item.name,
  });
  const [message, setMessage] = useState(initialMessage);
  const [messageTouched, setMessageTouched] = useState(false);

  function regenerateMessage(next: { supplierName?: string; quantity?: string; unit?: string }) {
    if (messageTouched) return;
    setMessage(
      buildSupplierQuoteMessage({
        supplierName: next.supplierName ?? supplierText,
        quantity: next.quantity ?? quantity,
        unit: next.unit ?? unit,
        productName: item.name,
      }),
    );
  }

  async function handleSelectSupplier(option: BantooOption) {
    setSupplierId(option.id);
    setSupplierText(option.label);
    setLoadingContact(true);
    try {
      const contact = await getSupplierContactAction(option.id);
      setSupplierPhone(contact?.phone ?? null);
      setSupplierWhatsapp(contact?.whatsapp ?? null);
    } finally {
      setLoadingContact(false);
    }
    regenerateMessage({ supplierName: option.label });
  }

  const phoneDigits = resolveContactWhatsAppNumber({ phone: supplierPhone, whatsapp: supplierWhatsapp });
  const canOpenWhatsApp = Boolean(supplierId && phoneDigits && message.trim());

  function openWhatsApp() {
    if (!phoneDigits) return;
    const url = buildWhatsAppLink(phoneDigits, message);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 max-md:items-end max-md:p-0" role="presentation">
      <button type="button" aria-label={t("close")} onClick={onClose} className="absolute inset-0 bg-slate-900/50" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(90dvh,44rem)] w-[min(100vw-1.5rem,32rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl max-md:max-h-[100dvh] max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
      >
        <div className="shrink-0 border-b border-[var(--border)] px-5 py-4 max-md:px-4 max-md:py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">
                {t("modalTitle")}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--muted)]">{item.name}</p>
            </div>
            <button
              type="button"
              aria-label={t("close")}
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 max-md:px-4">
          <BantooCombobox
            label={t("supplierField")}
            text={supplierText}
            selectedId={supplierId}
            options={
              item.supplier.partyId
                ? [{ id: item.supplier.partyId, label: item.supplier.partyName ?? "" }]
                : []
            }
            onSearch={searchSuppliers}
            onSelectExisting={handleSelectSupplier}
            onTextChange={(v) => {
              setSupplierText(v);
              setSupplierId(null);
              setSupplierPhone(null);
              setSupplierWhatsapp(null);
            }}
            allowCreate={false}
            placeholder={t("supplierPlaceholder")}
          />
          {loadingContact ? <p className="text-xs text-[var(--muted)]">{tc("searching")}</p> : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{tc("quantity")}</span>
              <input
                type="text"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  regenerateMessage({ quantity: e.target.value });
                }}
                className="input-modern mt-1 text-base md:text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t("unitField")}</span>
              <input
                type="text"
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  regenerateMessage({ unit: e.target.value });
                }}
                className="input-modern mt-1 text-base md:text-sm"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t("messageField")}</span>
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setMessageTouched(true);
              }}
              rows={9}
              className="input-modern mt-1 text-base md:text-sm"
            />
            <span className="mt-1 block text-xs text-[var(--muted)]">{t("messageHint")}</span>
          </label>

          {!supplierId ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("chooseSupplier")}</p>
          ) : !phoneDigits ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("missingPhone")}{" "}
              <Link href={`/suppliers/${supplierId}`} className="font-semibold underline" onClick={onClose}>
                {t("missingPhoneLink")}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--border)] px-5 py-4 max-md:px-4">
          <button type="button" onClick={openWhatsApp} disabled={!canOpenWhatsApp} className="btn-brand w-full text-sm disabled:opacity-40">
            {t("openWhatsApp")}
          </button>
        </div>
      </div>
    </div>
  );
}
