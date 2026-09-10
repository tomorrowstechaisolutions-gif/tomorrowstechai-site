import { Suspense } from "react";
import type { Metadata } from "next";
import SoftwareBoard, { SoftwareBoardSkeleton } from "@/components/admin/cc/panels/SoftwareBoard";
import type { SoftwareFilters } from "@/lib/software/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Software" };

const TABS = ["all", "live", "development", "beta", "testing", "archived"] as const;
const SORTS = ["updated", "mrr", "clients", "version", "health", "name"] as const;

/**
 * The software product portfolio.
 *
 * Filters live in the URL so a view can be bookmarked, shared and survives
 * pressing back out of a product — "every live product with a warning, by
 * MRR" is a link you can send yourself. Everything below reads them on the
 * server.
 */
export default async function SoftwarePage({
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

  const filters: SoftwareFilters = {
    q: one("q"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "")
      ? (tabRaw as SoftwareFilters["tab"])
      : "all",
    type: one("type"),
    status: one("status"),
    industry: one("industry"),
    health: one("health"),
    owner: one("owner"),
    client: one("client"),
    sort: (SORTS as readonly string[]).includes(sortRaw ?? "")
      ? (sortRaw as SoftwareFilters["sort"])
      : "updated",
    view: one("view") === "cards" ? "cards" : "table",
    months: one("months") === "3" ? 3 : one("months") === "12" ? 12 : 6,
  };

  // The filters are part of the key so changing one re-suspends and shows
  // the skeleton, instead of leaving stale rows on screen while the new set
  // loads.
  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<SoftwareBoardSkeleton />}>
      <SoftwareBoard filters={filters} />
    </Suspense>
  );
}
