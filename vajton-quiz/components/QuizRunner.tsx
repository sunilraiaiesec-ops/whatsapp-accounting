"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUESTIONS,
  QUIZ_SUBTITLE,
  QUIZ_TITLE,
  gradeLabel,
  scoreAnswers,
} from "@/lib/quiz-data";

type Phase = "quiz" | "results";

export default function QuizRunner({ username }: { username: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("quiz");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showFeedback, setShowFeedback] = useState(false);

  const q = QUESTIONS[index];
  const picked = answers[q.id];
  const progress = ((index + (phase === "results" ? 1 : 0)) / QUESTIONS.length) * 100;

  const results = useMemo(() => scoreAnswers(answers), [answers]);
  const grade = gradeLabel(results.pct);

  function select(optionId: string) {
    if (showFeedback) return;
    setAnswers((prev) => ({ ...prev, [q.id]: optionId }));
  }

  function checkOrNext() {
    if (!picked) return;
    if (!showFeedback) {
      setShowFeedback(true);
      return;
    }
    if (index < QUESTIONS.length - 1) {
      setIndex((i) => i + 1);
      setShowFeedback(false);
    } else {
      setPhase("results");
    }
  }

  function restart() {
    setPhase("quiz");
    setIndex(0);
    setAnswers({});
    setShowFeedback(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (phase === "results") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">vajton.com</p>
            <h1 className="text-2xl font-bold">Your results</h1>
            <p className="text-sm text-slate-600">Signed in as {username}</p>
          </div>
          <button type="button" onClick={logout} className="btn-secondary">
            Sign out
          </button>
        </header>

        <div className="card mb-8 p-8 text-center">
          <p className="text-5xl font-bold text-slate-900">
            {results.correct}/{results.total}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-700">{results.pct}%</p>
          <p className={`mt-3 text-sm font-medium ${grade.color}`}>{grade.label}</p>
        </div>

        <div className="space-y-4">
          {results.review.map(({ question, picked: p, ok }) => (
            <div key={question.id} className={`card p-5 ${ok ? "" : "border-rose-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">
                  Q{question.id}. {question.prompt}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}
                >
                  {ok ? "Correct" : "Wrong"}
                </span>
              </div>
              {!ok && p ? (
                <p className="mt-2 text-sm text-rose-700">
                  You picked: {question.options.find((o) => o.id === p)?.text}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-slate-600">{question.explanation}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <button type="button" onClick={restart} className="btn-primary">
            Try again
          </button>
          <button type="button" onClick={logout} className="btn-secondary">
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">vajton.com</p>
          <h1 className="text-2xl font-bold text-slate-900">{QUIZ_TITLE}</h1>
          <p className="text-sm text-slate-600">{QUIZ_SUBTITLE}</p>
        </div>
        <button type="button" onClick={logout} className="btn-secondary">
          Sign out
        </button>
      </header>

      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs font-medium text-slate-500">
          <span>
            Question {index + 1} of {QUESTIONS.length}
          </span>
          <span>{q.section}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold leading-snug text-slate-900">{q.prompt}</h2>

        <div className="mt-5 space-y-2">
          {q.options.map((opt) => {
            const selected = picked === opt.id;
            const revealed = showFeedback;
            const isCorrect = opt.id === q.correctId;
            let cls = "option";
            if (selected) cls += " option-selected";
            if (revealed && isCorrect) cls += " option-correct";
            if (revealed && selected && !isCorrect) cls += " option-wrong";

            return (
              <button key={opt.id} type="button" className={cls} onClick={() => select(opt.id)}>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-xs font-bold uppercase">
                  {opt.id}
                </span>
                <span>{opt.text}</span>
              </button>
            );
          })}
        </div>

        {showFeedback ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{q.explanation}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={!picked}
            onClick={checkOrNext}
          >
            {!showFeedback ? "Check answer" : index < QUESTIONS.length - 1 ? "Next question" : "See results"}
          </button>
          {index > 0 && !showFeedback ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setIndex((i) => i - 1);
                setShowFeedback(!!answers[QUESTIONS[index - 1].id]);
              }}
            >
              Back
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
