import { Suspense } from "react";
import type { Metadata } from "next";
import AiSolutionsBoard, { AiSolutionsBoardSkeleton } from "@/components/admin/cc/panels/AiSolutionsBoard";
import type { AiFilters } from "@/lib/ai/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Solutions" };

const TABS = ["all", "chatbots", "agents", "automations", "templates", "archived"] as const;
const SORTS = ["updated", "revenue", "cost", "margin", "usage", "performance", "name"] as const;
const WINDOWS = ["7d", "30d", "90d"] as const;

/**
 * The AI operations command centre.
 *
 * Filters live in the URL so a view can be bookmarked and shared, and so
 * pressing back out of a solution returns to the same list.
 */
export default async function AiSolutionsPage({
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
  const windowRaw = one("window");

  const filters: AiFilters = {
    q: one("q"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "") ? (tabRaw as AiFilters["tab"]) : "all",
    client: one("client"),
    type: one("type"),
    status: one("status"),
    provider: one("provider"),
    health: one("health"),
    sort: (SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as AiFilters["sort"]) : "updated",
    view: one("view") === "cards" ? "cards" : "table",
    window: (WINDOWS as readonly string[]).includes(windowRaw ?? "")
      ? (windowRaw as AiFilters["window"])
      : "30d",
  };

  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<AiSolutionsBoardSkeleton />}>
      <AiSolutionsBoard filters={filters} />
    </Suspense>
  );
}
