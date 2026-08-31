import { Suspense } from "react";
import type { Metadata } from "next";
import ContentBoard, { ContentBoardSkeleton } from "@/components/admin/cc/panels/ContentBoard";
import type { ContentFilters } from "@/lib/content/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Content Studio" };

const TABS = ["all", "draft", "needs_review", "approved", "scheduled"] as const;

export default async function ContentStudioPage({
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

  const filters: ContentFilters = {
    q: one("q"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "")
      ? (tabRaw as ContentFilters["tab"])
      : "all",
    brand: one("brand"),
    platform: one("platform"),
    type: one("type"),
    campaign: one("campaign"),
    ai: one("ai") === "1",
  };

  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<ContentBoardSkeleton />}>
      <ContentBoard filters={filters} />
    </Suspense>
  );
}
