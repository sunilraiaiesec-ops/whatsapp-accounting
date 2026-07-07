"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import {
  executeBantooAction,
  getBantooAiStatus,
  getBantooProductDefaults,
  searchBantooEntities,
} from "@/app/actions/bantoo";
import { createExpenseCategory } from "@/app/actions/command";
import { BantooCombobox } from "@/components/BantooCombobox";
import {
  emptyDraft,
  type BantooDraft,
  type BantooOption,
  type BantooProposal,
  type EntitySearchType,
  type ExecuteBantooInput,
} from "@/lib/bantoo/types";

// Debounced org-scoped search bound to an entity type, adapted to the shape the
// combobox expects.
function makeEntitySearch(type: EntitySearchType) {
  return async (query: string): Promise<BantooOption[]> => {
    const { candidates } = await searchBantooEntities(type, query);
    return candidates;
  };
}

const inputClass = "input-modern text-base md:text-sm";
const NEW_CATEGORY_VALUE = "__new_category__";

const MAX_IMAGES = 4;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_IMAGE = /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf)$/i;

type Attachment = { id: string; file: File; url: string; isPdf: boolean };

function OpenButton({ onClick, className }: { onClick: () => void; className?: string }) {
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
      <span className="hidden sm:inline">{t("open")}</span>
    </button>
  );
}

