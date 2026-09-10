import { Suspense } from "react";
import type { Metadata } from "next";
import AppsBoard, { AppsBoardSkeleton } from "@/components/admin/cc/panels/AppsBoard";
import type { AppFilters } from "@/lib/apps/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Apps" };

const TABS = ["all", "live", "development", "attention", "archived"] as const;
const SORTS = ["name", "health", "revenue", "deploy", "updated", "client"] as const;

/**
 * The application portfolio.
 *
 * Filters live in the URL so a view can be bookmarked, shared and survives
 * pressing back out of an app — "every client app with a critical signal,
 * by revenue" is a link you can send yourself. Everything below reads them
 * on the server.
 */
export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value && value.trim() ? value.trim().slice(0, 120) : undefined;
  };

  const tabRaw = one("tab");
  const sortRaw = one("sort");

  const filters: AppFilters = {
    q: one("q"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "") ? (tabRaw as AppFilters["tab"]) : "all",
    status: one("status"),
    platform: one("platform"),
    ownership: one("ownership"),
    health: one("health"),
    environment: one("environment"),
    client: one("client"),
    sort: (SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as AppFilters["sort"]) : "name",
    view: one("view") === "cards" ? "cards" : "table",
  };

  // The filters are part of the key so changing one re-suspends and shows
  // the skeleton, instead of leaving stale rows on screen while the new set
  // loads.
  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<AppsBoardSkeleton />}>
      <AppsBoard filters={filters} />
    </Suspense>
  );
}
