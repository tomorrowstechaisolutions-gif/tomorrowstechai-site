import { Suspense } from "react";
import type { Metadata } from "next";
import InvoicesBoard, { InvoicesBoardSkeleton } from "@/components/admin/cc/panels/InvoicesBoard";
import type { InvoiceFilters } from "@/lib/invoices/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoices" };

/** "30" → the ISO timestamp 30 days ago. Anything else is ignored. */
function sinceFrom(raw: string | undefined): string | undefined {
  const days = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(days) || days <= 0 || days > 3650) return undefined;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const filters: InvoiceFilters = {
    status: one("status"),
    owner: one("owner"),
    source: one("source"),
    search: one("q"),
    since: sinceFrom(one("since")),
  };

  return (
    <Suspense fallback={<InvoicesBoardSkeleton />}>
      <InvoicesBoard filters={filters} />
    </Suspense>
  );
}