export function BantooCommand() {
  const t = useTranslations("command");
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<BantooProposal | null>(null);
  const [success, setSuccess] = useState<{
    href: string;
    number: string;
    kind: string;
    message?: string;
  } | null>(null);
  // Set when the server had to use the rule-based parser because the AI path
  // errored (key/quota/model). Text still works; we just note it was basic.
  const [aiNote, setAiNote] = useState<string | null>(null);
  // null = unknown/not yet checked; true/false = AI photo+voice availability.
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const aiStatusRequested = useRef(false);

  // Editable confirmation state, hydrated from the proposal.
  const [draft, setDraft] = useState<BantooDraft>(emptyDraft());
  const [partyId, setPartyId] = useState<string | null>(null);
  const [createParty, setCreateParty] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [lineAccountId, setLineAccountId] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [lineAccountOptions, setLineAccountOptions] = useState<BantooOption[]>([]);
  // Display text for the account combobox (accounts are selected by id).
  const [lineAccountText, setLineAccountText] = useState("");

  const resetAll = useCallback(() => {
    setPrompt("");
    setAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.url));
      return [];
    });
    setError(null);
    setProposal(null);
    setSuccess(null);
    setAiNote(null);
    setDraft(emptyDraft());
    setPartyId(null);
    setCreateParty(false);
    setItemId(null);
    setBankAccountId("");
    setLineAccountId("");
    setLineAccountText("");
    setShowNewCategory(false);
    setNewCategoryName("");
  }, []);

  const openDialog = useCallback(() => {
    resetAll();
    setOpen(true);
    if (!aiStatusRequested.current) {
      aiStatusRequested.current = true;
      getBantooAiStatus()
        .then((s) => setAiConfigured(s.configured))
        .catch(() => setAiConfigured(null));
    }
  }, [resetAll]);

  const aiDisabled = aiConfigured === false;

  const stopRecorder = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  const closeDialog = useCallback(() => {
    stopRecorder();
    setOpen(false);
    resetAll();
  }, [resetAll, stopRecorder]);

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

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError(null);
    const next: Attachment[] = [];
    for (const file of Array.from(fileList)) {
      if (!ACCEPTED_IMAGE.test(file.type)) {
        setError(t("fileTypeError"));
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(t("fileTooLarge"));
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
        isPdf: file.type === "application/pdf",
      });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((a) => a.id !== id);
    });
  }

  async function startRecording() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(t("voiceUnsupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        await transcribe(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError(t("micDenied"));
    }
  }

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      form.append("audio", blob, `voice.${ext}`);
      form.append("lang", document.documentElement.lang === "fr" ? "fr" : "en");
      const res = await fetch("/api/bantoo/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 429 ? t("rateLimited") : data.error ?? t("genericError"));
        return;
      }
      if (data.text) {
        setPrompt((prev) => (prev ? `${prev} ${data.text}` : data.text));
      }
    } catch {
      setError(t("genericError"));
    } finally {
      setTranscribing(false);
    }
  }

  function hydrateFromProposal(p: BantooProposal) {
    setProposal(p);
    setDraft(p.draft);
    setPartyId(p.partyId);
    setCreateParty(p.createParty);
    setItemId(p.itemId);
    setBankAccountId(p.bankAccountId ?? "");
    setLineAccountId(p.lineAccountId ?? "");
    setLineAccountOptions(p.lineAccountOptions);
    setLineAccountText(
      p.lineAccountOptions.find((a) => a.id === p.lineAccountId)?.label ?? "",
    );
    setShowNewCategory(false);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Selecting an existing product auto-populates its dependent defaults (unit,
  // tax rate, cost, sale price, reorder level). "Create new" clears the id and
  // leaves the fields editable.
  async function handleSelectProduct(option: BantooOption) {
    if (!option.id) {
      setItemId(null);
      return;
    }
    setItemId(option.id);
    const res = await getBantooProductDefaults(option.id);
    if (res.ok) {
      setDraft((prev) => ({
        ...prev,
        unit: res.defaults.unit || prev.unit,
        taxRate: res.defaults.taxRate || prev.taxRate,
        costPrice: res.defaults.costPrice || prev.costPrice,
        salePrice: res.defaults.salePrice || prev.salePrice,
        reorderLevel: res.defaults.reorderLevel || prev.reorderLevel,
      }));
    }
  }

  async function handleSubmit() {
    if (!prompt.trim() && attachments.length === 0) return;
    setLoading(true);
    setError(null);
    setProposal(null);
    setSuccess(null);
    setAiNote(null);
    try {
      const form = new FormData();
      form.append("text", prompt.trim());
      attachments.forEach((a) => form.append("image", a.file, a.file.name));
      const res = await fetch("/api/bantoo/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 429 ? t("rateLimited") : data.error ?? t("genericError"));
        return;
      }
      if (data.aiFallback) setAiNote(t("aiFallbackNote"));
      hydrateFromProposal(data.proposal as BantooProposal);
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  function updateDraft<K extends keyof BantooDraft>(key: K, value: BantooDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
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
    setLineAccountOptions((prev) =>
      prev.some((a) => a.id === result.id) ? prev : [...prev, result],
    );
    setLineAccountId(result.id);
    setLineAccountText(result.label);
    setShowNewCategory(false);
  }

  async function handleConfirm() {
    if (!proposal) return;
    setExecuting(true);
    setError(null);
    const input: ExecuteBantooInput = {
      action: proposal.action,
      draft,
      partyId,
      createParty: createParty && !partyId,
      partyType: proposal.partyType,
      itemId: itemId || null,
      bankAccountId: bankAccountId || null,
      lineAccountId: lineAccountId || null,
    };
    const result = await executeBantooAction(input);
    setExecuting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess({ href: result.href, number: result.number, kind: result.kind, message: result.message });
  }

  // Read-only "answer" actions (balance/query) have nothing to navigate to
  // that matters more than the message itself; navigation actions open the
  // right page; contact actions launch the tel:/wa.me/mailto: link directly
  // instead of an in-app route.
  function successMessage(): string {
    if (!success) return "";
    if (success.message) return success.message;
    if (success.kind === "view_customer") {
      return success.number ? t("successFound", { number: success.number }) : t("successOpening");
    }
    if (success.kind === "edit_customer") return t("successCustomerUpdated", { number: success.number });
    if (success.kind === "add_customer_note") return t("successNoteAdded", { number: success.number });
    return t("successSaved", { number: success.number });
  }

  function successButtonLabel(): string {
    if (!success) return t("viewDocument");
    if (success.href.startsWith("tel:")) return t("callNow");
    if (success.href.startsWith("https://wa.me/")) return t("openWhatsapp");
    if (success.href.startsWith("mailto:")) return t("sendEmailAction");
    if (success.kind === "view_customer" || success.kind === "customer_balance" || success.kind === "customer_query") {
      return t("openAction");
    }
    return t("viewDocument");
  }

  function handleSuccessAction() {
    if (!success) return;
    if (
      success.href.startsWith("tel:") ||
      success.href.startsWith("mailto:") ||
      success.href.startsWith("https://wa.me/")
    ) {
      window.open(success.href, success.href.startsWith("tel:") ? "_self" : "_blank");
      closeDialog();
      return;
    }
    router.push(success.href);
    closeDialog();
  }

  function goBackToInput() {
    setProposal(null);
    setError(null);
  }

  // "unsupported_customer_action" is recognized confidently but genuinely not
  // buildable yet — there is nothing to confirm/save, so no confirm button.
  const canConfirm =
    proposal && proposal.action !== "unknown" && proposal.action !== "unsupported_customer_action";

  // Read-only/navigation actions don't "save" anything, so the primary
  // button says so — "Confirm & save" would be misleading for e.g. opening
  // a ledger or asking a customer's balance.
  const confirmLabelKeyByAction: Record<string, string> = {
    view_customer: "openAction",
    customer_balance: "showAnswerAction",
    customer_query: "showAnswerAction",
    contact_customer: "continueAction",
  };

  // --- Small render helpers -------------------------------------------------

  // A small muted "why" line shown under a field when org transaction-pattern
  // learning (lib/command-patterns.ts) drove its suggestion/prefill — fully
  // informational; the field itself always stays editable.
  function reasonHint(key: keyof BantooProposal["fieldReasons"]) {
    const reason = proposal?.fieldReasons?.[key];
    if (!reason) return null;
    const text = t(`fieldReasons.${reason.code}` as Parameters<typeof t>[0], reason.params);
    return <p className="mt-1 text-xs text-[var(--muted)]">💡 {text}</p>;
  }

  function warningText(warning: BantooProposal["warnings"][number]) {
    return t(`warnings.${warning.code}` as Parameters<typeof t>[0], warning.params);
  }

  function field(
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: {
      money?: boolean;
      placeholder?: string;
      type?: string;
      reasonKey?: keyof BantooProposal["fieldReasons"];
    },
  ) {
    return (
      <label className="block text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <input
          type={opts?.type ?? "text"}
          inputMode={opts?.money ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={opts?.placeholder}
          className={`${inputClass} mt-1`}
        />
        {opts?.reasonKey ? reasonHint(opts.reasonKey) : null}
      </label>
    );
  }

  function accountSelect(label: string, canAddCategory: boolean) {
    return (
      <div className="block text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-slate-700">{label}</span>
          {canAddCategory ? (
            <button
              type="button"
              onClick={() => {
                setShowNewCategory(true);
                if (!newCategoryName && draft.description) setNewCategoryName(draft.description);
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
          {canAddCategory ? (
            <option value={NEW_CATEGORY_VALUE}>➕ {t("addCategoryOption")}</option>
          ) : null}
        </select>
        {canAddCategory && showNewCategory ? (
          <div className="mt-2 rounded-xl border-2 border-[var(--brand)]/30 bg-[var(--brand)]/5 p-3">
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
      </div>
    );
  }

  function bankSelect() {
    if (!proposal) return null;
    return (
      <label className="block text-sm">
        <span className="font-medium text-slate-700">{t("bankAccount")}</span>
        <select
          value={bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
          className={`${inputClass} mt-1`}
        >
          {proposal.bankOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function partyBlock(label: string, createLabel: string, opts?: { allowCreate?: boolean }) {
    if (!proposal) return null;
    const allowCreate = opts?.allowCreate ?? true;
    const type: EntitySearchType = proposal.partyType === "customer" ? "customer" : "supplier";
    const reasonKey: keyof BantooProposal["fieldReasons"] =
      proposal.partyType === "customer" ? "customer" : "supplier";
    return (
      <div>
        <BantooCombobox
          label={label}
          text={draft.partyName}
          selectedId={partyId}
          options={proposal.partyOptions}
          onSearch={makeEntitySearch(type)}
          placeholder={t("searchOrType")}
          allowCreate={allowCreate}
          createLabel={() => createLabel}
          onSelectExisting={(opt) => {
            if (opt.id) {
              setPartyId(opt.id);
              updateDraft("partyName", opt.label);
              setCreateParty(false);
            } else {
              setPartyId(null);
              updateDraft("partyName", opt.label);
              setCreateParty(allowCreate);
            }
          }}
          onTextChange={(v) => {
            updateDraft("partyName", v);
            setPartyId(null);
            setCreateParty(allowCreate && Boolean(v.trim()));
          }}
        />
        {reasonHint(reasonKey)}
      </div>
    );
  }

  // Used by every "existing customer" workflow (edit/view/balance/note/
  // contact/query) — never offers "create new", since these all act on a
  // customer that must already exist.
  function existingCustomerBlock() {
    return partyBlock(t("customer"), "", { allowCreate: false });
  }

  // Searchable unit picker (units are free text on items; suggestions come from
  // existing items + the search endpoint).
  function unitCombobox() {
    if (!proposal) return null;
    return (
      <div>
        <BantooCombobox
          label={t("unit")}
          text={draft.unit}
          selectedId={null}
          options={proposal.unitOptions}
          onSearch={makeEntitySearch("unit")}
          allowCreate={false}
          placeholder={t("unitPlaceholder")}
          onSelectExisting={(opt) => updateDraft("unit", opt.label)}
          onTextChange={(v) => updateDraft("unit", v)}
        />
        {reasonHint("unit")}
      </div>
    );
  }

  // Searchable account picker for expense/income categories. Accounts must
  // exist, so free-text create is disabled here; new expense categories are
  // added via the "+ add category" affordance which calls createExpenseCategory.
  function accountCombobox(
    label: string,
    type: EntitySearchType,
    canAddCategory: boolean,
  ) {
    return (
      <div className="block text-sm">
        {canAddCategory ? (
          <div className="mb-1 flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                setShowNewCategory(true);
                if (!newCategoryName && draft.description) setNewCategoryName(draft.description);
              }}
              className="shrink-0 text-xs font-semibold text-[var(--brand)] hover:underline"
            >
              + {t("addCategoryShort")}
            </button>
          </div>
        ) : null}
        <BantooCombobox
          label={label}
          text={lineAccountText}
          selectedId={lineAccountId || null}
          options={lineAccountOptions}
          onSearch={makeEntitySearch(type)}
          allowCreate={false}
          placeholder={t("searchAccount")}
          onSelectExisting={(opt) => {
            if (!opt.id) return;
            setLineAccountId(opt.id);
            setLineAccountText(opt.label);
            setLineAccountOptions((prev) =>
              prev.some((a) => a.id === opt.id) ? prev : [...prev, opt],
            );
            setShowNewCategory(false);
          }}
          onTextChange={(v) => {
            setLineAccountText(v);
            setLineAccountId("");
          }}
        />
        {canAddCategory && showNewCategory ? (
          <div className="mt-2 rounded-xl border-2 border-[var(--brand)]/30 bg-[var(--brand)]/5 p-3">
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
      </div>
    );
  }

  function dateField() {
    return (
      <label className="block text-sm">
        <span className="font-medium text-slate-700">{t("date")}</span>
        <input
          type="date"
          value={draft.date}
          onChange={(e) => updateDraft("date", e.target.value)}
          className={`${inputClass} mt-1`}
        />
      </label>
    );
  }

  function renderProposalFields() {
    if (!proposal) return null;
    switch (proposal.action) {
      case "add_inventory_item":
        return (
          <>
            {field(t("productName"), draft.productName, (v) => updateDraft("productName", v))}
            {field(t("sku"), draft.sku, (v) => updateDraft("sku", v), {
              placeholder: t("skuPlaceholder"),
            })}
            {field(t("barcode"), draft.barcode, (v) => updateDraft("barcode", v))}
            {field(t("category"), draft.category, (v) => updateDraft("category", v))}
            {unitCombobox()}
            {field(t("salePrice"), draft.salePrice, (v) => updateDraft("salePrice", v), {
              money: true,
            })}
            {field(t("costPrice"), draft.costPrice, (v) => updateDraft("costPrice", v), {
              money: true,
              reasonKey: "costPrice",
            })}
            {field(t("openingStock"), draft.quantity, (v) => updateDraft("quantity", v), {
              money: true,
              placeholder: t("openingStockPlaceholder"),
              reasonKey: "quantity",
            })}
            {field(t("taxRate"), draft.taxRate, (v) => updateDraft("taxRate", v), { money: true })}
            {field(t("reorderLevel"), draft.reorderLevel, (v) => updateDraft("reorderLevel", v), {
              money: true,
            })}
            {Number(draft.quantity) > 0 ? partyBlock(t("supplier"), t("createSupplier")) : null}
          </>
        );
      case "receive_stock":
        return (
          <>
            <BantooCombobox
              label={t("inventoryItem")}
              text={draft.productName}
              selectedId={itemId}
              options={proposal.itemOptions}
              onSearch={makeEntitySearch("product")}
              placeholder={t("searchOrType")}
              createLabel={(name) => t("createItem", { name })}
              onSelectExisting={(opt) => {
                if (opt.id) {
                  updateDraft("productName", opt.label.replace(/^[^—]+—\s*/, ""));
                  void handleSelectProduct(opt);
                } else {
                  setItemId(null);
                }
              }}
              onTextChange={(v) => {
                updateDraft("productName", v);
                setItemId(null);
              }}
            />
            {reasonHint("item")}
            {field(t("quantity"), draft.quantity, (v) => updateDraft("quantity", v), {
              money: true,
              reasonKey: "quantity",
            })}
            {unitCombobox()}
            {field(t("unitCost"), draft.costPrice, (v) => updateDraft("costPrice", v), {
              money: true,
              placeholder: t("unitCostPlaceholder"),
              reasonKey: "costPrice",
            })}
            {partyBlock(t("supplier"), t("createSupplier"))}
            {dateField()}
          </>
        );
      case "supplier_purchase":
        return (
          <>
            {field(t("amount"), draft.amount, (v) => updateDraft("amount", v), { money: true })}
            {partyBlock(t("supplier"), t("createSupplier"))}
            {field(t("expenseDescription"), draft.description, (v) => updateDraft("description", v))}
            {accountCombobox(t("expenseAccount"), "expense_category", true)}
            {field(t("paymentMethod"), draft.paymentMethod, (v) => updateDraft("paymentMethod", v))}
            {dateField()}
            {field(t("dueDate"), draft.dueDate, (v) => updateDraft("dueDate", v), {
              type: "date",
              reasonKey: "dueDate",
            })}
          </>
        );
      case "customer_payment":
        return (
          <>
            {field(t("amount"), draft.amount, (v) => updateDraft("amount", v), { money: true })}
            {partyBlock(t("customer"), t("createParty"))}
            {bankSelect()}
            {accountSelect(t("incomeAccount"), false)}
            {field(t("paymentMethod"), draft.paymentMethod, (v) => updateDraft("paymentMethod", v))}
            {field(t("expenseDescription"), draft.description, (v) => updateDraft("description", v))}
            {dateField()}
          </>
        );
      case "expense":
        return (
          <>
            {field(t("amount"), draft.amount, (v) => updateDraft("amount", v), { money: true })}
            {field(t("expenseDescription"), draft.description, (v) => updateDraft("description", v))}
            {accountCombobox(t("expenseAccount"), "expense_category", true)}
            {partyBlock(t("payee"), t("createSupplier"))}
            {bankSelect()}
            {field(t("paymentMethod"), draft.paymentMethod, (v) => updateDraft("paymentMethod", v))}
            {dateField()}
          </>
        );
      case "sales_receipt":
        return (
          <>
            {field(t("amount"), draft.amount, (v) => updateDraft("amount", v), { money: true })}
            {field(t("expenseDescription"), draft.description, (v) => updateDraft("description", v))}
            {accountCombobox(t("incomeAccount"), "income_account", false)}
            {partyBlock(t("customer"), t("createParty"))}
            {bankSelect()}
            {field(t("paymentMethod"), draft.paymentMethod, (v) => updateDraft("paymentMethod", v))}
            {dateField()}
          </>
        );
      case "create_customer":
        return (
          <>
            {partyBlock(t("customer"), t("createParty"))}
            {field(t("city"), draft.city, (v) => updateDraft("city", v))}
          </>
        );
      case "edit_customer":
        return (
          <>
            {existingCustomerBlock()}
            {field(t("newName"), draft.newName, (v) => updateDraft("newName", v), {
              placeholder: t("newNamePlaceholder"),
            })}
            {field(t("phone"), draft.phone, (v) => updateDraft("phone", v))}
            {field(t("whatsapp"), draft.whatsapp, (v) => updateDraft("whatsapp", v))}
            {field(t("email"), draft.email, (v) => updateDraft("email", v))}
            {field(t("city"), draft.city, (v) => updateDraft("city", v))}
          </>
        );
      case "view_customer":
        return (
          <>
            {draft.view === "list" ? (
              <p className="text-sm text-slate-600">{t("viewCustomerListHint")}</p>
            ) : (
              <>
                {existingCustomerBlock()}
                {draft.view === "statement" ? (
                  <p className="text-xs text-[var(--muted)]">
                    {draft.periodText
                      ? t("statementPeriodHint", { period: draft.periodText })
                      : t("statementAllTimeHint")}
                  </p>
                ) : null}
              </>
            )}
          </>
        );
      case "customer_balance":
        return <>{existingCustomerBlock()}</>;
      case "add_customer_note":
        return (
          <>
            {existingCustomerBlock()}
            {field(t("noteText"), draft.note, (v) => updateDraft("note", v), {
              placeholder: t("noteTextPlaceholder"),
            })}
          </>
        );
      case "contact_customer":
        return (
          <>
            {existingCustomerBlock()}
            <p className="text-xs text-[var(--muted)]">
              {t(
                draft.contactMethod === "whatsapp"
                  ? "contactViaWhatsapp"
                  : draft.contactMethod === "email"
                    ? "contactViaEmail"
                    : "contactViaCall",
              )}
            </p>
          </>
        );
      case "customer_query":
        return (
          <>
            {existingCustomerBlock()}
            {draft.periodText ? (
              <p className="text-xs text-[var(--muted)]">{t("statementPeriodHint", { period: draft.periodText })}</p>
            ) : null}
          </>
        );
      case "unsupported_customer_action":
        return null;
      default:
        return <p className="text-sm text-slate-600">{t("unknownAction")}</p>;
    }
  }

  const actionLabelKey: Record<string, string> = {
    add_inventory_item: "actionAddItem",
    receive_stock: "actionReceiveStock",
    supplier_purchase: "actionSupplierPurchase",
    customer_payment: "actionCustomerPayment",
    expense: "actionExpense",
    sales_receipt: "actionSalesReceipt",
    create_customer: "actionCreateCustomer",
    edit_customer: "actionEditCustomer",
    view_customer: "actionViewCustomer",
    customer_balance: "actionCustomerBalance",
    add_customer_note: "actionAddCustomerNote",
    contact_customer: "actionContactCustomer",
    customer_query: "actionCustomerQuery",
    unsupported_customer_action: "actionUnsupportedCustomer",
    unknown: "actionUnknown",
  };

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
        className="relative flex max-h-[min(90dvh,44rem)] w-[min(100vw-1.5rem,32rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl max-md:max-h-[100dvh] max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 max-md:px-4">
          {success ? (
            <div className="rounded-xl border border-[var(--brand)]/20 bg-[var(--brand)]/5 p-4">
              <p className="font-medium text-slate-900">{successMessage()}</p>
              <button type="button" onClick={handleSuccessAction} className="btn-brand mt-3 w-full">
                {successButtonLabel()}
              </button>
            </div>
          ) : proposal ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("suggestedAction")}
                </p>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {t(actionLabelKey[proposal.action] ?? "actionUnknown")}
                </p>
                {proposal.summary ? (
                  <p className="mt-1 text-sm text-slate-600">{proposal.summary}</p>
                ) : null}
              </div>

              {aiNote ? (
                <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
                  {aiNote}
                </p>
              ) : null}
              {proposal.lowConfidence ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t("notSure")}
                </p>
              ) : null}
              {proposal.warnings
                .filter((w) => !(w.code === "lowConfidence" && proposal.lowConfidence))
                .map((w) => (
                <p key={w.code + JSON.stringify(w.params ?? {})} className="text-sm text-amber-700">
                  {warningText(w)}
                </p>
              ))}

              {renderProposalFields()}
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
                      void handleSubmit();
                    }
                  }}
                  className={`${inputClass} min-h-[6.5rem] resize-none`}
                  autoFocus
                />
              </div>

              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <div
                      key={a.id}
                      className="relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--border)] bg-slate-50"
                    >
                      {a.isPdf ? (
                        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                          PDF
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt="" className="h-full w-full object-cover" />
                      )}
                      <button
                        type="button"
                        aria-label={t("remove")}
                        onClick={() => removeAttachment(a.id)}
                        className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-slate-900/70 text-xs text-white"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title={aiDisabled ? t("aiUnavailable") : t("takePhoto")}
                  aria-label={t("takePhoto")}
                  disabled={aiDisabled}
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  📷
                </button>
                <button
                  type="button"
                  title={aiDisabled ? t("aiUnavailable") : t("uploadFile")}
                  aria-label={t("uploadFile")}
                  disabled={aiDisabled}
                  onClick={() => uploadInputRef.current?.click()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  📎
                </button>
                <button
                  type="button"
                  title={aiDisabled ? t("aiUnavailable") : recording ? t("stopRecording") : t("recordVoice")}
                  aria-label={recording ? t("stopRecording") : t("recordVoice")}
                  onClick={recording ? stopRecorder : startRecording}
                  disabled={transcribing || aiDisabled}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    recording
                      ? "animate-pulse bg-red-100 text-red-600"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  🎤
                </button>
                <button
                  type="button"
                  disabled={loading || transcribing || (!prompt.trim() && attachments.length === 0)}
                  onClick={() => void handleSubmit()}
                  className="btn-brand ml-auto flex-1 py-2.5"
                >
                  {loading ? "…" : t("submit")}
                </button>
              </div>

              {aiDisabled ? (
                <p className="text-xs text-[var(--muted)]">{t("aiUnavailable")}</p>
              ) : recording ? (
                <p className="text-sm text-red-600">{t("recording")}</p>
              ) : transcribing ? (
                <p className="text-sm text-[var(--brand)]">{t("transcribing")}</p>
              ) : (
                <p className="text-xs text-[var(--muted)]">{t("examplesRich")}</p>
              )}

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
        </div>

        {proposal && !success ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5 md:py-4 md:pb-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={goBackToInput}
                className="flex-1 rounded-full border border-[var(--border)] px-4 py-3 text-sm font-medium text-slate-700"
              >
                {t("edit")}
              </button>
              {canConfirm ? (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={executing}
                  className="btn-brand flex-1 py-3"
                >
                  {executing
                    ? t("confirming")
                    : t(proposal ? (confirmLabelKeyByAction[proposal.action] ?? "confirm") : "confirm")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      <OpenButton onClick={openDialog} />
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
