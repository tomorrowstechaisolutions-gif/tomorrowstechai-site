"use client";

import { useEffect } from "react";

/**
 * The Software error boundary.
 *
 * Without this, any failure in a server component under /admin/software
 * becomes Next's blank "This page couldn't load" — which is true, useless,
 * and sends somebody digging through Vercel logs to discover the migration
 * had not been run. A missing table is the single most likely failure on a
 * screen this new, so the boundary names it and says where to look.
 */
export default function SoftwareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/software]", error);
  }, [error]);

  const missingTable = /Could not find the table|relation .* does not exist|schema cache/i.test(
    error.message
  );

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Software</h1>
          <p>This screen could not load.</p>
        </div>
      </div>

      <div className="cc-board">
        <section className="cc-panel cc-s12">
          <div className="cc-panel-head">
            <h2>
              {missingTable
                ? "The Software tables are not in the database yet"
                : "Software could not be loaded"}
            </h2>
          </div>
          <div className="cc-panel-body">
            <p className="cc-note" style={{ marginTop: 0 }}>
              {missingTable ? (
                <>
                  The code is deployed but its migration has not been run. Open the
                  Supabase SQL editor and run{" "}
                  <code>supabase/migrations/20260910170000_software.sql</code> from the
                  repository, then reload this page. Nothing else in the admin is
                  affected.
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
                  <dd className="cc-mono">{error.digest}</dd>
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
