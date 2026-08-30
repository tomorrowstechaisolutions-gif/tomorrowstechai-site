import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LEAD_STATUSES,
  type CatalogItem,
  REVENUE_CATEGORIES,
  type Lead,
  type LeadEvent,
  type RevenueEvent,
  type Appointment,
} from "@/lib/supabase/types";
import { scoreBand } from "@/lib/campaign/scoring";
import { PaymentLinkButton } from "@/components/admin/PaymentLinkButton";
import { SellUpsellButton } from "@/components/admin/SellUpsellButton";
import { fmtMoney } from "@/lib/campaign/metrics";
import {
  addAppointment,
  addLeadNote,
  addRevenue,
  recordLaunchSale,
  updateLeadFields,
  updateLeadStatus,
} from "../../../actions";

export const dynamic = "force-dynamic";

function dateInput(value: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: leadRow } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!leadRow) notFound();
  const lead = leadRow as Lead;

  const [
    { data: eventRows },
    { data: revenueRows },
    { data: apptRows },
    { data: followups },
    { data: openInvoice },
    { data: catalogRows },
  ] = await Promise.all([
      supabase
        .from("lead_events")
        .select("*")
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("revenue_events")
        .select("*")
        .eq("lead_id", id)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("*")
        .eq("lead_id", id)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("lead_followups")
        .select("step, status, due_at, sent_at")
        .eq("lead_id", id)
        .order("due_at", { ascending: true }),
      // The live payment link, if one has already been created for this lead.
      supabase
        .from("invoices")
        .select("checkout_url, status")
        .eq("lead_id", id)
        .eq("status", "sent")
        .eq("kind", "launch")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("catalog_items")
        .select("*")
        .eq("active", true)
        .order("position", { ascending: true }),
    ]);

  const events = (eventRows ?? []) as LeadEvent[];
  const revenue = (revenueRows ?? []) as RevenueEvent[];
  const appointments = (apptRows ?? []) as Appointment[];

  const initial = revenue.filter((r) => r.kind === "initial").reduce((s, r) => s + r.amount_cents, 0);
  const recurring = revenue.filter((r) => r.kind === "recurring").reduce((s, r) => s + r.amount_cents, 0);
  const upsell = revenue.filter((r) => r.kind === "upsell").reduce((s, r) => s + r.amount_cents, 0);
  const lifetime = initial + recurring + upsell;

  const band = scoreBand(lead.lead_score);

  return (
    <>
      <header className="ad-head">
        <Link href="/admin/leads" className="ad-link">
          ← Back to pipeline
        </Link>
        <h1>
          {lead.first_name} {lead.last_name}
        </h1>
        <p>
          {lead.business_name ?? "No business name"} ·{" "}
          {lead.business_type ?? "Type not given"} · from {lead.source}
        </p>
      </header>

      <div className="ad-two">
        <div className="ad-col-main">
          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Contact</h2>
              <span className={`ad-score t-${band.tone}`}>
                {lead.lead_score} · {band.label}
              </span>
            </div>
            <dl className="ad-dl">
              <div>
                <dt>Phone</dt>
                <dd>
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="ad-link">
                      {lead.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${lead.email}`} className="ad-link">
                    {lead.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Has a website</dt>
                <dd>{lead.current_website ?? "—"}</dd>
              </div>
              <div>
                <dt>Timeline</dt>
                <dd>{lead.timeline ?? "—"}</dd>
              </div>
              <div>
                <dt>Needs</dt>
                <dd>
                  {lead.services_interested.length
                    ? lead.services_interested.join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Submissions</dt>
                <dd>{lead.submission_count}</dd>
              </div>
              <div>
                <dt>SMS consent</dt>
                <dd>{lead.sms_consent ? "Given" : "Not given — do not text"}</dd>
              </div>
              <div>
                <dt>Do not contact</dt>
                <dd>{lead.do_not_contact ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Why this score</h2>
            </div>
            <ul className="ad-reasons">
              {(lead.lead_score_reasons ?? []).length === 0 && (
                <li className="ad-empty">No scoring signals recorded.</li>
              )}
              {(lead.lead_score_reasons ?? []).map((r, i) => (
                <li key={`${r.label}-${i}`}>
                  <span className="ad-reason-pts">+{r.points}</span>
                  {r.label}
                </li>
              ))}
            </ul>
            <p className="ad-note">
              The score orders your day. It never rejects a lead and never
              changes a status on its own.
            </p>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Log activity</h2>
            </div>
            <form action={addLeadNote} className="ad-form-inline">
              <input type="hidden" name="lead_id" value={lead.id} />
              <select name="type" className="ad-input" defaultValue="note">
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="email_sent">Email sent</option>
                <option value="sms">Text sent</option>
              </select>
              <textarea
                name="body"
                rows={3}
                required
                placeholder="What happened?"
                className="ad-input grow"
              />
              <button type="submit" className="ad-btn primary">
                Add
              </button>
            </form>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Activity</h2>
            </div>
            <ol className="ad-timeline">
              {events.length === 0 && <li className="ad-empty">Nothing logged yet.</li>}
              {events.map((e) => (
                <li key={e.id}>
                  <span className="ad-timeline-when">
                    {new Date(e.created_at).toLocaleString("en-US")}
                  </span>
                  <span className="ad-timeline-type">{e.type.replace(/_/g, " ")}</span>
                  <p>{e.body}</p>
                  <span className="ad-timeline-actor">{e.actor}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="ad-col-side">
          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Status</h2>
            </div>
            <form action={updateLeadStatus} className="ad-form">
              <input type="hidden" name="lead_id" value={lead.id} />
              <select
                name="lead_status"
                defaultValue={lead.lead_status}
                className="ad-input"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                name="lost_reason"
                placeholder="Reason (if lost)"
                defaultValue={lead.lost_reason ?? ""}
                className="ad-input"
              />
              <button type="submit" className="ad-btn primary">
                Save status
              </button>
            </form>
            <div className="ad-form mt">
              <PaymentLinkButton leadId={lead.id} existingUrl={openInvoice?.checkout_url ?? null} />
            </div>
            <div className="ad-form mt">
              <SellUpsellButton items={(catalogRows ?? []) as CatalogItem[]} leadId={lead.id} />
            </div>
            <form action={recordLaunchSale} className="ad-form mt">
              <input type="hidden" name="lead_id" value={lead.id} />
              <button type="submit" className="ad-btn ghost">
                Paid another way — mark won and record it
              </button>
            </form>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Ownership &amp; follow-up</h2>
            </div>
            <form action={updateLeadFields} className="ad-form">
              <input type="hidden" name="lead_id" value={lead.id} />
              <label className="ad-field">
                <span className="ad-label">Assigned to</span>
                <input
                  name="assigned_to"
                  defaultValue={lead.assigned_to ?? ""}
                  className="ad-input"
                />
              </label>
              <label className="ad-field">
                <span className="ad-label">Next follow-up</span>
                <input
                  name="next_followup_at"
                  type="date"
                  defaultValue={dateInput(lead.next_followup_at)}
                  className="ad-input"
                />
              </label>
              <label className="ad-field">
                <span className="ad-label">Internal notes</span>
                <textarea
                  name="notes"
                  rows={4}
                  defaultValue={lead.notes ?? ""}
                  className="ad-input"
                />
              </label>
              <label className="ad-check">
                <input
                  type="checkbox"
                  name="do_not_contact"
                  defaultChecked={lead.do_not_contact}
                />
                <span>Do not contact — stops all automated follow-up</span>
              </label>
              <button type="submit" className="ad-btn primary">
                Save
              </button>
            </form>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Automated follow-up</h2>
            </div>
            <ul className="ad-followups">
              {(followups ?? []).length === 0 && (
                <li className="ad-empty">Nothing queued.</li>
              )}
              {(followups ?? []).map((f) => (
                <li key={f.step}>
                  <span className="ad-tag">{f.step.replace(/_/g, " ")}</span>
                  <span>{f.status}</span>
                  <span className="ad-muted">
                    {f.sent_at
                      ? `sent ${new Date(f.sent_at).toLocaleDateString("en-US")}`
                      : `due ${new Date(f.due_at).toLocaleDateString("en-US")}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Appointments</h2>
            </div>
            <form action={addAppointment} className="ad-form">
              <input type="hidden" name="lead_id" value={lead.id} />
              <input
                name="scheduled_at"
                type="datetime-local"
                required
                className="ad-input"
              />
              <button type="submit" className="ad-btn">
                Book
              </button>
            </form>
            <ul className="ad-followups mt">
              {appointments.length === 0 && <li className="ad-empty">None booked.</li>}
              {appointments.map((a) => (
                <li key={a.id}>
                  <span>
                    {a.scheduled_at
                      ? new Date(a.scheduled_at).toLocaleString("en-US")
                      : "—"}
                  </span>
                  <span className="ad-tag">{a.status}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Revenue</h2>
            </div>
            <dl className="ad-dl tight">
              <div>
                <dt>Initial</dt>
                <dd>{fmtMoney(initial / 100)}</dd>
              </div>
              <div>
                <dt>Recurring</dt>
                <dd>{fmtMoney(recurring / 100)}</dd>
              </div>
              <div>
                <dt>Upsell</dt>
                <dd>{fmtMoney(upsell / 100)}</dd>
              </div>
              <div>
                <dt>Lifetime</dt>
                <dd>
                  <strong>{fmtMoney(lifetime / 100)}</strong>
                </dd>
              </div>
            </dl>
            <form action={addRevenue} className="ad-form mt">
              <input type="hidden" name="lead_id" value={lead.id} />
              <select name="kind" className="ad-input" defaultValue="upsell">
                <option value="initial">Initial</option>
                <option value="recurring">Recurring</option>
                <option value="upsell">Upsell</option>
              </select>
              <select name="category" className="ad-input" defaultValue="other">
                {REVENUE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <input name="amount" placeholder="Amount, e.g. 399" className="ad-input" />
              <input name="description" placeholder="Description" className="ad-input" />
              <input name="occurred_at" type="date" className="ad-input" />
              <button type="submit" className="ad-btn primary">
                Record revenue
              </button>
            </form>
            {revenue.length > 0 && (
              <ul className="ad-followups mt">
                {revenue.map((r) => (
                  <li key={r.id}>
                    <span>{fmtMoney(r.amount_cents / 100)}</span>
                    <span className="ad-tag">{r.kind}</span>
                    <span className="ad-muted">
                      {new Date(r.occurred_at).toLocaleDateString("en-US")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Attribution</h2>
            </div>
            <dl className="ad-dl tight">
              <div>
                <dt>Source</dt>
                <dd>{lead.source}</dd>
              </div>
              <div>
                <dt>Campaign</dt>
                <dd>{lead.campaign ?? "—"}</dd>
              </div>
              <div>
                <dt>Ad set</dt>
                <dd>{lead.adset ?? "—"}</dd>
              </div>
              <div>
                <dt>Ad</dt>
                <dd>{lead.ad ?? "—"}</dd>
              </div>
              <div>
                <dt>Placement</dt>
                <dd>{lead.placement ?? "—"}</dd>
              </div>
              <div>
                <dt>utm_source</dt>
                <dd>{lead.utm_source ?? "—"}</dd>
              </div>
              <div>
                <dt>utm_medium</dt>
                <dd>{lead.utm_medium ?? "—"}</dd>
              </div>
              <div>
                <dt>utm_campaign</dt>
                <dd>{lead.utm_campaign ?? "—"}</dd>
              </div>
              <div>
                <dt>Landing page</dt>
                <dd className="ad-break">{lead.landing_page ?? "—"}</dd>
              </div>
              <div>
                <dt>Referrer</dt>
                <dd className="ad-break">{lead.referrer ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
