import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadBrandDetail } from "@/lib/brand/queries";
import BrandKitDetail from "@/components/admin/cc/brand/BrandKitDetail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brand Kit" };

export default async function BrandKitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const [{ id }, query, session] = await Promise.all([params, searchParams, getAdminUser()]);
  const detail = await createSupabaseServerClient().then((sb) => loadBrandDetail(sb, id));
  if (!detail) notFound();
  const raw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  return <BrandKitDetail brand={detail} tab={raw || "overview"} canManage={["owner", "admin"].includes(session?.admin.role ?? "viewer")} />;
}
