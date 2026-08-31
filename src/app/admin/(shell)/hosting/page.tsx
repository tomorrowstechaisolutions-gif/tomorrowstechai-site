import { Suspense } from "react";
import type { Metadata } from "next";
import HostingBoard, { HostingBoardSkeleton } from "@/components/admin/cc/panels/HostingBoard";
import type { HostingFilters } from "@/lib/hosting/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hosting" };

const TABS = ["all", "active", "suspended", "pending", "cancelled"] as const;

export default async function HostingPage({
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

  const filters: HostingFilters = {
    q: one("q"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "")
      ? (tabRaw as HostingFilters["tab"])
      : "all",
    plan: one("plan"),
    provider: one("provider"),
    billing: one("billing"),
    health: one("health"),
    attention: one("attention") === "1",
    renewal: (["7", "30", "overdue"].includes(renewalRaw ?? "")
      ? renewalRaw
      : undefined) as HostingFilters["renewal"],
  };

  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<HostingBoardSkeleton />}>
      <HostingBoard filters={filters} />
    </Suspense>
  );
}
