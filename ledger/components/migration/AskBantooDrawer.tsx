"use client";

import { useState } from "react";

import { askWizardAssistantAction } from "@/app/actions/migration";

type Exchange = { question: string; answer: string; source: "ai" | "rule_based" };

const EXAMPLES = [
  "What are retained earnings?",
  "What is Opening Equity?",
  "Why doesn't my balance sheet balance?",
  "Can I leave inventory empty?",
  "Why can't I finish?",
];

// Step 5D — an inline "Ask Bantoo" panel available from every wizard step.
// Deliberately separate from the main Ask Bantoo transaction-extraction
// modal used elsewhere in the app (photo/voice receipt capture) — this is a
// plain Q&A drawer wired to lib/ai/wizard-assistant.ts, which degrades to a
// still-useful rule-based answer with no AI configured.
export function AskBantooDrawer() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<Exchange[]>([]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || pending) return;
    setPending(true);
    setQuestion("");
    try {
      const result = await askWizardAssistantAction(text);
      if ("error" in result) {
        setHistory((h) => [...h, { question: text, answer: result.error, source: "rule_based" }]);
      } else {
        setHistory((h) => [...h, { question: text, answer: result.answer, source: result.source }]);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pill-action fixed bottom-5 right-5 z-40 shadow-lg"
        aria-expanded={open}
      >
        🤖 Ask Bantoo
      </button>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[75vh] w-full max-w-lg overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-2xl sm:right-5 sm:bottom-20 sm:left-auto sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Ask Bantoo</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
              ✕
            </button>
          </div>

          <div className="max-h-80 space-y-3 overflow-y-auto px-4 py-3">
            {history.length === 0 ? (
              <div>
                <p className="text-sm text-[var(--muted)]">Ask anything about this migration — try:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => ask(ex)}
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-slate-600 hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {history.map((h, i) => (
              <div key={i} className="space-y-1">
                <p className="text-sm font-medium text-slate-900">You: {h.question}</p>
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {h.answer}
                  {h.source === "rule_based" ? (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      no-AI
                    </span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>

          <form
            className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question…"
              className="input-modern"
            />
            <button type="submit" disabled={pending || !question.trim()} className="btn-brand disabled:opacity-50">
              {pending ? "…" : "Ask"}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
