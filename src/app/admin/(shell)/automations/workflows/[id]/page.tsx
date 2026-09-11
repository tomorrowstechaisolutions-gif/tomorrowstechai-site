import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadWorkflowBoard, loadWorkflowDetail } from "@/lib/workflows/queries";
import WorkflowDetailView from "@/components/admin/cc/workflows/WorkflowDetail";

export const dynamic="force-dynamic"; export const metadata:Metadata={title:"Workflow"};
export default async function WorkflowPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const [{id},query]=await Promise.all([params,searchParams]);const get=(key:string)=>{const raw=query[key];return (Array.isArray(raw)?raw[0]:raw)?.slice(0,300)};const [session,detail,board]=await Promise.all([getAdminUser(),createSupabaseServerClient().then(sb=>loadWorkflowDetail(sb,id)),createSupabaseServerClient().then(sb=>loadWorkflowBoard(sb,{sort:"updated",view:"table"}))]);if(!detail)notFound();return <WorkflowDetailView detail={detail} board={board} tab={get("tab")??"overview"} canManage={["owner","admin"].includes(session?.admin.role??"viewer")} notice={get("notice")} error={get("error")}/>}
