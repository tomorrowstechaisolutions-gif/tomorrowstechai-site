import type { Metadata } from "next";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadAutomationBoard } from "@/lib/automations/queries";
import type { AutomationFilters } from "@/lib/automations/types";
import AutomationBoard from "@/components/admin/cc/automations/AutomationBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automations" };

const SORTS = ["last_run", "runs", "success", "updated", "name"];
export default async function AutomationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const one = (key: string) => { const value = params[key]; const result = Array.isArray(value) ? value[0] : value; return result?.trim().slice(0, 120) || undefined; };
  const sort = one("sort") ?? "last_run"; const view = one("view") ?? "table";
  const filters: AutomationFilters = { q: one("q"), category: one("category") ?? "all", status: one("status"), trigger: one("trigger"), owner: one("owner"), health: one("health"), lastRun: one("lastRun"), sort: (SORTS.includes(sort) ? sort : "last_run") as AutomationFilters["sort"], view: (["table","cards","runs","templates"].includes(view) ? view : "table") as AutomationFilters["view"] };
  const [session, board] = await Promise.all([getAdminUser(), createSupabaseServerClient().then((sb) => loadAutomationBoard(sb, filters))]);
  return <AutomationBoard board={board} filters={filters} canManage={["owner","admin"].includes(session?.admin.role ?? "viewer")} />;
}
