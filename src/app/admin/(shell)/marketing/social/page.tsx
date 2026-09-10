import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSocialCenter } from "@/lib/social/queries";
import type { SocialFilters } from "@/lib/social/types";
import SocialCenter from "@/components/admin/cc/social/SocialCenter";

export const dynamic = "force-dynamic";

const tabs: SocialFilters["tab"][] = ["queue", "calendar", "analytics", "engagement", "media", "automations"];

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SocialCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedTab = scalar(params.tab);
  const filters: SocialFilters = {
    tab: tabs.includes(requestedTab as SocialFilters["tab"]) ? requestedTab as SocialFilters["tab"] : "queue",
    q: scalar(params.q),
    client: scalar(params.client),
    platform: scalar(params.platform),
    status: scalar(params.status),
    approval: scalar(params.approval),
    assigned: scalar(params.assigned),
    from: scalar(params.from),
    to: scalar(params.to),
    post: scalar(params.post),
    view: scalar(params.view) === "grid" ? "grid" : "table",
  };
  const supabase = await createSupabaseServerClient();
  const board = await loadSocialCenter(supabase, filters);
  return <SocialCenter board={board} filters={filters} notice={scalar(params.notice)} error={scalar(params.error)} />;
}
