"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import {
  createExpenseCategory,
  executeCommand,
  interpretCommand,
  type CommandProposalDto,
  type ExecuteCommandInput,
} from "@/app/actions/command";
import { humanizeDescription } from "@/lib/command-parse";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onEnd: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  start: () => void;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const NEW_CATEGORY_VALUE = "__new_category__";

const inputClass =
  "input-modern text-base md:text-sm";

function OpenButton({
  onClick,
  className,
  showLabel = true,
}: {
  onClick: () => void;
  className?: string;
  showLabel?: boolean;
}) {
  const t = useTranslations("command");
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[var(--brand)]/40 hover:text-[var(--brand)] md:px-4"
      }
    >
      <span aria-hidden className="text-base">
        ✨
      </span>
      {showLabel ? <span className="hidden sm:inline">{t("open")}</span> : null}
    </button>
  );
}

export function BantooCommand() {
  const t = useTranslations("command");
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CommandProposalDto | null>(null);
  const [listening, setListening] = useState(false);
  const [success, setSuccess] = useState<{ href: string; number: string; kind: string } | null>(
    null,
  );

  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyName, setPartyName] = useState("");
  const [createParty, setCreateParty] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  const [lineAccountId, setLineAccountId] = useState("");
  const [lineAccountOptions, setLineAccountOptions] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [expenseDescription, setExpenseDescription] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [itemOptions, setItemOptions] = useState<{ id: string; label: string }[]>([]);

  const isInventory = proposal?.category === "inventory";

  const openDialog = useCallback(() => {
    setOpen(true);
    setError(null);
    setProposal(null);
    setSuccess(null);
    setPrompt("");
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setListening(false);
    setProposal(null);
    setError(null);
    setSuccess(null);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeDialog]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openDialog();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openDialog]);

  function applyProposal(p: CommandProposalDto) {
    setProposal(p);
    setPartyId(p.partyId);
    setPartyName(p.partyName);
    setCreateParty(p.createParty);
    setBankAccountId(p.bankAccountId);
    setLineAccountId(p.lineAccountId);
    setLineAccountOptions(p.lineAccountAlternatives);
    setExpenseDescription(p.expenseDescription);
    setNewCategoryName(p.suggestedCategoryName);
    setShowNewCategory(false);
    setDate(p.date);
    setQuantity(p.quantity);
    setUnitCost(p.unitCost);
    setItemId(p.itemId);
    setItemOptions(p.itemAlternatives);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSuggest(event?: React.FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text) return;

    setLoading(true);
    setError(null);
    setProposal(null);
    setSuccess(null);

    const result = await interpretCommand(text);
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    applyProposal(result.proposal);
  }

  function startVoice() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError(t("voiceUnsupported"));
      return;
    }

    const recognition = new Ctor();
    recognition.lang = document.documentElement.lang === "fr" ? "fr-FR" : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onEnd = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setPrompt(transcript);
    };

    recognition.start();
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;

    setCreatingCategory(true);
    setError(null);
    const result = await createExpenseCategory(name);
    setCreatingCategory(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setLineAccountOptions((prev) => {
      if (prev.some((a) => a.id === result.id)) return prev;
      return [...prev, result];
    });
    setLineAccountId(result.id);
    setShowNewCategory(false);
  }

  async function handleConfirm() {
    if (!proposal) return;

    setExecuting(true);
    setError(null);

    const input: ExecuteCommandInput = {
      intent: proposal.intent as ExecuteCommandInput["intent"],
      amount: proposal.amount,
      quantity,
      unitCost,
      itemId,
      partyId: partyId || null,
      partyName,
      createParty: createParty && !partyId,
      partyType: proposal.partyType,
      bankAccountId,
      lineAccountId,
      date,
      description:
        proposal.category === "inventory"
          ? proposal.description
          : expenseDescription || proposal.description,
    };

    const result = await executeCommand(input);
    setExecuting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess({
      href: result.href,
      number: result.number,
      kind: proposal.intent,
    });
  }

  function handlePartySelect(id: string) {
    setPartyId(id || null);
    const match = proposal?.partyAlternatives.find((p) => p.id === id);
    if (match) {
      setPartyName(match.name);
      setCreateParty(false);
    }
  }

  const showConfirmFooter = Boolean(proposal && !success);
  const showSuggestFooter = Boolean(!proposal && !success);

  const modal = open ? (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 max-md:items-end max-md:p-0"
      role="presentation"
    >
      <button
        type="button"
        aria-label={t("close")}
        onClick={closeDialog}
        className="absolute inset-0 bg-slate-900/50"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bantoo-command-title"
        className="relative flex max-h-[min(90dvh,40rem)] w-[min(100vw-1.5rem,32rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl max-md:max-h-[100dvh] max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
      >
        <div className="shrink-0 border-b border-[var(--border)] px-5 py-4 max-md:px-4 max-md:py-3 max-md:pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <h2 id="bantoo-command-title" className="text-lg font-semibold text-slate-900">
                {t("title")}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--muted)]">{t("subtitle")}</p>
            </div>
            <button
              type="button"
              aria-label={t("close")}
              onClick={closeDialog}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4 max-md:px-4"
        >
          {success ? (
            <div className="rounded-xl border border-[var(--brand)]/20 bg-[var(--brand)]/5 p-4">
              <p className="font-medium text-slate-900">
                {success.kind === "create_goods_receipt"
                  ? t("successGoodsReceipt", { number: success.number })
                  : success.kind === "create_receipt"
                    ? t("successReceipt", { number: success.number })
                    : t("successPayment", { number: success.number })}
              </p>
              <button
                type="button"
                onClick={() => {
                  router.push(success.href);
                  closeDialog();
                }}
                className="btn-brand mt-3 w-full"
              >
                {t("viewDocument")}
              </button>
            </div>
          ) : proposal ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("suggestedAction")}
                </p>
                <p className="mt-1 text-base font-semibold text-slate-900">{proposal.summary}</p>
                {proposal.warnings.map((warning) => (
                  <p key={warning} className="mt-2 text-sm text-amber-700">
                    {warning}
                  </p>
                ))}
              </div>

              {isInventory ? (
                <>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">{t("quantity")}</span>
                    <input
                      type="text"
                      readOnly
                      value={proposal.quantityDisplay}
                      className={`${inputClass} mt-1 bg-slate-50`}
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">{t("inventoryItem")}</span>
                    <select
                      value={itemId ?? ""}
                      onChange={(e) => setItemId(e.target.value || null)}
                      className={`${inputClass} mt-1`}
                    >
                      <option value="">— {proposal.itemName || "…"} —</option>
                      {itemOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">{t("unitCost")}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      placeholder={t("unitCostPlaceholder")}
                      className={`${inputClass} mt-1`}
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">{t("supplier")}</span>
                    {proposal.partyAlternatives.length > 0 ? (
                      <select
                        value={partyId ?? ""}
                        onChange={(e) => handlePartySelect(e.target.value)}
                        className={`${inputClass} mt-1`}
                      >
                        <option value="">— {partyName || "…"} —</option>
                        {proposal.partyAlternatives.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={partyName}
                        onChange={(e) => setPartyName(e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    )}
                  </label>

                  {!partyId && partyName ? (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={createParty}
                        onChange={(e) => setCreateParty(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      {t("createSupplier")}
                    </label>
                  ) : null}

                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">{t("date")}</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                </>
              ) : (
                <>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{t("amount")}</span>
                <input
                  type="text"
                  readOnly
                  value={proposal.amountDisplay}
                  className={`${inputClass} mt-1 bg-slate-50`}
                />
              </label>

              {(proposal.category === "expense" || proposal.category === "sales") && (
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("expenseDescription")}</span>
                  <input
                    type="text"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(humanizeDescription(e.target.value))}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              )}

              <div className="block text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">
                    {proposal.category === "expense"
                      ? t("expenseAccount")
                      : proposal.category === "sales"
                        ? t("incomeAccount")
                        : proposal.intent === "create_receipt"
                          ? t("incomeAccount")
                          : t("expenseAccount")}
                  </span>
                  {proposal.canAddExpenseCategory ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCategory(true);
                        if (!newCategoryName && expenseDescription) {
                          setNewCategoryName(expenseDescription);
                        }
                      }}
                      className="shrink-0 text-xs font-semibold text-[var(--brand)] hover:underline"
                    >
                      + {t("addCategoryShort")}
                    </button>
                  ) : null}
                </div>
                <select
                  value={showNewCategory ? NEW_CATEGORY_VALUE : lineAccountId}
                  onChange={(e) => {
                    if (e.target.value === NEW_CATEGORY_VALUE) {
                      setShowNewCategory(true);
                      if (!newCategoryName && expenseDescription) {
                        setNewCategoryName(expenseDescription);
                      }
                      return;
                    }
                    setShowNewCategory(false);
                    setLineAccountId(e.target.value);
                  }}
                  className={`${inputClass} mt-1`}
                >
                  {lineAccountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                  {proposal.canAddExpenseCategory ? (
                    <option value={NEW_CATEGORY_VALUE}>➕ {t("addCategoryOption")}</option>
                  ) : null}
                </select>
              </div>

              {proposal.canAddExpenseCategory && showNewCategory ? (
                <div className="rounded-xl border-2 border-[var(--brand)]/30 bg-[var(--brand)]/5 p-3">
                  <p className="text-sm font-semibold text-slate-900">{t("addCategory")}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{t("addCategoryHint")}</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder={t("categoryNamePlaceholder")}
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      disabled={creatingCategory || !newCategoryName.trim()}
                      className="btn-brand shrink-0 px-4"
                    >
                      {creatingCategory ? "…" : t("addCategorySave")}
                    </button>
                  </div>
                </div>
              ) : null}

              {!isInventory && !proposal.partyOptional ? (
                <>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">{t("party")}</span>
                    {proposal.partyAlternatives.length > 0 ? (
                      <select
                        value={partyId ?? ""}
                        onChange={(e) => handlePartySelect(e.target.value)}
                        className={`${inputClass} mt-1`}
                      >
                        <option value="">— {partyName || "…"} —</option>
                        {proposal.partyAlternatives.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={partyName}
                        onChange={(e) => setPartyName(e.target.value)}
                        className={`${inputClass} mt-1`}
                      />
                    )}
                  </label>

                  {!partyId && partyName ? (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={createParty}
                        onChange={(e) => setCreateParty(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      {t("createParty")}
                    </label>
                  ) : null}
                </>
              ) : null}

              {!isInventory ? (
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{t("bankAccount")}</span>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className={`${inputClass} mt-1`}
                >
                  {proposal.bankAlternatives.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              ) : null}

              <label className="block text-sm">
                <span className="font-medium text-slate-700">{t("date")}</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t("placeholder")}
                  rows={4}
                  enterKeyHint="go"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSuggest();
                    }
                  }}
                  className={`${inputClass} min-h-[7rem] resize-none pr-12`}
                  autoFocus
                />
                <button
                  type="button"
                  title={t("voice")}
                  onClick={startVoice}
                  className={`absolute right-2 bottom-2 inline-flex h-10 w-10 items-center justify-center rounded-full transition ${
                    listening
                      ? "bg-red-100 text-red-600"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  🎤
                </button>
              </div>
              {listening ? (
                <p className="text-sm text-[var(--brand)]">{t("listening")}</p>
              ) : null}
              <p className="text-xs text-[var(--muted)]">{t("examples")}</p>
              <button
                type="button"
                disabled={loading || !prompt.trim()}
                onClick={() => void handleSuggest()}
                className="btn-brand mt-4 hidden w-full md:inline-flex"
              >
                {loading ? "…" : t("submit")}
              </button>
            </div>
          )}

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
        </div>

        {showSuggestFooter ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="flex-1 rounded-full border border-[var(--border)] px-4 py-3 text-sm font-medium text-slate-700"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={loading || !prompt.trim()}
                onClick={() => void handleSuggest()}
                className="btn-brand flex-1 py-3.5 text-base"
              >
                {loading ? "…" : t("submit")}
              </button>
            </div>
          </div>
        ) : null}

        {showConfirmFooter ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5 md:py-4 md:pb-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setProposal(null);
                  setError(null);
                }}
                className="flex-1 rounded-full border border-[var(--border)] px-4 py-3 text-sm font-medium text-slate-700"
              >
                {proposal ? t("back") : t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={executing}
                className="btn-brand flex-1 py-3"
              >
                {executing ? t("confirming") : t("confirm")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      <OpenButton onClick={openDialog} />

      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
