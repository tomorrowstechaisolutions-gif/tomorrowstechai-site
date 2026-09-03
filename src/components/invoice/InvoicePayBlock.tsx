"use client";

import { useState } from "react";

/**
 * The pay step on a client's invoice.
 *
 * The amount is displayed from what the server rendered; pressing the button
 * asks the server to open checkout, which recomputes the figure from the
 * invoice row — and from what has already been collected against it — before
 * it talks to Stripe. Nothing about the price is posted from the browser.
 */
export default function InvoicePayBlock({
  token,
  dueLabel,
  breakdown,
  state,
}: {
  token: string;
  dueLabel: string;
  breakdown: { label: string; value: string; strong?: boolean }[];
  state: "due" | "paid" | "cancelled";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/invoice/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        checkout_url?: string;
      };
      if (!response.ok || !body.checkout_url) {
        setError(body.error ?? "Could not open the payment page.");
        setBusy(false);
        return;
      }
      window.location.href = body.checkout_url;
    } catch {
      setError("Could not reach the payment page. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <section id="payment" className="pr-block pr-payment">
      <div className="pr-head"><span>03</span><h2>Payment</h2></div>

      {state === "paid" ? (
        <p className="pr-paid">
          Paid in full — thank you. Nothing further is owed on this invoice.
        </p>
      ) : (
        <>
          {state === "cancelled" ? (
            <p className="pr-note">
              The payment page was closed before it finished. Nothing was
              charged — you can pick it up again below.
            </p>
          ) : null}

          <ul className="pr-paylines">
            {breakdown.map((line) => (
              <li key={line.label} className={line.strong ? "is-strong" : ""}>
                <span>{line.label}</span>
                <b>{line.value}</b>
              </li>
            ))}
          </ul>

          {error ? <p className="pr-error">{error}</p> : null}

          <button type="button" className="pr-submit" onClick={pay} disabled={busy}>
            {busy ? "Opening secure checkout…" : `Pay ${dueLabel}`}
          </button>
          <p className="pr-note">
            Payment is taken by Stripe. Card details are entered on Stripe&rsquo;s
            own secure page and are never handled by Tomorrow&rsquo;s Tech AI.
          </p>
        </>
      )}
    </section>
  );
}
