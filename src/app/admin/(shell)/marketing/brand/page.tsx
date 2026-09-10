import type { Metadata } from "next";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadBrandBoard, type BrandFilters } from "@/lib/brand/queries";
import BrandAssetsBoard from "@/components/admin/cc/brand/BrandAssetsBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brand Assets" };

const tabs = ["kits", "assets", "templates", "approvals", "guidelines"];
const sorts = ["name", "updated", "used", "assets", "review"];

export default async function BrandAssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => { const v = params[key]; const s = Array.isArray(v) ? v[0] : v; return s?.trim().slice(0, 120) || undefined; };
  const tab = one("tab") ?? "kits"; const sort = one("sort") ?? "name";
  const filters: BrandFilters = {
    tab: (tabs.includes(tab) ? tab : "kits") as BrandFilters["tab"], q: one("q"), status: one("status"), client: one("client"),
    industry: one("industry"), type: one("type"), sort: (sorts.includes(sort) ? sort : "name") as BrandFilters["sort"], view: one("view") === "list" ? "list" : "grid",
  };
  const [session, board] = await Promise.all([getAdminUser(), createSupabaseServerClient().then((sb) => loadBrandBoard(sb, filters))]);
  return <BrandAssetsBoard board={board} filters={filters} canManage={["owner", "admin"].includes(session?.admin.role ?? "viewer")} />;
}
