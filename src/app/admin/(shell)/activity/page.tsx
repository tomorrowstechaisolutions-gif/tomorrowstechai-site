import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chicagoDate } from "@/lib/time/chicago";
import {
  MAX_LIMIT,
  MODULES,
  PAGE_SIZE,
  RANGES,
  filtersHref,
  groupByDay,
  moduleLabel,
  parseFilters,
  type ActivityFilters,
  type ActivityModuleKey,
} from "@/lib/activity/core";
import { loadActivityCenter } from "@/lib/activity/load";
import { panel } from "@/lib/dashboard/panel";
import { EmptyState, ErrorState } from "@/components/admin/cc/Panel";
import { DateRangeForm, LoadOlderButton } from "@/components/admin/cc/activity/ActivityControls";
import { clockTime, count } from "@/components/admin/cc/format";
import {
  IconAlert,
  IconBriefcase,
  IconCheckSquare,
  IconDollar,
  IconFunnel,
  IconGlobe,
  IconLayers,
  IconMegaphone,
  IconPulse,
  IconSpark,
  IconZap,
} from "@/components/admin/cc/Icons";

/**
 * Activity Center — everything the system has recorded, newest first.
 *
 * A read-time merge over the event logs that already exist (see
 * src/lib/activity/core.ts for the list and the reasoning). Filters live in
 * the URL, like every other board in the admin, so a view is a link.
 */

export const dynamic = "force-dynamic";

const MODULE_ICON: Record<ActivityModuleKey, typeof IconPulse> = {
  leads: IconFunnel,
  projects: IconBriefcase,
  finance: IconDollar,
  marketing: IconMegaphone,
  services: IconZap,
  apps: IconLayers,
  websites: IconGlobe,
  ai: IconSpark,
  tasks: IconCheckSquare,
};

const MODULE_TONE = Object.fromEntries(MODULES.map((m) => [m.key, m.tone])) as Record<
  ActivityModuleKey,
  string
>;

export default async function ActivityCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  // Changing a filter swaps the feed for its skeleton so the click visibly
  // lands. "Load older" keeps the same key, so the list stays put and grows.
  const viewKey = filtersHref({ ...filters, limit: PAGE_SIZE });

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Activity Center</h1>
          <p>Everything the system has recorded across the company, newest first.</p>
        </div>
      </div>

      <div className="cc-board">
        <section className="cc-panel cc-s12">
          <nav className="cc-tabs" aria-label="Filter by module">
            <Link
              href={filtersHref(filters, { module: "all", limit: PAGE_SIZE })}
              className={`cc-tab ${filters.module === "all" ? "is-on" : ""}`}
              aria-current={filters.module === "all" ? "page" : undefined}
            >
              All
            </Link>
            {MODULES.map((m) => (
              <Link
                key={m.key}
                href={filtersHref(filters, { module: m.key, limit: PAGE_SIZE })}
                className={`cc-tab ${filters.module === m.key ? "is-on" : ""}`}
                aria-current={filters.module === m.key ? "page" : undefined}
              >
                {m.label}
              </Link>
            ))}
          </nav>

          <div className="cc-filterbar">
            <div className="cc-act-range" role="group" aria-label="Filter by date">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={filtersHref(filters, { range: r.key, from: null, to: null, limit: PAGE_SIZE })}
                  className={`cc-act-pill ${filters.range === r.key ? "is-on" : ""}`}
                  aria-current={filters.range === r.key ? "true" : undefined}
                >
                  {r.label}
                </Link>
              ))}
              {filters.range === "custom" ? <span className="cc-act-pill is-on">Custom dates</span> : null}
            </div>
            <DateRangeForm
              key={`${filters.module}:${filters.from}:${filters.to}`}
              module={filters.module}
              from={filters.from}
              to={filters.to}
              maxDay={chicagoDate()}
            />
          </div>

          <Suspense key={viewKey} fallback={<FeedSkeleton />}>
            <ActivityFeed filters={filters} />
          </Suspense>
        </section>
      </div>
    </>
  );
}

