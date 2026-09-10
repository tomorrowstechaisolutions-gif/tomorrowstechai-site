import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadCampaignDetail, loadEmailChoices } from "@/lib/email-marketing/detail";
import { updateCampaignAction } from "@/app/admin/email-actions";
import {
  APPROVAL_MODE_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_TONE,
  CAMPAIGN_STATUS_TONE,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPE_ORDER,
  RECIPIENT_STATUS_LABELS,
  RECIPIENT_STATUS_TONE,
  SKIP_REASON_LABELS,
  TIMEZONE_OPTIONS,
} from "@/lib/email-marketing/types";
import { EmptyState, Panel } from "@/components/admin/cc/Panel";
import MiniBars from "@/components/admin/cc/MiniBars";
import { ago, count, DASH, money, pct, shortDate } from "@/components/admin/cc/format";
import {
  ApprovalActions, ContentComposer, ScheduleCampaign, SendNow, SendTest, SetAudience,
} from "@/components/admin/cc/email/EmailForms";
import { IconAlert, IconChart, IconMail, IconUsers } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "content", label: "Content" },
  { key: "audience", label: "Audience" },
  { key: "schedule", label: "Schedule" },
  { key: "performance", label: "Performance" },
  { key: "activity", label: "Activity" },
  { key: "settings", label: "Settings" },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("email_campaigns").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ? `${data.name} — Email` : "Campaign" };
}

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const raw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab = TABS.some((t) => t.key === raw) ? (raw as string) : "overview";

  const session = await getAdminUser();
  const canSend = ["owner", "admin"].includes(session?.admin.role ?? "viewer");
  const actorEmail = session?.admin.email ?? "";

  const supabase = await createSupabaseServerClient();
  const [campaign, choices] = await Promise.all([
    loadCampaignDetail(supabase, id),
    loadEmailChoices(supabase),
  ]);

  if (!campaign) notFound();

  const locked = campaign.status === "sent" || campaign.status === "sending";
  const errors = campaign.issues.filter((i) => i.severity === "error");
  const warnings = campaign.issues.filter((i) => i.severity === "warning");

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>{campaign.name}</h1>
          <div className="cc-taglist" style={{ marginTop: 6, marginBottom: 6 }}>
            <span className={`cc-chip ${CAMPAIGN_STATUS_TONE[campaign.status]}`}>{campaign.statusLabel}</span>
            <span className="cc-chip t-muted">{campaign.campaignTypeLabel}</span>
            {campaign.approvalMode !== "none" ? (
              <span className={`cc-chip ${APPROVAL_STATUS_TONE[campaign.approvalStatus]}`}>
                {APPROVAL_STATUS_LABELS[campaign.approvalStatus]}
              </span>
            ) : null}
          </div>
          <p>
            {campaign.client?.name ?? "Tomorrow's Tech AI"}
            {campaign.subject ? ` · ${campaign.subject}` : ""}
          </p>
        </div>
        <div className="cc-greet-actions">
          <Link className="cc-btn" href="/admin/marketing/email">All campaigns</Link>
          {!locked ? <SendTest campaignId={campaign.id} defaultTo={actorEmail} /> : null}
          {canSend && !locked ? (
            <ScheduleCampaign
              campaignId={campaign.id}
              timezone={campaign.timezone}
              audienceSize={campaign.audience?.cachedSize ?? null}
            />
          ) : null}
          {canSend && !locked && campaign.canSendNow ? (
            <SendNow campaignId={campaign.id} recipients={campaign.audience?.cachedSize ?? null} />
          ) : null}
        </div>
      </div>

      <Kpis campaign={campaign} />

      <div className="cc-tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={
              t.key === "overview"
                ? `/admin/marketing/email/campaigns/${campaign.id}`
                : `/admin/marketing/email/campaigns/${campaign.id}?tab=${t.key}`
            }
            className={`cc-tab ${tab === t.key ? "is-on" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="cc-board">
        {tab === "overview" ? (
          <>
            <Panel title="Before this can go out" icon={<IconAlert size={15} />} className="cc-s6">
              {campaign.issues.length === 0 ? (
                <EmptyState
                  title="Ready to send"
                  text="Every pre-send check passes. Send yourself a test first if you have not already."
                />
              ) : (
                <ul className="cc-health">
                  {campaign.issues.map((issue, index) => (
                    <li className="cc-health-row" key={index}>
                      <div className="cc-health-name">{issue.label}</div>
                      <div className="cc-health-detail">{issue.detail}</div>
                      <span className={`cc-chip ${issue.severity === "error" ? "t-risk" : "t-warn"}`}>
                        {issue.severity === "error" ? "Blocks send" : "Warning"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="cc-note">
                {errors.length > 0
                  ? `${errors.length} ${errors.length === 1 ? "problem blocks" : "problems block"} sending. ${warnings.length} warning${warnings.length === 1 ? "" : "s"} can be sent past.`
                  : "The unsubscribe footer and sender identity are added automatically — they are not something you can forget."}
              </p>
            </Panel>

            <Panel title="Campaign" icon={<IconMail size={15} />} className="cc-s6">
              <dl className="cc-kv">
                <dt>Client</dt><dd>{campaign.client?.name ?? "Tomorrow's Tech AI (internal)"}</dd>
                <dt>Type</dt><dd>{campaign.campaignTypeLabel}</dd>
                <dt>Subject</dt><dd>{campaign.subject ?? DASH}</dd>
                <dt>From</dt>
                <dd>
                  {campaign.fromEmail
                    ? `${campaign.fromName ? `${campaign.fromName} ` : ""}<${campaign.fromEmail}>`
                    : DASH}
                </dd>
                <dt>Audience</dt>
                <dd>
                  {campaign.audience ? (
                    <>
                      {campaign.audience.name}
                      {campaign.audience.cachedSize !== null
                        ? ` · ${count(campaign.audience.cachedSize)} can be emailed`
                        : ""}
                    </>
                  ) : DASH}
                </dd>
                <dt>Approval</dt><dd>{APPROVAL_MODE_LABELS[campaign.approvalMode]}</dd>
                {campaign.approvedBy ? (<><dt>Approved by</dt><dd>{campaign.approvedBy} · {shortDate(campaign.approvedAt)}</dd></>) : null}
                {campaign.approvalNotes ? (<><dt>Review notes</dt><dd>{campaign.approvalNotes}</dd></>) : null}
                <dt>Owner</dt><dd>{campaign.owner ?? DASH}</dd>
                <dt>Scheduled</dt>
                <dd>
                  {campaign.scheduledAt
                    ? `${new Date(campaign.scheduledAt).toLocaleString("en-US", { timeZone: campaign.timezone })} (${campaign.timezone})`
                    : DASH}
                </dd>
                <dt>Sent</dt><dd>{campaign.sentAt ? `${shortDate(campaign.sentAt)} · ${ago(campaign.sentAt)}` : DASH}</dd>
                <dt>Last updated</dt><dd>{ago(campaign.updatedAt)}</dd>
              </dl>

              <div style={{ marginTop: 12 }}>
                <ApprovalActions
                  campaignId={campaign.id}
                  approvalMode={campaign.approvalMode}
                  approvalStatus={campaign.approvalStatus}
                  canApprove={canSend}
                />
              </div>
            </Panel>
          </>
        ) : null}

        {tab === "content" ? (
          <Panel title="Content" icon={<IconMail size={15} />} className="cc-s12">
            <ContentComposer
              campaignId={campaign.id}
              initial={campaign.blocks}
              subject={campaign.subject}
              previewText={campaign.previewText}
              fromName={campaign.fromName}
              fromEmail={campaign.fromEmail}
              replyTo={campaign.replyTo}
              tone={campaign.tone}
              readOnly={locked}
            />
          </Panel>
        ) : null}

        {tab === "audience" ? (
          <>
            <Panel title="Audience" icon={<IconUsers size={15} />} className="cc-s6">
              {campaign.audience ? (
                <dl className="cc-kv">
                  <dt>Audience</dt><dd>{campaign.audience.name}</dd>
                  <dt>Who is in it</dt><dd>{campaign.audience.description}</dd>
                  <dt>Can be emailed</dt>
                  <dd title={campaign.audience.cachedAt ? `Counted ${ago(campaign.audience.cachedAt)}` : undefined}>
                    {campaign.audience.cachedSize === null ? DASH : count(campaign.audience.cachedSize)}
                  </dd>
                  <dt>Targeted</dt><dd>{count(campaign.stats.targeted)}</dd>
                  <dt>Skipped</dt>
                  <dd title="Suppressed, unsubscribed, hard bounced or without recorded consent.">
                    {count(campaign.stats.skipped)}
                  </dd>
                </dl>
              ) : (
                <EmptyState
                  title="No audience selected"
                  text="Choose who this campaign is going to. Nothing can be scheduled without one."
                />
              )}
              {!locked ? (
                <div style={{ marginTop: 12 }}>
                  <SetAudience
                    campaignId={campaign.id}
                    audiences={choices.audiences}
                    current={campaign.audience?.id ?? null}
                  />
                </div>
              ) : null}
            </Panel>

            <Panel title="Who was left out" className="cc-s6">
              {campaign.stats.skipped === 0 ? (
                <EmptyState
                  title="Nobody was skipped"
                  text="Every address in this audience was eligible, or the list has not been built yet."
                />
              ) : (
                <>
                  <ul className="cc-health">
                    {Object.entries(
                      campaign.recipients
                        .filter((r) => r.skipReason)
                        .reduce<Record<string, number>>((acc, r) => {
                          acc[r.skipReason!] = (acc[r.skipReason!] ?? 0) + 1;
                          return acc;
                        }, {})
                    ).map(([reason, n]) => (
                      <li className="cc-health-row" key={reason}>
                        <div className="cc-health-name">
                          {SKIP_REASON_LABELS[reason as keyof typeof SKIP_REASON_LABELS] ?? reason}
                        </div>
                        <div className="cc-health-detail">Not emailed</div>
                        <span className="cc-chip t-muted">{count(n)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="cc-note">
                    Skipped recipients are recorded rather than dropped, so this campaign
                    can answer months from now whether a given person was emailed and why
                    not. The sample above comes from the most recent hundred rows.
                  </p>
                </>
              )}
            </Panel>
          </>
        ) : null}

        {tab === "schedule" ? (
          <Panel title="Schedule" className="cc-s12">
            <dl className="cc-kv">
              <dt>Status</dt><dd>{campaign.statusLabel}</dd>
              <dt>Scheduled for</dt>
              <dd>
                {campaign.scheduledAt
                  ? `${new Date(campaign.scheduledAt).toLocaleString("en-US", { timeZone: campaign.timezone })} · ${campaign.timezone}`
                  : "Not scheduled"}
              </dd>
              <dt>Recipients frozen</dt>
              <dd>{campaign.stats.targeted > 0 ? count(campaign.stats.targeted) : "Not built yet"}</dd>
              <dt>Still queued</dt><dd>{count(campaign.stats.pending)}</dd>
            </dl>

            {campaign.failureReason ? (
              <p className="cc-error" style={{ marginTop: 12 }}>{campaign.failureReason}</p>
            ) : null}

            <p className="cc-note">
              Scheduling freezes the recipient list at that moment. A dynamic segment that
              grows afterwards does not change who receives this send, which is what makes
              the number above the number that actually goes out.
            </p>

            {canSend && !locked ? (
              <div className="cc-rowacts" style={{ marginTop: 12 }}>
                <ScheduleCampaign
                  campaignId={campaign.id}
                  timezone={campaign.timezone}
                  audienceSize={campaign.audience?.cachedSize ?? null}
                />
              </div>
            ) : null}
          </Panel>
        ) : null}

        {tab === "performance" ? (
          <>
            <Panel title="Performance" icon={<IconChart size={15} />} className="cc-s8">
              {campaign.stats.sent === 0 ? (
                <EmptyState
                  title="Nothing sent yet"
                  text="Performance appears once this campaign has gone out. Until then there is nothing to measure — which is why every rate reads as a dash rather than zero."
                />
              ) : (
                <>
                  <div className="cc-scroll">
                    <table className="cc-table dense">
                      <tbody>
                        {[
                          ["Sent", count(campaign.stats.sent), "Accepted by the provider"],
                          ["Delivered", count(campaign.stats.delivered), campaign.stats.deliveryRate === null ? "—" : pct(campaign.stats.deliveryRate, 1)],
                          ["Unique opens", count(campaign.stats.uniqueOpens), campaign.stats.openRate === null ? "—" : pct(campaign.stats.openRate, 1)],
                          ["Total opens", count(campaign.stats.totalOpens), "Including repeats"],
                          ["Unique clicks", count(campaign.stats.uniqueClicks), campaign.stats.clickRate === null ? "—" : pct(campaign.stats.clickRate, 1)],
                          ["Click to open", campaign.stats.clickToOpenRate === null ? DASH : pct(campaign.stats.clickToOpenRate, 1), "Of those who opened"],
                          ["Bounced", count(campaign.stats.bounced), campaign.stats.bounceRate === null ? "—" : pct(campaign.stats.bounceRate, 1)],
                          ["Unsubscribed", count(campaign.stats.unsubscribes), campaign.stats.unsubscribeRate === null ? "—" : pct(campaign.stats.unsubscribeRate, 2)],
                          ["Spam complaints", count(campaign.stats.complained), campaign.stats.complaintRate === null ? "—" : pct(campaign.stats.complaintRate, 2)],
                          ["Failed", count(campaign.stats.failed), "Provider rejected the send"],
                        ].map(([label, value, detail]) => (
                          <tr key={label}>
                            <td className="cc-strong">{label}</td>
                            <td className="num">{value}</td>
                            <td className="cc-dim">{detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {campaign.timeline.length > 0 ? (
                    <div style={{ marginTop: 14 }}>
                      <p className="cc-subhead">Opens over time</p>
                      <MiniBars
                        points={campaign.timeline.map((t, i) => ({ key: `${t.label}-${i}`, value: t.opens }))}
                        labelLeft={campaign.timeline[0]?.label}
                        labelRight={campaign.timeline[campaign.timeline.length - 1]?.label}
                        format={(v, k) => `${k.split("-")[0]}: ${v} opens`}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </Panel>

            <div className="cc-s4" style={{ display: "grid", gap: 16, alignContent: "start" }}>
              <Panel title="Conversions">
                <dl className="cc-kv">
                  <dt>Attributed invoices</dt>
                  <dd>{campaign.conversions.count > 0 ? count(campaign.conversions.count) : DASH}</dd>
                  <dt>Attributed revenue</dt>
                  <dd>
                    {campaign.conversions.revenueCents === null
                      ? DASH
                      : money(campaign.conversions.revenueCents)}
                  </dd>
                </dl>
                <p className="cc-note">
                  Direct attribution only — invoices explicitly linked to this campaign.
                  Nothing here is estimated or modelled, so a dash means nothing has been
                  linked, not that nothing was earned.
                </p>
              </Panel>

              <Panel title="Top clicked links">
                {campaign.topLinks.length === 0 ? (
                  <EmptyState title="No clicks recorded" text="Link clicks appear here once the provider reports them." />
                ) : (
                  <ul className="cc-feed">
                    {campaign.topLinks.map((link) => (
                      <li className="cc-feed-item" key={link.url}>
                        <span className="cc-feed-main">
                          <span className="cc-feed-title" style={{ wordBreak: "break-all" }}>{link.url}</span>
                        </span>
                        <span className="cc-chip t-muted">{count(link.clicks)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="Recipient activity" className="cc-s12">
              {campaign.recipients.length === 0 ? (
                <EmptyState title="No recipients yet" text="The send list is built when the campaign is scheduled or sent." />
              ) : (
                <>
                  <div className="cc-scroll">
                    <table className="cc-table dense">
                      <thead>
                        <tr>
                          <th>Recipient</th><th>Status</th><th className="num">Opens</th>
                          <th className="num">Clicks</th><th>Sent</th><th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaign.recipients.map((r) => (
                          <tr key={r.id}>
                            <td>
                              {r.leadId ? (
                                <Link className="cc-link" href={`/admin/leads/${r.leadId}`}>{r.name ?? r.email}</Link>
                              ) : r.customerId ? (
                                <Link className="cc-link" href={`/admin/clients/${r.customerId}`}>{r.name ?? r.email}</Link>
                              ) : (
                                <span className="cc-strong">{r.name ?? r.email}</span>
                              )}
                              <span className="cc-client-sub">{r.email}</span>
                            </td>
                            <td>
                              <span className={`cc-chip ${RECIPIENT_STATUS_TONE[r.status]}`}>
                                {RECIPIENT_STATUS_LABELS[r.status]}
                              </span>
                            </td>
                            <td className="num">{r.openCount > 0 ? count(r.openCount) : <span className="cc-faint">{DASH}</span>}</td>
                            <td className="num">{r.clickCount > 0 ? count(r.clickCount) : <span className="cc-faint">{DASH}</span>}</td>
                            <td className="cc-dim">{r.sentAt ? ago(r.sentAt) : DASH}</td>
                            <td className="cc-dim">
                              {r.skipReason ? SKIP_REASON_LABELS[r.skipReason] : r.bounceType ? `${r.bounceType} bounce` : DASH}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="cc-note">
                    The hundred most recently active recipients. Totals above come from a
                    database aggregate over the whole list, not from this sample.
                  </p>
                </>
              )}
            </Panel>
          </>
        ) : null}

        {tab === "activity" ? (
          <Panel title="Activity" className="cc-s12">
            {campaign.events.length === 0 ? (
              <EmptyState title="Nothing recorded yet" text="Creation, approval, scheduling, sending and failures are all logged here." />
            ) : (
              <ul className="cc-feed">
                {campaign.events.map((e) => (
                  <li className="cc-feed-item" key={e.id}>
                    <span className="cc-feed-main">
                      <span className="cc-feed-title">{e.body}</span>
                      <span className="cc-feed-sub">{e.kind.replace(/_/g, " ")} · {e.actor ?? "system"}</span>
                    </span>
                    <span className="cc-feed-when">{ago(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}

        {tab === "settings" ? (
          <Panel title="Settings" className="cc-s12">
            {!canSend ? (
              <EmptyState title="Read only" text="Changing a campaign is limited to owners and admins." />
            ) : (
              <form action={updateCampaignAction}>
                <input type="hidden" name="campaign_id" value={campaign.id} />

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-name">Campaign name</label>
                    <input id="cs-name" name="name" className="cc-input" required defaultValue={campaign.name} />
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-internal">Internal name</label>
                    <input id="cs-internal" name="internal_name" className="cc-input" defaultValue={campaign.internalName ?? ""} />
                  </div>
                </div>

                <div className="cc-field">
                  <label className="cc-label" htmlFor="cs-desc">Description</label>
                  <textarea id="cs-desc" name="description" className="cc-textarea" rows={2} defaultValue={campaign.description ?? ""} />
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-client">Client</label>
                    <select id="cs-client" name="customer_id" className="cc-select" defaultValue={campaign.client?.id ?? ""}>
                      <option value="">Tomorrow&rsquo;s Tech AI (internal)</option>
                      {choices.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-type">Campaign type</label>
                    <select id="cs-type" name="campaign_type" className="cc-select" defaultValue={campaign.campaignType}>
                      {CAMPAIGN_TYPE_ORDER.map((k) => (
                        <option key={k} value={k}>{CAMPAIGN_TYPE_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-approval">Approval</label>
                    <select id="cs-approval" name="approval_mode" className="cc-select" defaultValue={campaign.approvalMode}>
                      <option value="none">No approval required</option>
                      <option value="internal">Internal approval required</option>
                      <option value="client">Client approval required</option>
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-tz">Timezone</label>
                    <select id="cs-tz" name="timezone" className="cc-select" defaultValue={campaign.timezone}>
                      {TIMEZONE_OPTIONS.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-domain">Sending domain</label>
                    <select id="cs-domain" name="sending_domain_id" className="cc-select" defaultValue={campaign.sendingDomainId ?? ""}>
                      <option value="">Default</option>
                      {choices.sendingDomains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-owner">Owner</label>
                    <input id="cs-owner" name="owner" className="cc-input" list="cs-people" defaultValue={campaign.owner ?? ""} />
                    <datalist id="cs-people">{choices.people.map((p) => <option key={p} value={p} />)}</datalist>
                  </div>
                </div>

                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-brand">Brand profile</label>
                    <select id="cs-brand" name="brand_profile_id" className="cc-select" defaultValue={campaign.brandProfileId ?? ""}>
                      <option value="">None</option>
                      {choices.brandProfiles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="cs-service">Related service</label>
                    <select id="cs-service" name="service_id" className="cc-select" defaultValue={campaign.serviceId ?? ""}>
                      <option value="">None</option>
                      {choices.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="cc-sheet-foot">
                  <button type="submit" className="cc-btn primary">Save changes</button>
                </div>
              </form>
            )}

            <p className="cc-note">
              Turning approval on moves this campaign to Waiting and stops it being
              scheduled until somebody approves it — that refusal is enforced in the
              database, not just on this screen.
            </p>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

function Kpis({ campaign }: { campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>> }) {
  const s = campaign.stats;
  const cards = [
    { label: "Sent", value: s.sent > 0 ? count(s.sent) : DASH, foot: `${count(s.targeted)} targeted` },
    { label: "Delivered", value: s.delivered > 0 ? count(s.delivered) : DASH, foot: s.deliveryRate === null ? "Nothing sent yet" : pct(s.deliveryRate, 1) },
    { label: "Open Rate", value: s.openRate === null ? DASH : pct(s.openRate, 1), foot: `${count(s.uniqueOpens)} unique opens` },
    { label: "Click Rate", value: s.clickRate === null ? DASH : pct(s.clickRate, 1), foot: `${count(s.uniqueClicks)} unique clicks` },
    {
      label: "Conversions",
      value: campaign.conversions.count > 0 ? count(campaign.conversions.count) : DASH,
      foot: campaign.conversions.revenueCents === null ? "No invoice linked" : money(campaign.conversions.revenueCents),
    },
    { label: "Unsubscribes", value: count(s.unsubscribes), foot: s.unsubscribeRate === null ? "Nothing delivered yet" : pct(s.unsubscribeRate, 2) },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((card) => (
        <div className="cc-kpi" key={card.label}>
          <div className="cc-kpi-top"><span className="cc-kpi-label">{card.label}</span></div>
          <div className="cc-kpi-value">{card.value}</div>
          <div className="cc-kpi-foot"><span className="cc-faint">{card.foot}</span></div>
        </div>
      ))}
    </div>
  );
}
