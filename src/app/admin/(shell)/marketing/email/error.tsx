"use client";

import { useEffect } from "react";

/**
 * The Email Marketing error boundary.
 *
 * A missing table is the single most likely failure on a screen this new, so
 * the boundary names it and says where to look rather than showing Next's
 * blank "This page couldn't load".
 */
export default function EmailMarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/marketing/email]", error);
  }, [error]);

  const missingTable = /Could not find the table|relation .* does not exist|schema cache/i.test(
    error.message
  );

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Email Marketing</h1>
          <p>This screen could not load.</p>
        </div>
      </div>

      <div className="cc-board">
        <section className="cc-panel cc-s12">
          <div className="cc-panel-head">
            <h2>
              {missingTable
                ? "The Email Marketing tables are not in the database yet"
                : "Email Marketing could not be loaded"}
            </h2>
          </div>
          <div className="cc-panel-body">
            <p className="cc-note" style={{ marginTop: 0 }}>
              {missingTable ? (
                <>
                  The code is deployed but its migration has not been run. Open the
                  Supabase SQL editor and run{" "}
                  <code>supabase/migrations/20260910190000_email_marketing.sql</code> from
                  the repository, then reload this page. Nothing else in the admin is
                  affected, and no email can be sent until it exists.
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