function FeedSkeleton() {
  return (
    <div className="cc-skel-stack" aria-busy="true" aria-label="Activity loading">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={`cc-skel cc-skel-line ${i % 3 === 0 ? "w-80" : i % 3 === 1 ? "w-100" : "w-60"}`}
        />
      ))}
    </div>
  );
}

async function ActivityFeed({ filters }: { filters: ActivityFilters }) {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const result = await panel("activity-center", () => loadActivityCenter(supabase, filters, now));

  if (!result.ok) return <ErrorState message={result.error} />;

  const { items, hasMore, window, sources, failed } = result.data;
  const groups = groupByDay(items, now);
  const scope = filters.module === "all" ? "across every module" : `in ${moduleLabel(filters.module)}`;
  const allFailed = failed.length > 0 && failed.length === sources.length;

  return (
    <>
      {failed.length > 0 ? (
        <div className="cc-act-warn" role="status">
          <IconAlert size={14} />
          <span>
            {allFailed
              ? "None of the logs could be read just now, so this is not an empty list — it is a failed load. Reload to try again."
              : `Could not read ${failed.length === 1 ? "one log" : `${failed.length} logs`} just now: ${failed.join(", ")}. Everything else below is complete. Reload to try again.`}
          </span>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="cc-act-status">
          Showing <strong>{hasMore ? `the newest ${count(items.length)}` : `all ${count(items.length)}`}</strong>{" "}
          {items.length === 1 ? "event" : "events"} {scope}, {window.label}.
          {filters.module === "all"
            ? " Website deployments are left out of this view because there are hundreds; pick Websites to see them."
            : ""}
        </div>
      ) : null}

      {items.length === 0 && !allFailed ? (
        <EmptyState
          title="Nothing recorded here"
          text={`No events ${scope} for ${window.label}. Try a wider date range or another module.`}
          icon={<IconPulse size={17} />}
        />
      ) : (
        <div className="cc-feed">
          {groups.map((group) => (
            <div key={group.day}>
              <div className="cc-feed-day">
                {group.label}
                <span>
                  {count(group.items.length)} {group.items.length === 1 ? "event" : "events"}
                </span>
              </div>
              {group.items.map((item) => {
                const Icon = MODULE_ICON[item.module] ?? IconPulse;
                return (
                  <Link key={item.id} href={item.href} className="cc-feed-item">
                    <span className={`cc-feed-icon ${MODULE_TONE[item.module]}`}>
                      <Icon size={13} />
                    </span>
                    <span className="cc-feed-main">
                      <span className="cc-feed-title">{item.title}</span>
                      {item.subtitle ? <span className="cc-feed-sub">{item.subtitle}</span> : null}
                    </span>
                    {filters.module === "all" ? (
                      <span className="cc-feed-tag">{moduleLabel(item.module)}</span>
                    ) : null}
                    <span className="cc-feed-when">{clockTime(item.at)}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="cc-act-more">
          {filters.limit >= MAX_LIMIT ? (
            <span>
              This is the newest {count(MAX_LIMIT)}, which is as far as one page goes. Narrow the dates
              or pick a module to reach older events.
            </span>
          ) : (
            <LoadOlderButton href={filtersHref(filters, { limit: filters.limit + PAGE_SIZE })} />
          )}
        </div>
      ) : null}

      <details className="cc-act-sources">
        <summary>What feeds this view ({sources.length} logs)</summary>
        <ul>
          {sources.map((s) => (
            <li key={s.key}>
              <span>{s.label}</span>
              <span>
                {s.rows === null
                  ? "not read"
                  : s.rows === 0
                    ? "nothing in range"
                    : `${count(s.rows)}${s.rows >= filters.limit ? "+" : ""}`}
              </span>
            </li>
          ))}
        </ul>
        <p>
          This page reads the logs the system already keeps; it is not a separate record. Some
          actions leave no log today, so they cannot appear here: editing a client, logging an
          expense, and partner syncs.
        </p>
      </details>
    </>
  );
}
