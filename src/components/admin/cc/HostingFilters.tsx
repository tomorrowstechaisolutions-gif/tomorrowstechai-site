"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "./Icons";

/** Hosting filters, in the URL like every other screen here. */
export default function HostingFilters({
  plans,
  providers,
  health,
}: {
  plans: { id: string; name: string }[];
  providers: string[];
  health: { key: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  const value = (key: string) => params.get(key) ?? "";
  const keys = ["q", "plan", "provider", "billing", "health", "attention", "renewal"];
  const hasFilters = keys.some((k) => params.get(k));

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search clients, domains, sites…"
          aria-label="Search hosting accounts"
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      {plans.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("plan")}
          onChange={(e) => set("plan", e.target.value)}
          aria-label="Filter by plan"
        >
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      ) : null}

      {providers.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("provider")}
          onChange={(e) => set("provider", e.target.value)}
          aria-label="Filter by provider"
        >
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      ) : null}

      <select
        className="cc-filter-select"
        value={value("billing")}
        onChange={(e) => set("billing", e.target.value)}
        aria-label="Filter by billing status"
      >
        <option value="">Any billing</option>
        <option value="active">Active</option>
        <option value="past_due">Past due</option>
        <option value="none">No subscription</option>
      </select>

      <select
        className="cc-filter-select"
        value={value("health")}
        onChange={(e) => set("health", e.target.value)}
        aria-label="Filter by health"
      >
        <option value="">Any health</option>
        {health.map((h) => (
          <option key={h.key} value={h.key}>{h.label}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("renewal")}
        onChange={(e) => set("renewal", e.target.value)}
        aria-label="Filter by renewal window"
      >
        <option value="">Any renewal</option>
        <option value="overdue">Overdue</option>
        <option value="7">Within 7 days</option>
        <option value="30">Within 30 days</option>
      </select>

      <button
        type="button"
        className={`cc-filter-select cc-toggle ${value("attention") ? "is-on" : ""}`}
        onClick={() => set("attention", value("attention") ? "" : "1")}
        aria-pressed={value("attention") ? "true" : "false"}
      >
        Needs attention
      </button>

      {hasFilters ? (
        <button
          type="button"
          className="cc-filter-clear"
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            for (const k of keys) next.delete(k);
            startTransition(() => router.replace(`${pathname}?${next.toString()}`));
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
