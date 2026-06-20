"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  executeCommand,
  interpretCommand,
  type CommandProposalDto,
  type ExecuteCommandInput,
} from "@/app/actions/command";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
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

export function BantooCommand() {
  const t = useTranslations("command");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
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
  const [expenseDescription, setExpenseDescription] = useState("");
  const [date, setDate] = useState("");

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
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

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
    setExpenseDescription(p.expenseDescription);
    setDate(p.date);
  }

  async function handleSuggest(event: React.FormEvent) {
    event.preventDefault();
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
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setPrompt(transcript);
    };

    recognition.start();
  }

  async function handleConfirm() {
    if (!proposal) return;

    setExecuting(true);
    setError(null);

    const input: ExecuteCommandInput = {
      intent: proposal.intent as "create_receipt" | "create_payment",
      amount: proposal.amount,
      partyId: partyId || null,
      partyName,
      createParty: createParty && !partyId,
      partyType: proposal.partyType,
      bankAccountId,
      lineAccountId,
      date,
      description: expenseDescription || proposal.description,
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

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[var(--brand)]/40 hover:text-[var(--brand)] md:px-4"
      >
        <span aria-hidden className="text-base">
          ✨
        </span>
        <span className="hidden sm:inline">{t("open")}</span>
      </button>

      <dialog
        ref={dialogRef}
        onClose={closeDialog}
        className="fixed top-1/2 left-1/2 z-[200] m-0 w-[min(100vw-1.5rem,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 open:flex open:flex-col"
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {success ? (
            <div className="rounded-xl border border-[var(--brand)]/20 bg-[var(--brand)]/5 p-4">
              <p className="font-medium text-slate-900">
                {success.kind === "create_receipt"
                  ? t("successReceipt", { number: success.number })
                  : t("successPayment", { number: success.number })}
              </p>
              <button
                type="button"
                onClick={() => {
                  router.push(success.href);
                  closeDialog();
                }}
                className="btn-brand mt-3"
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

              <label className="block text-sm">
                <span className="font-medium text-slate-700">{t("amount")}</span>
                <input
                  type="text"
                  readOnly
                  value={proposal.amountDisplay}
                  className="input-modern mt-1 bg-slate-50"
                />
              </label>

              {(proposal.category === "expense" || proposal.category === "sales") && (
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{t("expenseDescription")}</span>
                  <input
                    type="text"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    className="input-modern mt-1"
                  />
                </label>
              )}

              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  {proposal.category === "expense"
                    ? t("expenseAccount")
                    : proposal.category === "sales"
                      ? t("incomeAccount")
                      : proposal.intent === "create_receipt"
                        ? t("incomeAccount")
                        : t("expenseAccount")}
                </span>
                <select
                  value={lineAccountId}
                  onChange={(e) => setLineAccountId(e.target.value)}
                  className="input-modern mt-1"
                >
                  {proposal.lineAccountAlternatives.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>

              {!proposal.partyOptional ? (
                <>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">{t("party")}</span>
                    {proposal.partyAlternatives.length > 0 ? (
                      <select
                        value={partyId ?? ""}
                        onChange={(e) => handlePartySelect(e.target.value)}
                        className="input-modern mt-1"
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
                        className="input-modern mt-1"
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

              <label className="block text-sm">
                <span className="font-medium text-slate-700">{t("bankAccount")}</span>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="input-modern mt-1"
                >
                  {proposal.bankAlternatives.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="font-medium text-slate-700">{t("date")}</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input-modern mt-1"
                />
              </label>
            </div>
          ) : (
            <form onSubmit={handleSuggest} className="space-y-3">
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t("placeholder")}
                  rows={3}
                  className="input-modern resize-none pr-12"
                  autoFocus
                />
                <button
                  type="button"
                  title={t("voice")}
                  onClick={startVoice}
                  className={`absolute right-2 bottom-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                    listening
                      ? "bg-red-100 text-red-600"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  🎤
                </button>
              </div>
              {listening ? (
                <p className="text-sm text-[var(--brand)]">{t("listening")}</p>
              ) : null}
              <p className="text-xs text-[var(--muted)]">{t("examples")}</p>
              <button type="submit" disabled={loading || !prompt.trim()} className="btn-brand w-full">
                {loading ? "…" : t("submit")}
              </button>
            </form>
          )}

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
        </div>

        {proposal && !success ? (
          <div className="flex gap-2 border-t border-[var(--border)] px-5 py-4">
            <button
              type="button"
              onClick={() => {
                setProposal(null);
                setError(null);
              }}
              className="flex-1 rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={executing}
              className="btn-brand flex-1"
            >
              {executing ? t("confirming") : t("confirm")}
            </button>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
