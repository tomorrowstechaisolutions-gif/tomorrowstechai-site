import { Suspense } from "react";
import type { Metadata } from "next";
import EmailBoard, { EmailBoardSkeleton } from "@/components/admin/cc/panels/EmailBoard";
import type { EmailFilters } from "@/lib/email-marketing/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email Marketing" };

const TABS = ["campaigns", "sequences", "audiences", "templates", "analytics"] as const;
const SORTS = ["updated", "scheduled", "open", "click", "sent", "client"] as const;

/**
 * The multi-client email marketing command centre.
 *
 * Filters live in the URL so a view can be bookmarked and shared — "every
 * ROMAR Press campaign waiting approval" is a link you can send somebody.
 * Everything below reads them on the server.
 */
export default async function EmailMarketingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value && value.trim() ? value.trim().slice(0, 120) : undefined;
  };

  const tabRaw = one("tab");
  const sortRaw = one("sort");
  const daysRaw = Number(one("days"));

  const filters: EmailFilters = {
    q: one("q"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "")
      ? (tabRaw as EmailFilters["tab"])
      : "campaigns",
    client: one("client"),
    status: one("status"),
    type: one("type"),
    audience: one("audience"),
    owner: one("owner"),
    days: ([7, 30, 90, 365] as const).includes(daysRaw as never) ? (daysRaw as 7 | 30 | 90 | 365) : 30,
    sort: (SORTS as readonly string[]).includes(sortRaw ?? "")
      ? (sortRaw as EmailFilters["sort"])
      : "updated",
    view: one("view") === "cards" ? "cards" : "table",
  };

  // The filters are part of the key so changing one re-suspends and shows
  // the skeleton, instead of leaving stale rows on screen.
  const key = JSON.stringify(filters);

  return (
    <Suspense key={key} fallback={<EmailBoardSkeleton />}>
      <EmailBoard filters={filters} />
    </Suspense>
  );
}
