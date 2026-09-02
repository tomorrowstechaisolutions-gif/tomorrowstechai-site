import { Suspense } from "react";
import type { Metadata } from "next";
import ProposalsBoard, { ProposalsBoardSkeleton } from "@/components/admin/cc/panels/ProposalsBoard";
import type { ProposalFilters } from "@/lib/proposals/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposals" };

/** "30" → the ISO timestamp 30 days ago. Anything else is ignored. */
function sinceFrom(raw: string | undefined): string | undefined {
  const days = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return undefined;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const filters: ProposalFilters = {
    status: one("status"),
    owner: one("owner"),
    packageKey: one("package"),
    search: one("q"),
    since: sinceFrom(one("since")),
  };

  return (
    <Suspense fallback={<ProposalsBoardSkeleton />}>
      <ProposalsBoard filters={filters} />
    </Suspense>
  );
}
