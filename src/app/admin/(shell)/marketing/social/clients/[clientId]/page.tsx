import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSocialCenter } from "@/lib/social/queries";
import SocialCenter from "@/components/admin/cc/social/SocialCenter";

export const dynamic = "force-dynamic";

export default async function ClientSocialCenter({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const supabase = await createSupabaseServerClient();
  const filters = { tab: "queue" as const, client: clientId, view: "table" as const };
  const board = await loadSocialCenter(supabase, filters);
  if (!board.clients.some((client) => client.id === clientId)) notFound();
  return <><div style={{ padding: "18px 28px 0" }}><Link href="/admin/marketing/social">← All social clients</Link></div><SocialCenter board={board} filters={filters}/></>;
}
