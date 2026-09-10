"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "../Icons";
import {
  HEALTH_LABELS,
  HEALTH_ORDER,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPE_ORDER,
} from "@/lib/software/types";

/**
 * Filters live in the URL, same as Apps, Websites, Clients and Pipeline.
 *
 * "Every live product with a warning, sorted by MRR" has to be a link you
 * can bookmark and send yourself, so this component only rewrites the query
 * string and the server reads it.
 */

const KEYS = ["q", "type", "status", "industry", "health", "owner", "client", "sort", "view"];

export default function SoftwareFilters({
  industries,
  owners,
  clients,
}: {
  industries: string[];
  owners: string[];
  clients: { id: string; name: string }[];
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
  const hasFilters = KEYS.filter((k) => k !== "view").some((k) => params.get(k));

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    for (const key of KEYS) if (key !== "view") next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search software products…"
          aria-label="Search software products"
          onChange={(event) => set("q", event.target.value)}
        />
      </div>

      <select
        className="cc-filter-select"
        value={value("type")}
        onChange={(event) => set("type", event.target.value)}
        aria-label="Filter by product type"
      >
        <option value="">All types</option>
        {PRODUCT_TYPE_ORDER.map((key) => (
          <option key={key} value={key}>{PRODUCT_TYPE_LABELS[key]}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("status")}
        onChange={(event) => set("status", event.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {LIFECYCLE_ORDER.map((key) => (
          <option key={key} value={key}>{LIFECYCLE_LABELS[key]}</option>
        ))}
      </select>

      {/* Industry, owner and client are only offered when the portfolio
          actually contains some — an empty select that can only ever return
          nothing is worse than no select. */}
      {industries.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("industry")}
          onChange={(event) => set("industry", event.target.value)}
          aria-label="Filter by industry"
        >
          <option value="">All industries</option>
          {industries.map((industry) => (
            <option key={industry} value={industry}>{industry}</option>
          ))}
        </select>
      ) : null}

      <select
        className="cc-filter-select"
        value={value("health")}
        onChange={(event) => set("health", event.target.value)}
        aria-label="Filter by health"
      >
        <option value="">Any health</option>
        {HEALTH_ORDER.map((key) => (
          <option key={key} value={key}>{HEALTH_LABELS[key]}</option>
        ))}
      </select>

      {owners.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("owner")}
          onChange={(event) => set("owner", event.target.value)}
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          {owners.map((owner) => (
            <option key={owner} value={owner}>{owner}</option>
          ))}
        </select>
      ) : null}

      {clients.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("client")}
          onChange={(event) => set("client", event.target.value)}
          aria-label="Filter by client"
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
      ) : null}

      <select
        className="cc-filter-select"
        value={value("sort")}
        onChange={(event) => set("sort", event.target.value)}
        aria-label="Sort software products"
      >
        <option value="">Sort: Last Updated</option>
        <option value="mrr">Sort: MRR</option>
        <option value="clients">Sort: Clients</option>
        <option value="version">Sort: Version</option>
        <option value="health">Sort: Health</option>
        <option value="name">Sort: Name</option>
      </select>

      <div className="cc-tabs" style={{ marginLeft: "auto" }} role="group" aria-label="View">
        <button
          type="button"
          className={`cc-tab ${value("view") !== "cards" ? "is-on" : ""}`}
          onClick={() => set("view", "")}
          aria-pressed={value("view") !== "cards"}
        >
          Table
        </button>
        <button
          type="button"
          className={`cc-tab ${value("view") === "cards" ? "is-on" : ""}`}
          onClick={() => set("view", "cards")}
          aria-pressed={value("view") === "cards"}
        >
          Cards
        </button>
      </div>

      {hasFilters ? (
        <button type="button" className="cc-filter-clear" onClick={clearAll}>
          Clear
        </button>
      ) : null}
    </div>
  );
}
