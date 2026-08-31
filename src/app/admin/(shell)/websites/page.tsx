import { Suspense } from "react";
import type { Metadata } from "next";
import WebsitesBoard, { WebsitesBoardSkeleton } from "@/components/admin/cc/panels/WebsitesBoard";
import type { WebsiteFilters } from "@/lib/websites/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Websites" };

const TABS = ["all", "live", "development", "maintenance", "archived"] as const;

/**
 * The website portfolio.
 *
 * Filters live in the URL so a view can be bookmarked and survives pressing
 * back out of a site — "everything needing attention" is a link you can send
 * yourself. Everything below reads them on the server.
 */
export default async function WebsitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const v = params[key];
    const value = Array.isArray(v) ? v[0] : v;
    return value && value.trim() ? value.trim().slice(0, 120) : undefined;
  };

  const tabRaw = one("tab");
  const renewalRaw = one("renewal");

  const filters: WebsiteFilters = {
    q: one("q"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "")
      ? (tabRaw as WebsiteFilters["tab"])
      : "all",
    client: one("client"),
    type: one("type"),
    status: one("status"),
    owner: one("owner"),
    attention: one("attention") === "1",
    renewal: (["7", "30", "overdue"].includes(renewalRaw ?? "")
      ? renewalRaw
      : undefined) as WebsiteFilters["renewal"],
  };

  // The filters are part of the key so changing one re-suspends and shows the
  // skeleton, instead of leaving stale rows on screen while the new set loads.
  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<WebsitesBoardSkeleton />}>
      <WebsitesBoard filters={filters} />
    </Suspense>
  );
}
