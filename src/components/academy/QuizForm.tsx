"use client";

import Link from "next/link";
import { useState } from "react";

type Question = { q: string; options: string[] };
type Result = { correct: boolean; answer: number; why: string };
type Response = { score: number; passed: boolean; results: Result[]; certificate: { id: string } | null; error?: string };

export function QuizForm({
  course,
  questions,
  pass,
  needsEmail,
}: {
  course: string;
  questions: Question[];
  pass: number;
  /** Free courses have no enrolled email to put the certificate under. */
  needsEmail: boolean;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Response | null>(null);

  const answered = answers.filter((a) => a !== null).length;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/academy/certificate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, answers, name, email }),
      });
      const json = (await res.json().catch(() => ({}))) as Response;
      if (!res.ok) throw new Error(json.error || "Couldn't grade that. Try again.");
      setResult(json);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't grade that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setResult(null);
    setAnswers(questions.map(() => null));
  }

  return (
    <div className="space-y-8">
      {result && (
        <div className={result.passed ? "ac-success" : "ac-callout"} role="status">
          <div className="ac-kicker mb-1">{result.passed ? "✓ Passed" : "Not quite"}</div>
          <p className="text-2xl font-medium mb-2">You scored {result.score}%</p>
          {result.passed && result.certificate ? (
            <Link href={`/academy/certificates/${result.certificate.id}`} className="btn-primary text-sm">
              View your certificate →
            </Link>
          ) : (
            <>
              <p className="text-sm text-[color:var(--color-text-secondary)] mb-3">
                You need {pass}% to pass. Read the notes under each question, then take it again.
              </p>
              <button type="button" onClick={retake} className="btn-secondary text-sm">Retake the check</button>
            </>
          )}
        </div>
      )}

      <ol className="space-y-6">
        {questions.map((question, qi) => {
          const graded = result?.results[qi];
          return (
            <li key={qi} className="card p-5">
              <p className="font-medium mb-4">
                <span className="text-[color:var(--color-blue-bright)] font-mono text-sm mr-2">{String(qi + 1).padStart(2, "0")}</span>
                {question.q}
              </p>
              <div className="grid gap-2">
                {question.options.map((opt, oi) => {
                  const chosen = answers[qi] === oi;
                  const tone = graded ? (oi === graded.answer ? "right" : chosen ? "wrong" : undefined) : undefined;
                  return (
                    <label key={oi} className="ac-option" data-chosen={chosen || undefined} data-tone={tone}>
                      <input
                        type="radio"
                        name={`q${qi}`}
                        checked={chosen}
                        disabled={Boolean(result)}
                        onChange={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
              {graded && (
                <p className={`text-sm mt-3 ${graded.correct ? "text-[color:var(--color-success)]" : "text-[color:var(--color-text-secondary)]"}`}>
                  {graded.correct ? "Correct. " : ""}
                  {graded.why}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {!result && (
        <div className="card p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-widest text-[color:var(--color-text-muted)] mb-1.5" htmlFor="ac-cert-name">
              Name for your certificate
            </label>
            <input
              id="ac-cert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              className="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-[color:var(--color-blue)]"
            />
          </div>
          {needsEmail && (
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-widest text-[color:var(--color-text-muted)] mb-1.5" htmlFor="ac-cert-email">
                Email
              </label>
              <input
                id="ac-cert-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-[color:var(--color-blue)]"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={submit}
              disabled={busy || answered < questions.length || name.trim().length < 2}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? "Grading…" : "Submit my answers"}
            </button>
            <span className="text-sm text-[color:var(--color-text-muted)]">
              {answered}/{questions.length} answered · {pass}% to pass
            </span>
          </div>
          {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
        </div>
      )}
    </div>
  );
}
