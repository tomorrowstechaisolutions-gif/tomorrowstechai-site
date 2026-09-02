"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch } from "./Icons";
import { PROPOSAL_STATUSES, STATUS_LABELS } from "@/lib/proposals/config";

/**
 * Filters live in the URL, same as the Clients and CRM screens — so a
 * filtered view can be bookmarked, and pressing back after opening a
 * proposal returns to the list you were actually looking at.
 */
export default function ProposalFilters({
  owners,
  packages,
}: {
  owners: string[];
  packages: { key: string; name: string }[];
}) {
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
  const hasFilters = ["q", "status", "owner", "package", "since"].some((k) => params.get(k));

  return (
    <div className="cc-filterbar" data-pending={pending ? "1" : undefined}>
      <div className="cc-filter-search">
        <IconSearch size={14} />
        <input
          type="search"
          defaultValue={value("q")}
          placeholder="Search proposal number, client, email, company…"
          aria-label="Search proposals"
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      <select
        className="cc-filter-select"
        value={value("status")}
        onChange={(e) => set("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        {PROPOSAL_STATUSES.map((status) => (
          <option key={status} value={status}>{STATUS_LABELS[status]}</option>
        ))}
      </select>

      <select
        className="cc-filter-select"
        value={value("package")}
        onChange={(e) => set("package", e.target.value)}
        aria-label="Filter by package"
      >
        <option value="">All packages</option>
        {packages.map((pkg) => (
          <option key={pkg.key} value={pkg.key}>{pkg.name}</option>
        ))}
      </select>

      {owners.length > 1 ? (
        <select
          className="cc-filter-select"
          value={value("owner")}
          onChange={(e) => set("owner", e.target.value)}
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
        value={value("since")}
        onChange={(e) => set("since", e.target.value)}
        aria-label="Filter by date created"
      >
        <option value="">Any date</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
      </select>

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
