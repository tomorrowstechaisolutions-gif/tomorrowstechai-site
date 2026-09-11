import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadWorkflowRun } from "@/lib/workflows/queries";
import WorkflowRunDetail from "@/components/admin/cc/workflows/WorkflowRunDetail";

export const dynamic="force-dynamic";export const metadata:Metadata={title:"Workflow Run"};
export default async function RunPage({params,searchParams}:{params:Promise<{id:string;runId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const [{id,runId},query]=await Promise.all([params,searchParams]);const get=(key:string)=>{const raw=query[key];return(Array.isArray(raw)?raw[0]:raw)?.slice(0,300)};const[session,data]=await Promise.all([getAdminUser(),createSupabaseServerClient().then(sb=>loadWorkflowRun(sb,id,runId))]);if(!data)notFound();return <WorkflowRunDetail data={data} canManage={["owner","admin"].includes(session?.admin.role??"viewer")} notice={get("notice")} error={get("error")}/>}
