"use client";

import { useEffect } from "react";

/**
 * The AI Solutions error boundary.
 *
 * The Apps section taught this lesson the expensive way: code shipped before
 * its migration ran, and the only symptom was Next's blank "This page
 * couldn't load", which cost an afternoon in the Vercel logs. A missing table
 * is by far the likeliest failure on a screen this new, so the boundary names
 * it and says exactly which file to run.
 *
 * It reports Next's digest too, because that digest is how a production error
 * is found in the logs.
 */
export default function AiSolutionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/ai-solutions]", error);
  }, [error]);

  const missingTable = /Could not find the table|relation .* does not exist|schema cache/i.test(
    error.message
  );

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>AI Solutions</h1>
          <p>This screen could not load.</p>
        </div>
      </div>

      <div className="cc-board">
        <section className="cc-panel cc-s12">
          <div className="cc-panel-head">
            <h2>
              {missingTable
                ? "The AI Solutions tables are not in the database yet"
                : "AI Solutions could not be loaded"}
            </h2>
          </div>
          <div className="cc-panel-body">
            <p className="cc-note" style={{ marginTop: 0 }}>
              {missingTable ? (
                <>
                  The code is deployed but its migration has not been run. Open the
                  Supabase SQL editor and run{" "}
                  <code>supabase/migrations/20260910140000_ai_solutions.sql</code> from
                  the repository, then reload this page. Nothing else in the admin is
                  affected, and no AI that is currently running is touched by it.
                </>
              ) : (
                <>
                  Something in this screen&rsquo;s queries failed. The rest of the admin is
                  unaffected — the message below is what the server actually said.
                </>
              )}
            </p>

            <dl className="cc-kv">
              <dt>Error</dt>
              <dd>{error.message || "No message was returned."}</dd>
              {error.digest ? (
                <>
                  <dt>Digest</dt>
                  <dd className="cc-code">{error.digest}</dd>
                </>
              ) : null}
            </dl>

            <div className="cc-rowacts" style={{ marginTop: 12 }}>
              <button type="button" className="cc-btn primary is-sm" onClick={reset}>
                Try again
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
