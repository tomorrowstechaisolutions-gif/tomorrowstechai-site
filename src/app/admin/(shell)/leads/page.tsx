import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LEAD_STATUSES, type Lead } from "@/lib/supabase/types";
import { scoreBand } from "@/lib/campaign/scoring";

export const dynamic = "force-dynamic";

type Search = {
  status?: string;
  q?: string;
  source?: string;
  sort?: string;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase.from("leads").select("*").limit(200);

  if (sp.status && LEAD_STATUSES.includes(sp.status as (typeof LEAD_STATUSES)[number])) {
    query = query.eq("lead_status", sp.status);
  }
  if (sp.source) query = query.eq("source", sp.source);
  if (sp.q) {
    // Escape the PostgREST or() delimiters before interpolating.
    const term = sp.q.replace(/[,()*]/g, " ").trim().slice(0, 80);
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,business_name.ilike.%${term}%,phone.ilike.%${term}%`
      );
    }
  }

  query =
    sp.sort === "score"
      ? query.order("lead_score", { ascending: false })
      : query.order("created_at", { ascending: false });

  const { data, error } = await query;
  const leads = (data ?? []) as Lead[];

  return (
    <>
      <header className="ad-head">
        <h1>Leads</h1>
        <p>
          Every lead from every source, in one pipeline. Meta Instant Forms land
          here too.
        </p>
      </header>

      <form className="ad-filters" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search name, business, email or phone"
          className="ad-input grow"
        />
        <select name="status" defaultValue={sp.status ?? ""} className="ad-input">
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={sp.source ?? ""} className="ad-input">
          <option value="">All sources</option>
          <option value="website">Website</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
        </select>
        <select name="sort" defaultValue={sp.sort ?? "recent"} className="ad-input">
          <option value="recent">Newest first</option>
          <option value="score">Highest score first</option>
        </select>
        <button type="submit" className="ad-btn primary">
          Apply
        </button>
        <Link href="/admin/leads" className="ad-btn ghost">
          Reset
        </Link>
      </form>

      {error && <p className="ad-error">Could not load leads: {error.message}</p>}

      <section className="ad-panel">
        {leads.length === 0 ? (
          <p className="ad-empty">No leads match these filters.</p>
        ) : (
          <div className="ad-table-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Business</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Campaign</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last contact</th>
                  <th>Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/admin/leads/${l.id}`} className="ad-link">
                        {l.first_name} {l.last_name}
                      </Link>
                    </td>
                    <td>{l.business_name ?? "—"}</td>
                    <td>
                      {l.phone ? (
                        <a href={`tel:${l.phone}`} className="ad-link">
                          {l.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <a href={`mailto:${l.email}`} className="ad-link">
                        {l.email}
                      </a>
                    </td>
                    <td>{l.business_type ?? "—"}</td>
                    <td>{l.source}</td>
                    <td>{l.campaign ?? l.utm_campaign ?? "—"}</td>
                    <td>
                      <span className={`ad-score t-${scoreBand(l.lead_score).tone}`}>
                        {l.lead_score}
                      </span>
                    </td>
                    <td>
                      <span className="ad-tag">{l.lead_status}</span>
                    </td>
                    <td>{new Date(l.created_at).toLocaleDateString("en-US")}</td>
                    <td>
                      {l.last_contacted_at
                        ? new Date(l.last_contacted_at).toLocaleDateString("en-US")
                        : "—"}
                    </td>
                    <td>
                      {l.next_followup_at
                        ? new Date(l.next_followup_at).toLocaleDateString("en-US")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
