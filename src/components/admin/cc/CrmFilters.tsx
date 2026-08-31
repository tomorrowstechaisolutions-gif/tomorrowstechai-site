"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "./Icons";

/** CRM filters, in the URL like every other screen here. */
export default function CrmFilters({
  companies,
  owners,
  stages,
}: {
  companies: { id: string; name: string }[];
  owners: string[];
  stages: { key: string; label: string }[];
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
  const keys = ["q", "stage", "owner", "company", "status"];
  const hasFilters = keys.some((k) => params.get(k));

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search contacts, companies, deals…"
          aria-label="Search the CRM"
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      {companies.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("company")}
          onChange={(e) => set("company", e.target.value)}
          aria-label="Filter by company"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      ) : null}

      <select
        className="cc-filter-select"
        value={value("stage")}
        onChange={(e) => set("stage", e.target.value)}
        aria-label="Filter by stage"
      >
        <option value="">All stages</option>
        {stages.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>

      {owners.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("owner")}
          onChange={(e) => set("owner", e.target.value)}
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : null}

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
