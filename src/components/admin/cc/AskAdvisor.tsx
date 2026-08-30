"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconAlert, IconSend, IconSpark } from "./Icons";

/**
 * The advisor's input.
 *
 * It sends a question and nothing else. The business context is assembled on
 * the server inside the route — see the comment there for why the browser is
 * not trusted to supply the facts it wants reasoned about.
 */

const PROMPTS = [
  "What should I focus on today?",
  "Which leads need follow-up?",
  "What service is making us the most money?",
  "How are our ads performing?",
  "What should we post today?",
  "Are any projects at risk?",
  "Where should I spend my marketing budget?",
];

type Proposal = {
  kind: string;
  title: string;
  summary: string | null;
  risk: string;
  rationale: string | null;
};

type Answer = {
  answer: string;
  actions: Proposal[];
  model?: string;
};

export default function AskAdvisor({ initialQuestion }: { initialQuestion?: string }) {
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const autoRan = useRef(false);

  const ask = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    setAnswer(null);

    try {
      const res = await fetch("/api/admin/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "The advisor could not answer that.");
      } else {
        setAnswer({ answer: data.answer, actions: data.actions ?? [], model: data.model });
      }
    } catch {
      setError("Couldn't reach the advisor. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  // Arriving from "AI, prioritise my day" carries the question in the URL.
  // Runs once — a refresh should not silently spend another API call.
  useEffect(() => {
    if (autoRan.current || !initialQuestion) return;
    autoRan.current = true;
    void ask(initialQuestion);
  }, [initialQuestion, ask]);

  return (
    <div id="advisor">
      <form
        className="cc-ask"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          ref={box}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void ask(question);
            }
          }}
          placeholder="Ask Tomorrows Tech AI anything about your business…"
          rows={2}
          aria-label="Ask the business advisor"
        />
        <button
          type="submit"
          className="cc-ask-send"
          disabled={busy || question.trim().length === 0}
          aria-label="Ask"
        >
          {busy ? <IconSpark size={17} /> : <IconSend size={17} />}
        </button>
      </form>

      <div className="cc-prompts">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            className="cc-prompt"
            disabled={busy}
            onClick={() => {
              setQuestion(p);
              box.current?.focus();
              void ask(p);
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {busy ? (
        <div className="cc-answer" aria-live="polite">
          <div className="cc-skel cc-skel-line w-100" style={{ marginBottom: 8 }} />
          <div className="cc-skel cc-skel-line w-80" style={{ marginBottom: 8 }} />
          <div className="cc-skel cc-skel-line w-60" />
        </div>
      ) : null}

      {error ? (
        <div className="cc-answer" role="alert" style={{ display: "flex", gap: 9 }}>
          <IconAlert size={15} style={{ color: "var(--cc-warn)", flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      ) : null}

      {answer ? (
        <>
          <div className="cc-answer" aria-live="polite">
            {answer.answer}
          </div>

          {answer.actions.length > 0 ? (
            <div style={{ marginTop: 11 }}>
              <div className="cc-pop-head" style={{ padding: "0 0 7px" }}>
                Proposed — nothing has been done
              </div>
              <div className="cc-insights">
                {answer.actions.map((a, i) => (
                  <div key={i} className="cc-insight k-action">
                    <span className="cc-insight-rail" />
                    <div className="cc-insight-body">
                      <span className="cc-insight-kind">
                        {a.kind.replace(/_/g, " ")} · {a.risk} risk
                      </span>
                      <div className="cc-insight-title">{a.title}</div>
                      {a.summary ? <p className="cc-insight-text">{a.summary}</p> : null}
                      {a.rationale ? (
                        <p className="cc-insight-text" style={{ opacity: 0.75 }}>
                          Because: {a.rationale}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <p className="cc-note">
                Queued for review. Each one waits for your approval before
                anything happens — the database will not accept an approved
                action without a named reviewer.
              </p>
            </div>
          ) : null}

          {answer.model ? (
            <div className="cc-answer-meta">
              <IconSpark size={11} /> Answered from live business data · {answer.model}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
