"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/supabase/types";

/**
 * Sell something extra.
 *
 * The amount is typed every time, defaulting to the catalog's "from" figure
 * as a starting point rather than a price. Custom work is quoted per job, and
 * a number nobody looked at is how you end up charging last quarter's rate.
 */
export function SellUpsellButton({
  items,
  leadId,
  customerId,
}: {
  items: CatalogItem[];
  leadId?: string | null;
  customerId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [amount, setAmount] = useState(
    items[0] ? (items[0].from_cents / 100).toFixed(2) : ""
  );
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selected = items.find((i) => i.id === itemId) ?? null;

  function pick(id: string) {
    setItemId(id);
    const next = items.find((i) => i.id === id);
    if (next) setAmount((next.from_cents / 100).toFixed(2));
    setUrl(null);
  }

  async function create() {
    setState("working");
    setError("");
    try {
      const cents = Math.round(Number.parseFloat(amount.replace(/[^0-9.]/g, "")) * 100);
      const res = await fetch("/api/admin/upsell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogItemId: itemId, amountCents: cents, leadId, customerId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || "Couldn't create the link.");
      setUrl(body.url as string);
      setState("idle");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Couldn't create the link.");
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="ad-hint">
        Nothing in the catalog yet. Add what you sell under{" "}
        <a className="ad-link" href="/admin/catalog">
          Catalog
        </a>
        .
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="ad-btn" onClick={() => setOpen(true)}>
        Sell an upgrade
      </button>
    );
  }

  return (
    <div className="ad-paylink">
      <label className="ad-field">
        <span>What are you selling?</span>
        <select className="ad-input" value={itemId} onChange={(e) => pick(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {i.billing === "monthly" ? " (monthly)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="ad-field">
        <span>
          Amount{selected?.billing === "monthly" ? " per month" : ""} — quoted for this job
        </span>
        <input
          className="ad-input"
          value={amount}
          inputMode="decimal"
          onChange={(e) => {
            setAmount(e.target.value);
            setUrl(null);
          }}
        />
      </label>

      {selected && (
        <p className="ad-hint">
          Catalog reference is ${(selected.from_cents / 100).toLocaleString("en-US")}
          {selected.billing === "monthly" ? "/month" : ""}. Change the amount above to
          whatever you quoted.
        </p>
      )}

      {url ? (
        <>
          <input className="ad-input" value={url} readOnly onFocus={(e) => e.target.select()} />
          <button type="button" className="ad-btn sm" onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="ad-btn primary"
          onClick={create}
          disabled={state === "working" || !amount}
        >
          {state === "working" ? "Creating…" : "Create link"}
        </button>
      )}

      {state === "error" && <p className="ad-error">{error}</p>}

      <button type="button" className="ad-btn ghost sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
