import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdEditor } from "@/components/admin/AdEditor";
import { STATUS_TONE } from "@/lib/campaign/ads";
import type { AdCreative } from "@/lib/supabase/types";
import { cloneAd, deleteAd, updateAd } from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const ad = data as AdCreative;

  const { data: parent } = ad.parent_id
    ? await supabase
        .from("ad_creatives")
        .select("id, name")
        .eq("id", ad.parent_id)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <header className="ad-head">
        <Link href="/admin/marketing/ads" className="ad-link">
          ← Back to Ad Studio
        </Link>
        <h1>{ad.name}</h1>
        <p>
          <span className={`ad-tag s-${STATUS_TONE[ad.status]}`}>{ad.status}</span>{" "}
          {ad.campaign}
          {ad.adset ? ` · ${ad.adset}` : ""} ·{" "}
          {ad.generated_by === "ai" ? "written by Claude" : "written by you"}
          {parent && (
            <>
              {" "}
              · cloned from{" "}
              <Link href={`/admin/marketing/ads/${parent.id}`} className="ad-link">
                {parent.name}
              </Link>
            </>
          )}
          {ad.first_run_at &&
            ` · first ran ${new Date(ad.first_run_at).toLocaleDateString("en-US")}`}
        </p>
      </header>

      <AdEditor ad={ad} action={updateAd} />

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Make another like it</h2>
        </div>
        <p className="ad-note">
          Cloning copies everything into a new draft with a fresh name, so the
          original keeps running and its numbers stay clean.
        </p>
        <div className="ad-filters" style={{ marginTop: 12, marginBottom: 0 }}>
          <form action={cloneAd}>
            <input type="hidden" name="id" value={ad.id} />
            <button type="submit" className="ad-btn">
              Clone this ad
            </button>
          </form>
          <form action={deleteAd}>
            <input type="hidden" name="id" value={ad.id} />
            <button type="submit" className="ad-btn ghost">
              Delete
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
