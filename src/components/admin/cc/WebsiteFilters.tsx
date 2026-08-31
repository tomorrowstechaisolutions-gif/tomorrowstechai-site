"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "./Icons";

/**
 * Filters live in the URL, same as the Clients screen.
 *
 * A filtered portfolio is something you bookmark and come back to — "every
 * site needing attention" is a view you want to be able to send yourself.
 * The page reads these on the server; this component only rewrites the query.
 */
export default function WebsiteFilters({
  clients,
  owners,
  types,
  statuses,
}: {
  clients: { id: string; name: string }[];
  owners: string[];
  types: { key: string; label: string }[];
  statuses: { key: string; label: string }[];
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
  const keys = ["q", "client", "type", "status", "owner", "attention", "renewal"];
  const hasFilters = keys.some((k) => params.get(k));

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    for (const k of keys) next.delete(k);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search websites, domains, clients…"
          aria-label="Search websites"
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      <select
        className="cc-filter-select"
        value={value("client")}
        onChange={(e) => set("client", e.target.value)}
        aria-label="Filter by client"
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("type")}
        onChange={(e) => set("type", e.target.value)}
        aria-label="Filter by type"
      >
        <option value="">All types</option>
        {types.map((t) => (
          <option key={t.key} value={t.key}>{t.label}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("status")}
        onChange={(e) => set("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {statuses.map((s) => (
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
        <button type="button" className="cc-filter-clear" onClick={clearAll}>
          Clear
        </button>
      ) : null}
    </div>
  );
}
