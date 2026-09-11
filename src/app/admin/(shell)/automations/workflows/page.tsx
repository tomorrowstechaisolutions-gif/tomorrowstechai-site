import type { Metadata } from "next";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadWorkflowBoard } from "@/lib/workflows/queries";
import type { WorkflowFilters } from "@/lib/workflows/types";
import WorkflowBoardView from "@/components/admin/cc/workflows/WorkflowBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workflows" };
const sorts = ["updated","active","completion","duration","name"];
const views = ["table","cards","runs","templates"];

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const params = await searchParams; const value = (key:string) => { const raw=params[key]; return (Array.isArray(raw)?raw[0]:raw)?.trim().slice(0,120); }; const sort=value("sort")??"updated"; const view=value("view")??"table";
  const filters:WorkflowFilters={q:value("q"),area:value("area")??"all",status:value("status"),owner:value("owner"),health:value("health"),activeRuns:value("activeRuns"),sort:(sorts.includes(sort)?sort:"updated") as WorkflowFilters["sort"],view:(views.includes(view)?view:"table") as WorkflowFilters["view"]};
  const [session,board]=await Promise.all([getAdminUser(),createSupabaseServerClient().then(sb=>loadWorkflowBoard(sb,filters))]);
  return <WorkflowBoardView board={board} filters={filters} canManage={["owner","admin"].includes(session?.admin.role??"viewer")} notice={value("notice")} error={value("error")}/>;
}
