"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "../Icons";
import {
  ENVIRONMENT_LABELS,
  ENVIRONMENT_ORDER,
  HEALTH_LABELS,
  HEALTH_ORDER,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  OWNERSHIP_LABELS,
  OWNERSHIP_ORDER,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
} from "@/lib/apps/types";

/**
 * Filters live in the URL, same as Websites, Clients and Pipeline.
 *
 * "Every client app with a critical health signal, sorted by revenue" has
 * to be a link you can bookmark and send yourself, so this component only
 * rewrites the query string and the server reads it.
 */

const KEYS = ["q", "status", "platform", "ownership", "health", "environment", "client", "sort", "view"];

export default function AppFilters({ clients }: { clients: { id: string; name: string }[] }) {
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
          placeholder="Search apps, clients, domains, repositories…"
          aria-label="Search apps"
          onChange={(event) => set("q", event.target.value)}
        />
      </div>

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

      <select
        className="cc-filter-select"
        value={value("platform")}
        onChange={(event) => set("platform", event.target.value)}
        aria-label="Filter by platform"
      >
        <option value="">All platforms</option>
        {PLATFORM_ORDER.map((key) => (
          <option key={key} value={key}>{PLATFORM_LABELS[key]}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("ownership")}
        onChange={(event) => set("ownership", event.target.value)}
        aria-label="Filter by ownership"
      >
        <option value="">All ownership</option>
        {OWNERSHIP_ORDER.map((key) => (
          <option key={key} value={key}>{OWNERSHIP_LABELS[key]}</option>
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
        value={value("environment")}
        onChange={(event) => set("environment", event.target.value)}
        aria-label="Filter by environment"
      >
        <option value="">Any environment</option>
        {ENVIRONMENT_ORDER.map((key) => (
          <option key={key} value={key}>{ENVIRONMENT_LABELS[key]}</option>
        ))}
        <option value="multiple">Multiple</option>
      </select>

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
        aria-label="Sort apps"
      >
        <option value="">Sort: Name</option>
        <option value="health">Sort: Health</option>
        <option value="revenue">Sort: Revenue</option>
        <option value="deploy">Sort: Last deploy</option>
        <option value="updated">Sort: Recently updated</option>
        <option value="client">Sort: Client</option>
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
