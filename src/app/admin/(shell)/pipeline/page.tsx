import { Suspense } from "react";
import type { Metadata } from "next";
import PipelineBoard, { PipelineBoardSkeleton } from "@/components/admin/cc/panels/PipelineBoard";
import type { PipelineFilters } from "@/lib/pipeline/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({
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

  const filters: PipelineFilters = {
    q: one("q"),
    view: one("view") === "table" ? "table" : "board",
    stage: one("stage"),
    owner: one("owner"),
    company: one("company"),
    service: one("service"),
    source: one("source"),
    attention: one("attention") === "1",
    stale: one("stale") === "1",
  };

  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<PipelineBoardSkeleton />}>
      <PipelineBoard filters={filters} />
    </Suspense>
  );
}
