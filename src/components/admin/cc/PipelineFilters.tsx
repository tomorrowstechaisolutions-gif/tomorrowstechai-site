"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { DEAL_STAGES } from "@/lib/crm/stages";
import { IconSearch } from "./Icons";

/** Pipeline filters, in the URL like every other screen here. */
export default function PipelineFilters({
  owners,
  companies,
  services,
  sources,
}: {
  owners: string[];
  companies: { id: string; name: string }[];
  services: { id: string; name: string }[];
  sources: string[];
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
  // `view` is deliberately not cleared — clearing filters should not throw
  // you back to the board when you were reading the table.
  const keys = ["q", "stage", "owner", "company", "service", "source", "attention", "stale"];
  const hasFilters = keys.some((k) => params.get(k));

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search deals, companies, contacts…"
          aria-label="Search deals"
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      <select className="cc-filter-select" value={value("stage")} onChange={(e) => set("stage", e.target.value)} aria-label="Filter by stage">
        <option value="">All stages</option>
        {DEAL_STAGES.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
      </select>

      {owners.length > 0 ? (
        <select className="cc-filter-select" value={value("owner")} onChange={(e) => set("owner", e.target.value)} aria-label="Filter by owner">
          <option value="">All owners</option>
          {owners.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
      ) : null}

      {companies.length > 0 ? (
        <select className="cc-filter-select" value={value("company")} onChange={(e) => set("company", e.target.value)} aria-label="Filter by company">
          <option value="">All companies</option>
          {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      ) : null}

      {services.length > 0 ? (
        <select className="cc-filter-select" value={value("service")} onChange={(e) => set("service", e.target.value)} aria-label="Filter by service">
          <option value="">All services</option>
          {services.map((s) => (<option key={s.id} value={s.name}>{s.name}</option>))}
        </select>
      ) : null}

      {sources.length > 0 ? (
        <select className="cc-filter-select" value={value("source")} onChange={(e) => set("source", e.target.value)} aria-label="Filter by source">
          <option value="">All sources</option>
          {sources.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      ) : null}

      <button
        type="button"
        className={`cc-filter-select cc-toggle ${value("attention") ? "is-on" : ""}`}
        onClick={() => set("attention", value("attention") ? "" : "1")}
        aria-pressed={value("attention") ? "true" : "false"}
      >
        Needs attention
      </button>

      <button
        type="button"
        className={`cc-filter-select cc-toggle ${value("stale") ? "is-on" : ""}`}
        onClick={() => set("stale", value("stale") ? "" : "1")}
        aria-pressed={value("stale") ? "true" : "false"}
      >
        Stale
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
