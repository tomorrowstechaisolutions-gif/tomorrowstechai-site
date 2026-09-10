"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "../Icons";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_ORDER,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPE_ORDER,
} from "@/lib/email-marketing/types";

/**
 * Filters live in the URL, same as every other board in this admin.
 *
 * "Every ROMAR Press campaign waiting approval, by open rate" has to be a
 * link you can bookmark and send yourself, so this component only rewrites
 * the query string and the server reads it.
 */

const KEYS = ["q", "client", "status", "type", "audience", "owner", "days", "sort", "view"];

export default function EmailFilters({
  clients,
  audiences,
  owners,
}: {
  clients: { id: string; name: string }[];
  audiences: { id: string; name: string }[];
  owners: string[];
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
  const hasFilters = KEYS.filter((k) => k !== "view" && k !== "days").some((k) => params.get(k));

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
          placeholder="Search campaigns, clients, audiences…"
          aria-label="Search campaigns"
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
        value={value("status")}
        onChange={(event) => set("status", event.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {CAMPAIGN_STATUS_ORDER.map((key) => (
          <option key={key} value={key}>{CAMPAIGN_STATUS_LABELS[key]}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("type")}
        onChange={(event) => set("type", event.target.value)}
        aria-label="Filter by campaign type"
      >
        <option value="">All types</option>
        {CAMPAIGN_TYPE_ORDER.map((key) => (
          <option key={key} value={key}>{CAMPAIGN_TYPE_LABELS[key]}</option>
        ))}
      </select>

      {audiences.length > 0 ? (
        <select
          className="cc-filter-select"
          value={value("audience")}
          onChange={(event) => set("audience", event.target.value)}
          aria-label="Filter by audience"
        >
          <option value="">All audiences</option>
          {audiences.map((audience) => (
            <option key={audience.id} value={audience.id}>{audience.name}</option>
          ))}
        </select>
      ) : null}

      <select
        className="cc-filter-select"
        value={value("days")}
        onChange={(event) => set("days", event.target.value)}
        aria-label="Date range"
      >
        <option value="">Last 30 days</option>
        <option value="7">Last 7 days</option>
        <option value="90">Last 90 days</option>
        <option value="365">Last 12 months</option>
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

      <select
        className="cc-filter-select"
        value={value("sort")}
        onChange={(event) => set("sort", event.target.value)}
        aria-label="Sort campaigns"
      >
        <option value="">Sort: Recently updated</option>
        <option value="scheduled">Sort: Scheduled date</option>
        <option value="open">Sort: Open rate</option>
        <option value="click">Sort: Click rate</option>
        <option value="sent">Sort: Sent volume</option>
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
