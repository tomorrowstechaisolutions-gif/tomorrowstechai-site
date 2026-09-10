"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "../Icons";
import {
  HEALTH_LABELS,
  HEALTH_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  TYPE_LABELS,
  TYPE_ORDER,
} from "@/lib/ai/types";

/**
 * Filters live in the URL, same as every other board here, so "every client
 * chatbot with a critical signal, by cost" is a link you can bookmark.
 */

const KEYS = ["q", "client", "type", "status", "provider", "health", "sort", "view"];

export default function AiFilters({
  clients,
  providers,
}: {
  clients: { id: string; name: string }[];
  providers: { key: string; name: string }[];
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
          placeholder="Search solutions, clients, or tags…"
          aria-label="Search AI solutions"
          onChange={(event) => set("q", event.target.value)}
        />
      </div>

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
        value={value("type")}
        onChange={(event) => set("type", event.target.value)}
        aria-label="Filter by type"
      >
        <option value="">All types</option>
        {TYPE_ORDER.map((key) => (
          <option key={key} value={key}>{TYPE_LABELS[key]}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("status")}
        onChange={(event) => set("status", event.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {STATUS_ORDER.map((key) => (
          <option key={key} value={key}>{STATUS_LABELS[key]}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("provider")}
        onChange={(event) => set("provider", event.target.value)}
        aria-label="Filter by provider"
      >
        <option value="">All providers</option>
        {providers.map((provider) => (
          <option key={provider.key} value={provider.key}>{provider.name}</option>
        ))}
      </select>

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

      <select
        className="cc-filter-select"
        value={value("sort")}
        onChange={(event) => set("sort", event.target.value)}
        aria-label="Sort solutions"
      >
        <option value="">Sort: Last updated</option>
        <option value="revenue">Sort: Revenue</option>
        <option value="cost">Sort: Cost</option>
        <option value="margin">Sort: Margin</option>
        <option value="usage">Sort: Usage</option>
        <option value="performance">Sort: Performance</option>
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
        <button type="button" className="cc-filter-clear" onClick={clearAll}>Clear</button>
      ) : null}
    </div>
  );
}
