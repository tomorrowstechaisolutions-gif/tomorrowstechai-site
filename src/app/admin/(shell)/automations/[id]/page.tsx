import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadAutomationBoard, loadAutomationDetail } from "@/lib/automations/queries";
import AutomationDetailView from "@/components/admin/cc/automations/AutomationDetail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automation" };

export default async function AutomationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]); const one = (key: string) => { const value = query[key]; return (Array.isArray(value) ? value[0] : value)?.slice(0, 120); };
  const [session, detail, board] = await Promise.all([getAdminUser(), createSupabaseServerClient().then((sb) => loadAutomationDetail(sb, id)), createSupabaseServerClient().then((sb) => loadAutomationBoard(sb, { sort: "last_run", view: "table" }))]);
  if (!detail) notFound();
  return <AutomationDetailView detail={detail} board={board} tab={one("tab") ?? "overview"} selectedRunId={one("run")} canManage={["owner","admin"].includes(session?.admin.role ?? "viewer")} />;
}

