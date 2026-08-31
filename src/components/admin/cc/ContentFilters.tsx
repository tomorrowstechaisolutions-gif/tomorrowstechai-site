"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "./Icons";

/** Content Studio filters, in the URL like every other screen here. */
export default function ContentFilters({
  brands,
  campaigns,
  platforms,
  types,
}: {
  brands: { id: string; name: string }[];
  campaigns: string[];
  platforms: { key: string; label: string }[];
  types: { key: string; label: string }[];
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
  const keys = ["q", "brand", "platform", "type", "campaign", "ai"];
  const hasFilters = keys.some((k) => params.get(k));

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search copy, titles, campaigns, hashtags…"
          aria-label="Search content"
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      {brands.length > 1 ? (
        <select
          className="cc-filter-select"
          value={value("brand")}
          onChange={(e) => set("brand", e.target.value)}
          aria-label="Filter by brand"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      ) : null}

      <select
        className="cc-filter-select"
        value={value("platform")}
        onChange={(e) => set("platform", e.target.value)}
        aria-label="Filter by platform"
      >
        <option value="">All platforms</option>
        {platforms.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
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

      {campaigns.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("campaign")}
          onChange={(e) => set("campaign", e.target.value)}
          aria-label="Filter by campaign"
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      ) : null}

      <button
        type="button"
        className={`cc-filter-select cc-toggle ${value("ai") ? "is-on" : ""}`}
        onClick={() => set("ai", value("ai") ? "" : "1")}
        aria-pressed={value("ai") ? "true" : "false"}
      >
        AI generated
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
