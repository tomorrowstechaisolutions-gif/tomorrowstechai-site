import { Suspense } from "react";
import type { Metadata } from "next";
import CrmBoard, { CrmBoardSkeleton } from "@/components/admin/cc/panels/CrmBoard";
import type { CrmFilters } from "@/lib/crm/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CRM" };

const TABS = ["contacts", "companies", "deals", "activity"] as const;

export default async function CrmPage({
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

  const filters: CrmFilters = {
    q: one("q"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "")
      ? (tabRaw as CrmFilters["tab"])
      : "contacts",
    stage: one("stage"),
    owner: one("owner"),
    company: one("company"),
    status: one("status"),
  };

  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<CrmBoardSkeleton />}>
      <CrmBoard filters={filters} />
    </Suspense>
  );
}
