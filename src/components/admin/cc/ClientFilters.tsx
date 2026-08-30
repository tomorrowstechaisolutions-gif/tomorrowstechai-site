"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "./Icons";

/**
 * Filters live in the URL, not in component state.
 *
 * That is what makes a filtered view something you can bookmark, send to
 * yourself, or come back to after opening a client and pressing back. The
 * page reads them on the server; this component only rewrites the query.
 */
export default function ClientFilters({
  owners,
  services,
  tags,
}: {
  owners: string[];
  services: { key: string; label: string }[];
  tags: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Any change to the filters puts you back on page one. Staying on page 4
    // of a result set that now has one page shows an empty table.
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  const value = (key: string) => params.get(key) ?? "";
  const hasFilters = ["q", "service", "owner", "tag", "health"].some((k) => params.get(k));

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search name, contact, email, city…"
          aria-label="Search clients"
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      <select
        className="cc-filter-select"
        value={value("service")}
        onChange={(e) => set("service", e.target.value)}
        aria-label="Filter by service"
      >
        <option value="">All services</option>
        {services.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>

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

      <select
        className="cc-filter-select"
        value={value("health")}
        onChange={(e) => set("health", e.target.value)}
        aria-label="Filter by health"
      >
        <option value="">All health</option>
        <option value="excellent">Excellent (80-100)</option>
        <option value="good">Good (60-79)</option>
        <option value="average">Average (40-59)</option>
        <option value="poor">Poor (0-39)</option>
      </select>

      {tags.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("tag")}
          onChange={(e) => set("tag", e.target.value)}
          aria-label="Filter by tag"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      ) : null}

      {hasFilters ? (
        <button
          type="button"
          className="cc-filter-clear"
          onClick={() => startTransition(() => router.replace(pathname))}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
