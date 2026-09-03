"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "./Icons";
import { INVOICE_SOURCES, INVOICE_STATUSES, SOURCE_LABELS, STATUS_LABELS } from "@/lib/invoices/config";

/**
 * Filters live in the URL, same as the Proposals and CRM screens — so a
 * filtered view can be bookmarked, and pressing back after opening an invoice
 * returns to the list you were actually looking at.
 */
export default function InvoiceFilters({ owners }: { owners: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  };

  const value = (key: string) => params.get(key) ?? "";
  const hasFilters = ["q", "status", "owner", "source", "since"].some((k) => params.get(k));

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search invoice number, client, email…"
          aria-label="Search invoices"
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      <select
        className="cc-filter-select"
        aria-label="Status"
        value={value("status")}
        onChange={(e) => set("status", e.target.value)}
      >
        <option value="">Every status</option>
        <option value="open">Anything still owed</option>
        <option value="overdue">Overdue</option>
        {INVOICE_STATUSES.map((status) => (
          <option key={status} value={status}>{STATUS_LABELS[status]}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        aria-label="Where it came from"
        value={value("source")}
        onChange={(e) => set("source", e.target.value)}
      >
        <option value="">Any origin</option>
        {INVOICE_SOURCES.map((source) => (
          <option key={source} value={source}>{SOURCE_LABELS[source]}</option>
        ))}
      </select>

      {owners.length > 0 ? (
        <select
          className="cc-filter-select"
          aria-label="Owner"
          value={value("owner")}
          onChange={(e) => set("owner", e.target.value)}
        >
          <option value="">Any owner</option>
          {owners.map((owner) => (
            <option key={owner} value={owner}>{owner}</option>
          ))}
        </select>
      ) : null}

      <select
        className="cc-filter-select"
        aria-label="Raised since"
        value={value("since")}
        onChange={(e) => set("since", e.target.value)}
      >
        <option value="">Any time</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="365">Last year</option>
      </select>

      {hasFilters ? (
        <button
          type="button"
          className="cc-btn"
          onClick={() => startTransition(() => router.replace(pathname))}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
