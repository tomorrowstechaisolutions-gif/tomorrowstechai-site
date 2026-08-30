import { Suspense } from "react";
import type { Metadata } from "next";
import ClientsBoard, { ClientsBoardSkeleton } from "@/components/admin/cc/panels/ClientsBoard";
import AddClient from "@/components/admin/cc/AddClient";
import type { ClientFilters } from "@/lib/clients/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clients" };

/**
 * The client book.
 *
 * Filters live in the URL so a view can be bookmarked and survives pressing
 * back out of a client's page. Everything below reads them on the server —
 * the only client-side code on this screen is the filter bar rewriting the
 * query string and the Add client dialog.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const v = params[key];
    const value = Array.isArray(v) ? v[0] : v;
    return value && value.trim() ? value.trim().slice(0, 120) : undefined;
  };

  const tabRaw = one("tab");
  const healthRaw = one("health");
  const pageRaw = Number.parseInt(one("page") ?? "1", 10);

  const filters: ClientFilters = {
    q: one("q"),
    tab: (["active", "paused", "churned"].includes(tabRaw ?? "")
      ? tabRaw
      : "all") as ClientFilters["tab"],
    service: one("service"),
    owner: one("owner"),
    tag: one("tag"),
    health: (["excellent", "good", "average", "poor"].includes(healthRaw ?? "")
      ? healthRaw
      : undefined) as ClientFilters["health"],
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };

  // The filters are part of the key so changing one re-suspends and shows the
  // skeleton, instead of leaving stale rows on screen while the new set loads.
  const key = JSON.stringify(filters);

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Clients</h1>
          <p>Manage your clients, relationships, projects, services and account health.</p>
        </div>
        <div className="cc-greet-actions">
          <AddClient />
        </div>
      </div>

      <Suspense key={key} fallback={<ClientsBoardSkeleton />}>
        <ClientsBoard filters={filters} />
      </Suspense>
    </>
  );
}
