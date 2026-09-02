"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IconSearch, IconGrid, IconLayers, IconFunnel } from "../Icons";
import {
  TASK_GROUPS, TASK_PRIORITIES, TASK_SORTS, TASK_STATUSES, TASK_TYPES,
  PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS,
} from "@/lib/tasks/config";
import PrioritizeButton from "./PrioritizeButton";

/**
 * Search, filter, sort, group and the view toggle.
 *
 * All of it lives in the URL, like the Clients and Proposals screens — a
 * filtered board is then something you can bookmark, and pressing back after
 * opening a task returns to the list you were actually looking at rather
 * than a reset one.
 */
export default function TaskToolbar({
  owners,
  clients,
  projects,
}: {
  owners: string[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const value = (key: string) => params.get(key) ?? "";
  const view = params.get("view") === "board" ? "board" : "table";
  const showFilters = params.get("filters") === "1"
    || ["status", "type", "priority", "owner", "client", "project"].some((k) => params.get(k));

  const set = (key: string, next: string) => {
    const search = new URLSearchParams(params.toString());
    if (next) search.set(key, next);
    else search.delete(key);
    // Any change to what is being shown puts you back on page one; staying
    // on page four of a result set that now has one page shows nothing.
    if (key !== "page") search.delete("page");
    startTransition(() => router.replace(`${pathname}?${search.toString()}`, { scroll: false }));
  };

  const clearFilters = () => {
    const search = new URLSearchParams(params.toString());
    for (const key of ["status", "type", "priority", "owner", "client", "project", "q", "filters", "page"]) {
      search.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${search.toString()}`, { scroll: false }));
  };

  return (
    <div className="tk-toolbar" data-pending={pending ? "1" : undefined}>
      <div className="tk-toolbar-row">
        <PrioritizeButton />

        <div className="cc-filter-search tk-search">
          <IconSearch size={14} />
          <input
            type="search"
            defaultValue={value("q")}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            onChange={(e) => set("q", e.target.value)}
          />
        </div>

        <button
          type="button"
          className={`cc-btn ${showFilters ? "is-on" : ""}`}
          onClick={() => set("filters", showFilters ? "" : "1")}
          aria-expanded={showFilters}
        >
          <IconFunnel size={13} /> Filter
        </button>

        <select
          className="cc-filter-select"
          value={value("sort") || "due"}
          onChange={(e) => set("sort", e.target.value === "due" ? "" : e.target.value)}
          aria-label="Sort tasks"
        >
          {TASK_SORTS.map((sort) => (
            <option key={sort.key} value={sort.key}>Sort: {sort.label}</option>
          ))}
        </select>

        <select
          className="cc-filter-select"
          value={value("group") || "none"}
          onChange={(e) => set("group", e.target.value === "none" ? "" : e.target.value)}
          aria-label="Group tasks"
        >
          {TASK_GROUPS.map((group) => (
            <option key={group.key} value={group.key}>
              {group.key === "none" ? "Group" : `Group: ${group.label}`}
            </option>
          ))}
        </select>

        <div className="tk-viewtoggle" role="group" aria-label="View">
          <button
            type="button"
            className={view === "table" ? "is-on" : ""}
            onClick={() => set("view", "")}
          >
            <IconGrid size={13} /> Table
          </button>
          <button
            type="button"
            className={view === "board" ? "is-on" : ""}
            onClick={() => set("view", "board")}
          >
            <IconLayers size={13} /> Board
          </button>
        </div>
      </div>

      {showFilters ? (
        <div className="tk-toolbar-row is-filters">
          <select className="cc-filter-select" value={value("status")}
            onChange={(e) => set("status", e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>

          <select className="cc-filter-select" value={value("type")}
            onChange={(e) => set("type", e.target.value)} aria-label="Filter by type">
            <option value="">All types</option>
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>{TYPE_LABELS[type]}</option>
            ))}
          </select>

          <select className="cc-filter-select" value={value("priority")}
            onChange={(e) => set("priority", e.target.value)} aria-label="Filter by priority">
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>
            ))}
          </select>

          {owners.length > 1 ? (
            <select className="cc-filter-select" value={value("owner")}
              onChange={(e) => set("owner", e.target.value)} aria-label="Filter by assignee">
              <option value="">Anyone</option>
              {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
          ) : null}

          {clients.length > 0 ? (
            <select className="cc-filter-select" value={value("client")}
              onChange={(e) => set("client", e.target.value)} aria-label="Filter by client">
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          ) : null}

          {projects.length > 0 ? (
            <select className="cc-filter-select" value={value("project")}
              onChange={(e) => set("project", e.target.value)} aria-label="Filter by project">
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          ) : null}

          <button type="button" className="cc-filter-clear" onClick={clearFilters}>
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
