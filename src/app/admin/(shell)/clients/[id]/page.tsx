import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadClient } from "@/lib/clients/detail";
import { recordSatisfaction, updateClientBilling, updateClientFields } from "@/app/admin/client-actions";
import { Panel, EmptyState } from "@/components/admin/cc/Panel";
import { BarList, HealthRing, Stars } from "@/components/admin/cc/Viz";
import {
  ago,
  count,
  due,
  initials,
  money,
  pct,
  shortDate,
} from "@/components/admin/cc/format";
import {
  IconArrowRight,
  IconBriefcase,
  IconDollar,
  IconFile,
  IconFunnel,
  IconLink,
  IconMapPin,
  IconPen,
  IconPulse,
  IconRepeat,
  IconStar,
  IconUsers,
} from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const client = await loadClient(supabase, id).catch(() => null);
  return { title: client ? `${client.businessName} — Clients` : "Client" };
}

const STATUS_CHIP: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "t-ok" },
  paused: { label: "Payment failing", tone: "t-warn" },
  churned: { label: "Churned", tone: "t-muted" },
};

/**
 * One client, everything about them.
 *
 * The order is the order the questions get asked: who they are and how
 * healthy the account is, what they pay, what we owe them, what they have
 * paid, and how they arrived.
 */
export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const client = await loadClient(supabase, id);

  if (!client) notFound();

  const status = STATUS_CHIP[client.status] ?? STATUS_CHIP.active;
  const openInvoices = client.invoices.filter((i) => i.status === "sent");
  const openProjects = client.projects.filter(
    (p) => p.completedAt === null && p.stage !== "Complete"
  );

  return (
    <>
      <div className="cc-greet">
        <div className="cc-idhead">
          <span className="cc-mono lg">{initials(client.businessName)}</span>
          <div>
            <h1>{client.businessName}</h1>
            <p>
              {[
                client.businessType,
                [client.city, client.state].filter(Boolean).join(", ") || null,
                `Client since ${shortDate(client.wonAt)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="cc-taglist" style={{ marginTop: 8 }}>
              <span className={`cc-chip ${status.tone}`}>{status.label}</span>
              {client.tags.map((t) => (
                <span key={t} className="cc-chip t-muted">{t}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="cc-greet-actions">
          <Link href="/admin/clients" className="cc-btn">All clients</Link>
          <Link href={`/admin/clients/${client.id}/edit`} className="cc-btn primary">
            <IconPen size={13} /> Edit client
          </Link>
          {client.origin ? (
            <Link href={`/admin/leads/${client.origin.leadId}`} className="cc-btn">
              <IconFunnel size={13} /> Original lead
            </Link>
          ) : null}
        </div>
      </div>

      <div className="cc-board">
        {/* ── Billing ──────────────────────────────────────────────── */}
        <Panel
          title="Subscription & billing"
          icon={<IconRepeat size={15} />}
          className="cc-s8 cc-m2"
          bodyClass="flush"
        >
          <div className="cc-stats">
            <div className="cc-stat">
              <div className="cc-stat-label">Monthly</div>
              <div className="cc-stat-value">{money(client.subscription.mrrCents)}</div>
              <div className="cc-stat-hint">recurring</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Renews</div>
              <div className={`cc-stat-value ${client.subscription.renewsAt === null ? "t-none" : ""}`}>
                {client.subscription.renewsAt ? shortDate(client.subscription.renewsAt) : "no date"}
              </div>
              <div className="cc-stat-hint">
                {client.subscription.renewsAt ? due(client.subscription.renewsAt) : "from Stripe"}
              </div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Lifetime</div>
              <div className="cc-stat-value">{money(client.lifetimeCents)}</div>
              <div className="cc-stat-hint">{count(client.revenue.length)} payments</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Outstanding</div>
              <div className={`cc-stat-value ${openInvoices.length > 0 ? "t-risk" : ""}`}>
                {openInvoices.length > 0
                  ? money(openInvoices.reduce((t, i) => t + i.amountCents, 0))
                  : money(0)}
              </div>
              <div className="cc-stat-hint">
                {openInvoices.length} unpaid link{openInvoices.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="cc-panel-body tight">
            {client.subscription.linked ? (
              <p className="cc-note" style={{ marginTop: 0 }}>
                <IconLink size={12} style={{ display: "inline", verticalAlign: -2 }} />{" "}
                <b>Stripe owns this subscription.</b> The rate, the renewal date
                and whether it is active all come from Stripe and are rewritten
                whenever it sends an update — so they are not editable here. Change
                them in Stripe and they land back within seconds.
              </p>
            ) : (
              <form action={updateClientBilling}>
                <input type="hidden" name="customer_id" value={client.id} />
                <p className="cc-note" style={{ marginTop: 0, marginBottom: 12 }}>
                  No Stripe subscription is attached to this client, so these are
                  yours to set. If one is created later, Stripe takes over and
                  overwrites them.
                </p>
                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cb-mrr">Monthly ($)</label>
                    <input
                      id="cb-mrr"
                      name="mrr"
                      className="cc-input"
                      inputMode="decimal"
                      defaultValue={(client.subscription.mrrCents / 100) || ""}
                    />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cb-status">Status</label>
                    <select id="cb-status" name="status" className="cc-select" defaultValue={client.status}>
                      <option value="active">Active</option>
                      <option value="paused">Payment failing</option>
                      <option value="churned">Churned</option>
                    </select>
                  </div>
                </div>
                <div className="cc-field">
                  <label className="cc-label" htmlFor="cb-renews">Next renewal</label>
                  <input
                    id="cb-renews"
                    name="renews_at"
                    type="date"
                    className="cc-input"
                    defaultValue={client.subscription.renewsAt?.slice(0, 10) ?? ""}
                  />
                </div>
                <button type="submit" className="cc-btn primary">Save billing</button>
              </form>
            )}
          </div>
        </Panel>

        {/* ── Health ───────────────────────────────────────────────── */}
        <Panel
          title="Account health"
          icon={<IconPulse size={15} />}
          className="cc-s4 cc-m1"
          bodyClass="tight"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <HealthRing
              score={client.health.score}
              band={client.health.band}
              untested={client.health.untested}
              size={64}
            />
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 600 }}>{client.health.bandLabel}</div>
              <div className="cc-faint" style={{ fontSize: "0.76rem", lineHeight: 1.5 }}>
                {client.health.untested
                  ? "Nothing has gone wrong — and nothing has been measured either."
                  : client.health.reasons.length === 0
                    ? "Paid up, on schedule, and in touch."
                    : `${client.health.reasons.length} thing${client.health.reasons.length === 1 ? "" : "s"} pulling it down`}
              </div>
            </div>
          </div>

          {client.health.reasons.length > 0 ? (
            <div className="cc-reasons">
              {client.health.reasons.map((r) => (
                <div key={r.label} className="cc-reason">
                  <span className="cc-reason-pts">{r.points}</span>
                  <span>{r.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          <p className="cc-note">
            Recomputed every time this page loads, from invoices, project dates,
            the subscription, silence and the last rating. It is never stored, so
            it cannot go stale.
          </p>
        </Panel>

        {/* ── Projects ─────────────────────────────────────────────── */}
        <Panel
          title="Projects"
          icon={<IconBriefcase size={15} />}
          sub={openProjects.length > 0 ? `${openProjects.length} open` : undefined}
          className="cc-s8 cc-m3"
          bodyClass="flush"
        >
          {client.projects.length === 0 ? (
            <EmptyState
              title="No projects"
              text="A delivery job opens automatically when a build is paid for. Open one by hand from Quick Add if the work came in another way."
              icon={<IconBriefcase size={17} />}
            />
          ) : (
            <div className="cc-scroll">
              <table className="cc-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Type</th>
                    <th>Progress</th>
                    <th>Stage</th>
                    <th>Due</th>
                    <th className="num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {client.projects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={p.href} className="cc-strong cc-link">{p.title}</Link>
                        {p.siteUrl ? (
                          <div className="cc-faint" style={{ fontSize: "0.71rem" }}>{p.siteUrl}</div>
                        ) : null}
                      </td>
                      <td>{p.typeLabel}</td>
                      <td>
                        {p.progress === null ? (
                          <span className="cc-faint">no checklist</span>
                        ) : (
                          <div className="cc-prog">
                            <span className="cc-prog-track">
                              <span
                                className={`cc-prog-fill ${p.daysLate !== null && p.daysLate > 0 ? "t-risk" : ""}`}
                                style={{ width: `${Math.round(p.progress * 100)}%` }}
                              />
                            </span>
                            <span className="cc-prog-n">{pct(p.progress, 0)}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`cc-chip ${p.completedAt ? "t-muted" : p.daysLate !== null && p.daysLate > 0 ? "t-risk" : "t-info"}`}>
                          {p.completedAt ? "Complete" : p.stage}
                        </span>
                      </td>
                      <td>
                        <span style={p.daysLate !== null && p.daysLate > 0 ? { color: "var(--cc-risk)" } : undefined}>
                          {p.completedAt ? shortDate(p.completedAt) : due(p.dueAt)}
                        </span>
                      </td>
                      <td className="num">{p.valueCents > 0 ? money(p.valueCents) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ── Details ──────────────────────────────────────────────── */}
        <Panel
          title="Details"
          icon={<IconUsers size={15} />}
          className="cc-s4 cc-m4"
          bodyClass="tight"
        >
          <form action={updateClientFields}>
            <input type="hidden" name="customer_id" value={client.id} />

            <div className="cc-field">
              <label className="cc-label" htmlFor="cd-biz">Business name</label>
              <input id="cd-biz" name="business_name" className="cc-input" defaultValue={client.businessName} />
            </div>
            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="cd-name">Contact</label>
                <input id="cd-name" name="name" className="cc-input" defaultValue={client.contactName ?? ""} />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="cd-type">Industry</label>
                <input id="cd-type" name="business_type" className="cc-input" defaultValue={client.businessType ?? ""} />
              </div>
            </div>
            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="cd-email">Email</label>
                <input id="cd-email" name="email" type="email" className="cc-input" defaultValue={client.email} />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="cd-phone">Phone</label>
                <input id="cd-phone" name="phone" className="cc-input" defaultValue={client.phone ?? ""} />
              </div>
            </div>
            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="cd-city">City</label>
                <input id="cd-city" name="city" className="cc-input" defaultValue={client.city ?? ""} />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="cd-state">State</label>
                <input id="cd-state" name="state" className="cc-input" defaultValue={client.state ?? ""} />
              </div>
            </div>
            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="cd-owner">Owner</label>
                <input id="cd-owner" name="owner" className="cc-input" defaultValue={client.owner ?? ""} />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="cd-tags">Tags</label>
                <input id="cd-tags" name="tags" className="cc-input" defaultValue={client.tags.join(", ")} placeholder="vip, hosting" />
              </div>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="cd-notes">Internal notes</label>
              <textarea id="cd-notes" name="notes_internal" className="cc-textarea" style={{ minHeight: 70 }} defaultValue={client.notesInternal ?? ""} />
            </div>

            <button type="submit" className="cc-btn primary">Save details</button>
          </form>

          {client.city || client.state ? null : (
            <p className="cc-note">
              <IconMapPin size={12} style={{ display: "inline", verticalAlign: -2 }} /> City
              and state feed Top client locations on the Clients screen. That
              panel stays empty until they are filled in.
            </p>
          )}
        </Panel>

        {/* ── Money ────────────────────────────────────────────────── */}
        <Panel
          title="Invoices"
          icon={<IconFile size={15} />}
          className="cc-s4 cc-m5"
          bodyClass="flush"
        >
          {client.invoices.length === 0 ? (
            <EmptyState
              title="No invoices"
              text="Checkout links are created from the lead's own page, where the amount is typed per job."
              icon={<IconFile size={17} />}
            />
          ) : (
            <div className="cc-feed">
              {client.invoices.map((i) => (
                <div key={i.id} className="cc-feed-item">
                  <span className="cc-feed-main">
                    <span className="cc-feed-title">{i.label}</span>
                    <span className="cc-feed-sub">
                      {i.status === "paid"
                        ? `Paid ${shortDate(i.paidAt)}`
                        : i.expired
                          ? "Checkout link expired"
                          : `Sent ${i.daysOut} day${i.daysOut === 1 ? "" : "s"} ago`}
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span className={`cc-chip ${i.status === "paid" ? "t-ok" : i.expired ? "t-risk" : "t-warn"}`}>
                      {i.status}
                    </span>
                    <span className="cc-feed-when">{money(i.amountCents)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Revenue by service"
          icon={<IconDollar size={15} />}
          sub={money(client.lifetimeCents)}
          className="cc-s4 cc-m6"
          bodyClass="tight"
        >
          {client.revenueByService.length === 0 ? (
            <p className="cc-note" style={{ marginTop: 0 }}>Nothing paid yet.</p>
          ) : (
            <BarList
              rows={client.revenueByService.map((r) => ({
                label: r.label,
                value: r.cents,
                share: r.share,
                valueLabel: money(r.cents),
              }))}
            />
          )}
        </Panel>

        {/* ── Satisfaction ─────────────────────────────────────────── */}
        <Panel
          title="Satisfaction"
          icon={<IconStar size={15} />}
          sub={client.ratings.length > 0 ? `${client.ratings.length} recorded` : undefined}
          className="cc-s4 cc-m7"
          bodyClass="tight"
        >
          {client.ratings.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              {client.ratings.slice(0, 4).map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 9,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--cc-line-soft)",
                  }}
                >
                  <Stars rating={r.rating} />
                  <span className="cc-faint" style={{ fontSize: "0.72rem" }}>
                    {r.occasion.replace(/_/g, " ")}
                  </span>
                  <span className="cc-faint" style={{ fontSize: "0.72rem", marginLeft: "auto" }}>
                    {shortDate(r.recordedAt)}
                  </span>
                </div>
              ))}
              {client.ratings[0]?.note ? (
                <p className="cc-note">&ldquo;{client.ratings[0].note}&rdquo;</p>
              ) : null}
            </div>
          ) : (
            <p className="cc-note" style={{ marginTop: 0, marginBottom: 14 }}>
              Never asked. Worth doing at the 30-day check-in — it is the one
              number here that has to come from them rather than from the data.
            </p>
          )}

          <form action={recordSatisfaction}>
            <input type="hidden" name="customer_id" value={client.id} />

            <div className="cc-field">
              <span className="cc-label">How happy are they?</span>
              <div className="cc-rating-picker">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} style={{ flex: 1, position: "relative" }}>
                    <input
                      className="cc-rating-in"
                      type="radio"
                      name="rating"
                      id={`rate-${n}`}
                      value={n}
                      required
                    />
                    <label className="cc-rating-opt" htmlFor={`rate-${n}`} style={{ display: "block" }}>
                      {n}
                    </label>
                  </span>
                ))}
              </div>
            </div>

            <div className="cc-field">
              <label className="cc-label" htmlFor="cs-occasion">Occasion</label>
              <select id="cs-occasion" name="occasion" className="cc-select" defaultValue="check_in">
                <option value="check_in">Check-in</option>
                <option value="launch">After launch</option>
                <option value="support">Support</option>
                <option value="renewal">Renewal</option>
                <option value="ad_hoc">Came up in conversation</option>
              </select>
            </div>

            <div className="cc-field">
              <label className="cc-label" htmlFor="cs-note">What did they say?</label>
              <textarea id="cs-note" name="note" className="cc-textarea" style={{ minHeight: 56 }} />
            </div>

            <button type="submit" className="cc-btn primary">Record rating</button>
          </form>
        </Panel>

        {/* ── How they arrived ─────────────────────────────────────── */}
        <Panel
          title="How they arrived"
          icon={<IconFunnel size={15} />}
          className="cc-s4 cc-m8"
          bodyClass="tight"
        >
          {client.origin ? (
            <>
              <dl className="cc-kv">
                <dt>Source</dt>
                <dd>{client.origin.source}</dd>
                {client.origin.campaign ? (
                  <>
                    <dt>Campaign</dt>
                    <dd>{client.origin.campaign}</dd>
                  </>
                ) : null}
                {client.origin.utmSource ? (
                  <>
                    <dt>UTM source</dt>
                    <dd>{client.origin.utmSource}</dd>
                  </>
                ) : null}
                {client.origin.landingPage ? (
                  <>
                    <dt>Landed on</dt>
                    <dd>{client.origin.landingPage}</dd>
                  </>
                ) : null}
                <dt>Asked about</dt>
                <dd>
                  {client.origin.servicesInterested.length > 0
                    ? client.origin.servicesInterested.join(", ")
                    : "—"}
                </dd>
                <dt>Enquired</dt>
                <dd>{shortDate(client.origin.createdAt)}</dd>
                <dt>Time to close</dt>
                <dd>
                  {client.origin.daysToClose === 0
                    ? "same day"
                    : `${client.origin.daysToClose} day${client.origin.daysToClose === 1 ? "" : "s"}`}
                </dd>
              </dl>
              <Link href={`/admin/leads/${client.origin.leadId}`} className="cc-cta" style={{ marginTop: 12 }}>
                Open the original lead <IconArrowRight size={13} />
              </Link>
            </>
          ) : (
            <p className="cc-note" style={{ marginTop: 0 }}>
              Added by hand, so there is no lead behind this client and no
              attribution to trace. Clients created by a paid checkout carry
              their whole source trail.
            </p>
          )}
        </Panel>

        {/* ── Timeline ─────────────────────────────────────────────── */}
        <Panel
          title="Timeline"
          icon={<IconPulse size={15} />}
          className="cc-s12 cc-m9"
          bodyClass="flush"
        >
          <div className="cc-timeline">
            {client.timeline.map((t) => (
              <div key={t.id} className="cc-timeline-item">
                <span className="cc-timeline-rail">
                  <span className={`cc-timeline-node k-${t.kind}`} />
                </span>
                <span className="cc-feed-main">
                  <span className="cc-feed-title">{t.title}</span>
                  {t.detail ? <span className="cc-feed-sub">{t.detail}</span> : null}
                </span>
                <span className="cc-feed-when">{ago(t.at)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
