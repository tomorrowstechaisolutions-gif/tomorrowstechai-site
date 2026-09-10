import Link from "next/link";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadEmailBoard, type EmailBoard as Board, type EmailFilters } from "@/lib/email-marketing/queries";
import {
  loadAudiences, loadEmailChoices, loadSequences, loadTemplates,
  type AudienceRow, type SequenceRow, type TemplateRow,
} from "@/lib/email-marketing/detail";
import {
  AUDIENCE_TYPE_LABELS,
  CAMPAIGN_STATUS_TONE,
  DMARC_TONE,
  DNS_TONE,
  ENROLLMENT_TRIGGER_LABELS,
  HEALTH_TONE,
  PROVIDER_TONE,
  SEQUENCE_STATUS_LABELS,
  SEQUENCE_STATUS_TONE,
  TEMPLATE_CATEGORY_LABELS,
} from "@/lib/email-marketing/types";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import MiniBars from "../MiniBars";
import { ago, count, DASH, pct, shortDate } from "../format";
import CampaignRowActions from "../email/CampaignRowActions";
import EmailFiltersBar from "../email/EmailFilters";
import {
  AudienceSheet, DomainSheet, CheckDomainButton, EnrollSheet, ImportContacts,
  NewCampaign, RefreshSize, SequenceSheet, SequenceStatusButton, SuppressSheet, TemplateSheet,
} from "../email/EmailForms";
import {
  IconAlert, IconChart, IconLayers, IconMail, IconPulse,
  IconRepeat, IconSend, IconUsers, IconZap,
} from "../Icons";

/**
 * The multi-client email marketing command centre.
 *
 * Two rules run through every panel here.
 *
 * The first is the one every board in this admin follows: a number appears
 * only when something measured it. An open rate with nothing sent is a dash,
 * not 0%, because "nobody opened it" and "it has not gone out" are different
 * facts and only one of them says anything about the copy.
 *
 * The second is specific to email and is the reason Sending Health looks
 * pessimistic on a fresh install: NOTHING IS MARKED VERIFIED WITHOUT A REAL
 * CHECK. SPF, DKIM and DMARC all start Unknown and only a live provider
 * lookup moves them. A row of green ticks nobody earned is how a domain
 * quietly starts landing in spam.
 */

/* ── The six numbers ───────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;
  const sentDelta =
    k.sentLastMonth > 0 ? (k.sentThisMonth - k.sentLastMonth) / k.sentLastMonth : null;

  const cards = [
    {
      label: "Active Campaigns",
      value: count(k.activeCampaigns),
      icon: <IconMail size={15} />,
      foot: <span className="cc-faint">Of {count(k.totalCampaigns)} total campaigns</span>,
      href: "/admin/marketing/email",
    },
    {
      label: "Emails Sent This Month",
      value: count(k.sentThisMonth),
      icon: <IconSend size={15} />,
      foot: (
        <span className={sentDelta === null ? "cc-faint" : sentDelta >= 0 ? "cc-delta up" : "cc-delta down"}>
          {sentDelta === null
            ? "No sends last month to compare"
            : `${pct(sentDelta, 0)} on ${count(k.sentLastMonth)} last month`}
        </span>
      ),
      href: "/admin/marketing/email?tab=analytics",
    },
    {
      label: "Open Rate",
      value: k.openRate === null ? DASH : pct(k.openRate, 1),
      icon: <IconChart size={15} />,
      foot: (
        <span className="cc-faint">
          {k.openRate === null ? "Nothing delivered in this window" : "Unique opens, of delivered"}
        </span>
      ),
      href: "/admin/marketing/email?sort=open",
    },
    {
      label: "Click Rate",
      value: k.clickRate === null ? DASH : pct(k.clickRate, 1),
      icon: <IconZap size={15} />,
      foot: (
        <span className="cc-faint">
          {k.clickRate === null ? "Nothing delivered in this window" : "Unique clicks, of delivered"}
        </span>
      ),
      href: "/admin/marketing/email?sort=click",
    },
    {
      label: "New Subscribers",
      value: count(k.newSubscribers),
      icon: <IconUsers size={15} />,
      foot: <span className="cc-faint">Opted-in contacts added this month</span>,
      href: "/admin/marketing/email?tab=audiences",
    },
    {
      label: "Bounces / Unsubscribes",
      value: k.unhealthyRate === null ? DASH : pct(k.unhealthyRate, 1),
      icon: <IconAlert size={15} />,
      foot: (
        <span className="cc-faint">
          {k.unhealthyRate === null
            ? "Nothing sent in this window"
            : `${count(k.bounces)} bounced · ${count(k.unsubscribes)} unsubscribed`}
        </span>
      ),
      href: "/admin/marketing/email?tab=analytics",
    },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((card) => (
        <Link className="cc-kpi" key={card.label} href={card.href}>
          <div className="cc-kpi-top">
            <span className="cc-kpi-icon">{card.icon}</span>
            <span className="cc-kpi-label">{card.label}</span>
          </div>
          <div className="cc-kpi-value">{card.value}</div>
          <div className="cc-kpi-foot">{card.foot}</div>
        </Link>
      ))}
    </div>
  );
}

/* ── Needs attention ───────────────────────────────────────────────── */

function NeedsAttention({ board }: { board: Board }) {
  if (board.alerts.length === 0) {
    return board.empty ? null : (
      <section className="cc-panel cc-s12">
        <div className="cc-panel-body">
          <p className="cc-note" style={{ margin: 0 }}>
            Nothing needs attention. No campaign is failing or waiting on approval, no
            sequence is paused, and the sending domain is not reporting a problem.
          </p>
        </div>
      </section>
    );
  }

  return (
    <Panel
      title="Needs Attention"
      sub={`${board.alerts.length} ${board.alerts.length === 1 ? "item requires" : "items require"} attention`}
      icon={<IconAlert size={15} />}
      className="cc-s12"
      bodyClass="flush"
      action={{ href: "/admin/marketing/email?tab=analytics", label: "View All" }}
    >
      <div className="cc-alerts">
        {board.alerts.map((alert) => (
          <Link
            key={alert.id}
            href={alert.href}
            className={`cc-alert p-${alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "medium" : "low"}`}
          >
            <span className="cc-alert-pri" />
            <span className="cc-alert-main">
              <span className="cc-alert-title">{alert.title}</span>
              <span className="cc-alert-detail">{alert.detail}</span>
            </span>
            <span className="cc-alert-cat">{alert.severity}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────── */

function Tabs({ board, filters }: { board: Board; filters: EmailFilters }) {
  const tabs: { key: EmailFilters["tab"]; label: string; n?: number }[] = [
    { key: "campaigns", label: "Campaigns", n: board.totalCampaigns },
    { key: "sequences", label: "Sequences", n: board.counts.sequences },
    { key: "audiences", label: "Audiences", n: board.counts.audiences },
    { key: "templates", label: "Templates", n: board.counts.templates },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <div className="cc-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "campaigns" ? "/admin/marketing/email" : `/admin/marketing/email?tab=${tab.key}`}
          className={`cc-tab ${filters.tab === tab.key ? "is-on" : ""}`}
        >
          {tab.label}
          {tab.n !== undefined ? <span className="cc-tab-n">{count(tab.n)}</span> : null}
        </Link>
      ))}
    </div>
  );
}

/* ── Campaign table ────────────────────────────────────────────────── */

function CampaignTable({ board, canSend }: { board: Board; canSend: boolean }) {
  return (
    <div className="cc-scroll">
      <table className="cc-table dense">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Client</th>
            <th>Audience</th>
            <th>Status</th>
            <th className="num">Sent</th>
            <th className="num">Delivered</th>
            <th className="num">Open Rate</th>
            <th className="num">Click Rate</th>
            <th>Scheduled</th>
            <th>Owner</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {board.campaigns.map((c) => (
            <tr key={c.id}>
              <td>
                <Link className="cc-link cc-strong" href={`/admin/marketing/email/campaigns/${c.id}`}>
                  {c.name}
                </Link>
                <span className="cc-client-sub">{c.description || c.subject || c.campaignTypeLabel}</span>
              </td>
              <td>
                {c.client ? (
                  <Link className="cc-link" href={`/admin/clients/${c.client.id}`}>{c.client.name}</Link>
                ) : (
                  <span className="cc-dim">Tomorrow&rsquo;s Tech AI</span>
                )}
              </td>
              <td className="cc-dim">
                {c.audience ? (
                  <>
                    {c.audience.name}
                    {c.audience.size !== null ? (
                      <span className="cc-client-sub">{count(c.audience.size)} contacts</span>
                    ) : null}
                  </>
                ) : (
                  <span className="cc-faint">None</span>
                )}
              </td>
              <td><span className={`cc-chip ${CAMPAIGN_STATUS_TONE[c.status]}`}>{c.statusLabel}</span></td>
              <td className="num">{c.sent > 0 ? count(c.sent) : <span className="cc-faint">{DASH}</span>}</td>
              <td className="num">{c.delivered > 0 ? count(c.delivered) : <span className="cc-faint">{DASH}</span>}</td>
              <td className="num">
                {c.openRate === null ? <span className="cc-faint">{DASH}</span> : pct(c.openRate, 0)}
              </td>
              <td className="num">
                {c.clickRate === null ? <span className="cc-faint">{DASH}</span> : pct(c.clickRate, 1)}
              </td>
              <td className="cc-dim">
                {c.scheduledAt ? (
                  <>
                    {shortDate(c.scheduledAt)}
                    <span className="cc-client-sub">
                      {new Date(c.scheduledAt).toLocaleTimeString("en-US", {
                        timeZone: c.timezone, hour: "numeric", minute: "2-digit",
                      })}
                    </span>
                  </>
                ) : c.sentAt ? (
                  <>
                    {shortDate(c.sentAt)}
                    <span className="cc-client-sub">sent</span>
                  </>
                ) : (
                  <span className="cc-faint">{DASH}</span>
                )}
              </td>
              <td className="cc-dim">{c.owner ?? DASH}</td>
              <td>
                <CampaignRowActions campaignId={c.id} status={c.status} canSend={canSend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignCards({ board, canSend }: { board: Board; canSend: boolean }) {
  return (
    <div className="cc-appcards">
      {board.campaigns.map((c) => (
        <article className="cc-appcard" key={c.id}>
          <div className="cc-appcard-top">
            <span className="cc-mono">{c.name.slice(0, 2).toUpperCase()}</span>
            <span className="cc-appcard-name">
              <Link className="cc-link" href={`/admin/marketing/email/campaigns/${c.id}`}>{c.name}</Link>
            </span>
            <CampaignRowActions campaignId={c.id} status={c.status} canSend={canSend} />
          </div>
          <div className="cc-appcard-sub">
            {c.client?.name ?? "Tomorrow's Tech AI"} · {c.campaignTypeLabel}
          </div>
          <div className="cc-taglist" style={{ marginTop: 8 }}>
            <span className={`cc-chip ${CAMPAIGN_STATUS_TONE[c.status]}`}>{c.statusLabel}</span>
          </div>
          <dl className="cc-kv" style={{ marginTop: 10 }}>
            <dt>Audience</dt><dd>{c.audience?.name ?? DASH}</dd>
            <dt>Sent</dt><dd>{c.sent > 0 ? count(c.sent) : DASH}</dd>
            <dt>Open rate</dt><dd>{c.openRate === null ? DASH : pct(c.openRate, 0)}</dd>
            <dt>Click rate</dt><dd>{c.clickRate === null ? DASH : pct(c.clickRate, 1)}</dd>
          </dl>
        </article>
      ))}
    </div>
  );
}

/* ── Sequences / Audiences / Templates ─────────────────────────────── */

function SequencesTab({
  sequences, audiences, clients, people,
}: {
  sequences: SequenceRow[];
  audiences: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  people: string[];
}) {
  return (
    <Panel title="Sequences" sub={`${count(sequences.length)} total`} icon={<IconRepeat size={15} />} className="cc-s12">
      <div className="cc-rowacts" style={{ marginBottom: 12 }}>
        <SequenceSheet clients={clients} audiences={audiences} people={people} />
      </div>

      {sequences.length === 0 ? (
        <EmptyState
          icon={<IconRepeat size={17} />}
          title="No sequences yet"
          text="A sequence sends a series of emails over days or weeks, and stops automatically when somebody replies, books, buys or unsubscribes."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Sequence</th><th>Client</th><th>Trigger</th><th>Status</th>
                <th className="num">Steps</th><th className="num">Active</th>
                <th className="num">Completed</th><th className="num">Exited</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="cc-strong">{s.name}</span>
                    <span className="cc-client-sub">{s.description || `Updated ${ago(s.updatedAt)}`}</span>
                  </td>
                  <td className="cc-dim">{s.clientName ?? "Internal"}</td>
                  <td className="cc-dim">{ENROLLMENT_TRIGGER_LABELS[s.trigger]}</td>
                  <td><span className={`cc-chip ${SEQUENCE_STATUS_TONE[s.status]}`}>{SEQUENCE_STATUS_LABELS[s.status]}</span></td>
                  <td className="num">{s.steps > 0 ? count(s.steps) : <span className="cc-faint">{DASH}</span>}</td>
                  <td className="num">{count(s.active)}</td>
                  <td className="num">{count(s.completed)}</td>
                  <td className="num">{count(s.exited)}</td>
                  <td>
                    <span className="cc-rowacts">
                      <SequenceStatusButton sequenceId={s.id} status={s.status} steps={s.steps} />
                      <EnrollSheet sequenceId={s.id} audiences={audiences} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="cc-note">
        Unsubscribes, spam complaints and hard bounces exit a sequence automatically —
        that is enforced in the database, so nobody who opts out keeps receiving steps.
      </p>
    </Panel>
  );
}

function AudiencesTab({
  audiences, choices,
}: {
  audiences: AudienceRow[];
  choices: Awaited<ReturnType<typeof loadEmailChoices>>;
}) {
  return (
    <Panel title="Audiences" sub={`${count(audiences.length)} total`} icon={<IconUsers size={15} />} className="cc-s12">
      <div className="cc-rowacts" style={{ marginBottom: 12 }}>
        <AudienceSheet
          clients={choices.clients}
          leadStatuses={choices.leadStatuses}
          businessTypes={choices.businessTypes}
          sources={choices.sources}
          people={choices.people}
        />
        <SuppressSheet />
      </div>

      {audiences.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={17} />}
          title="No audiences yet"
          text="Create or import an audience from your CRM. A dynamic segment stays current on its own; a static list holds the addresses you paste into it."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Audience</th><th>Client</th><th>Type</th>
                <th className="num">Contacts</th><th className="num">Can email</th>
                <th className="num">Suppressed</th><th className="num">Used in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {audiences.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="cc-strong">{a.name}</span>
                    <span className="cc-client-sub">{a.description}</span>
                  </td>
                  <td className="cc-dim">{a.clientName ?? "Internal"}</td>
                  <td className="cc-dim">{AUDIENCE_TYPE_LABELS[a.audienceType]}</td>
                  <td className="num">
                    {a.members === null ? <span className="cc-faint" title="A dynamic segment has no fixed membership — it is resolved from the CRM each time.">Dynamic</span> : count(a.members)}
                  </td>
                  <td className="num" title={a.cachedAt ? `Counted ${ago(a.cachedAt)}` : "Never counted"}>
                    {a.cachedSize === null ? <span className="cc-faint">{DASH}</span> : count(a.cachedSize)}
                  </td>
                  <td className="num">
                    {a.suppressed === null ? <span className="cc-faint">{DASH}</span> : count(a.suppressed)}
                  </td>
                  <td className="num">{a.usedIn > 0 ? count(a.usedIn) : <span className="cc-faint">{DASH}</span>}</td>
                  <td>
                    <span className="cc-rowacts">
                      <RefreshSize audienceId={a.id} />
                      {a.audienceType === "static_list" || a.audienceType === "imported_list" ? (
                        <ImportContacts audienceId={a.id} audienceName={a.name} />
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="cc-note">
        &ldquo;Can email&rdquo; is the total minus everybody suppressed, unsubscribed or
        without recorded consent, counted when it says. It is the number that actually
        goes out, and it is deliberately shown next to the raw total rather than
        instead of it.
      </p>
    </Panel>
  );
}

function TemplatesTab({
  templates, choices,
}: {
  templates: TemplateRow[];
  choices: Awaited<ReturnType<typeof loadEmailChoices>>;
}) {
  return (
    <Panel title="Templates" sub={`${count(templates.length)} total`} icon={<IconLayers size={15} />} className="cc-s12">
      <div className="cc-rowacts" style={{ marginBottom: 12 }}>
        <TemplateSheet clients={choices.clients} brandProfiles={choices.brandProfiles} />
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<IconLayers size={17} />}
          title="No templates yet"
          text="A template is a reusable branded body — a welcome, a follow-up, a newsletter shell. Campaigns copy it once, so editing a template never rewrites mail that already went out."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Template</th><th>Client</th><th>Category</th>
                <th>Subject</th><th>Status</th><th className="num">Blocks</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className="cc-strong">{t.name}</td>
                  <td className="cc-dim">{t.clientName ?? "Internal"}</td>
                  <td className="cc-dim">{TEMPLATE_CATEGORY_LABELS[t.category]}</td>
                  <td className="cc-dim" style={{ maxWidth: 280 }}>{t.subject ?? DASH}</td>
                  <td><span className={`cc-chip ${t.status === "active" ? "t-ok" : "t-muted"}`}>{t.status}</span></td>
                  <td className="num">{t.blocks > 0 ? count(t.blocks) : <span className="cc-faint">{DASH}</span>}</td>
                  <td className="cc-dim">{ago(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function AnalyticsTab({ board }: { board: Board }) {
  const k = board.kpis;
  const rows: { label: string; value: string; detail: string }[] = [
    { label: "Emails sent this month", value: count(k.sentThisMonth), detail: "Marketing only — transactional mail is not counted here." },
    { label: "Open rate", value: k.openRate === null ? DASH : pct(k.openRate, 1), detail: "Unique opens as a share of delivered." },
    { label: "Click rate", value: k.clickRate === null ? DASH : pct(k.clickRate, 1), detail: "Unique clicks as a share of delivered." },
    { label: "Bounces", value: count(k.bounces), detail: "In the selected window." },
    { label: "Unsubscribes", value: count(k.unsubscribes), detail: "In the selected window." },
    { label: "Suppressed addresses", value: count(board.counts.suppressed), detail: "Everyone this system will never email again." },
    { label: "Active sequences", value: count(board.counts.activeSequences), detail: `${count(board.counts.pausedSequences)} paused.` },
  ];

  return (
    <Panel title="Analytics" icon={<IconChart size={15} />} className="cc-s12">
      <ul className="cc-health">
        {rows.map((row) => (
          <li className="cc-health-row" key={row.label}>
            <div className="cc-health-name">{row.label}</div>
            <div className="cc-health-detail">{row.detail}</div>
            <span className="cc-chip t-muted">{row.value}</span>
          </li>
        ))}
      </ul>
      <p className="cc-note">
        Per-campaign performance — opens and clicks over time, top clicked links and
        recipient activity — lives on each campaign&rsquo;s own Performance tab, where the
        numbers belong to one send rather than an average across all of them.
      </p>
    </Panel>
  );
}

/* ── Right rail ────────────────────────────────────────────────────── */

function SendingHealthPanel({ board }: { board: Board }) {
  const h = board.health;
  const rows: { label: string; value: string; tone: string }[] = [
    { label: "Provider", value: h.provider, tone: PROVIDER_TONE[h.providerStatus] },
    { label: "Sending Domain", value: h.domain ?? "Not set", tone: h.domain ? HEALTH_TONE[h.state] : "t-muted" },
    { label: "SPF", value: h.spfLabel, tone: DNS_TONE[h.spf] },
    { label: "DKIM", value: h.dkimLabel, tone: DNS_TONE[h.dkim] },
    { label: "DMARC", value: h.dmarcLabel, tone: DMARC_TONE[h.dmarc] },
    {
      label: "Bounce Rate",
      value: h.bounceRate === null ? "Not enough volume" : pct(h.bounceRate, 1),
      tone: h.bounceRate === null ? "t-muted" : h.bounceRate >= 0.02 ? "t-warn" : "t-ok",
    },
    {
      label: "Complaint Rate",
      value: h.complaintRate === null ? "Not enough volume" : pct(h.complaintRate, 2),
      tone: h.complaintRate === null ? "t-muted" : h.complaintRate >= 0.001 ? "t-warn" : "t-ok",
    },
    { label: "Last Send", value: h.lastSendAt ? ago(h.lastSendAt) : "Never", tone: "t-muted" },
  ];

  return (
    <Panel
      title="Sending Health"
      sub={h.label}
      icon={<IconPulse size={15} />}
      action={{ href: "/admin/settings", label: "View Details" }}
    >
      <ul className="cc-health">
        {rows.map((row) => (
          <li className="cc-health-row" key={row.label}>
            <div className="cc-health-name">{row.label}</div>
            <div className="cc-health-detail" />
            <span className={`cc-chip ${row.tone}`}>{row.value}</span>
          </li>
        ))}
      </ul>

      {h.notConfigured ? (
        <EmptyState
          title="Email provider not configured"
          text="Connect your sending provider before launching campaigns. Nothing can be sent until RESEND_API_KEY is set and a sending domain is recorded."
        />
      ) : null}

      <div className="cc-rowacts" style={{ marginTop: 10 }}>
        {h.domainId ? <CheckDomainButton domainId={h.domainId} /> : null}
        <DomainSheet />
      </div>

      <p className="cc-note">
        SPF, DKIM and DMARC read &ldquo;Not checked&rdquo; until a real provider lookup
        confirms them. Nothing in this admin can mark a domain verified by hand.
      </p>
    </Panel>
  );
}

function AudienceGrowthPanel({ board }: { board: Board }) {
  const g = board.audienceGrowth;
  return (
    <Panel title="Audience Growth" icon={<IconUsers size={15} />}>
      <div className="cc-kpi-value">{count(g.totalSubscribers)}</div>
      <div className="cc-kpi-foot"><span className="cc-faint">Contacts we hold an opted-in address for</span></div>

      <ul className="cc-health" style={{ marginTop: 12 }}>
        <li className="cc-health-row">
          <div className="cc-health-name">New this month</div>
          <div className="cc-health-detail">Leads and list members added</div>
          <span className="cc-chip t-ok">{count(g.newThisMonth)}</span>
        </li>
        <li className="cc-health-row">
          <div className="cc-health-name">Suppressed</div>
          <div className="cc-health-detail">Unsubscribed, bounced or complained</div>
          <span className="cc-chip t-muted">{count(g.unsubscribed)}</span>
        </li>
        <li className="cc-health-row">
          <div className="cc-health-name">Net growth</div>
          <div className="cc-health-detail">Added minus opted out, this window</div>
          <span className={`cc-chip ${g.netGrowth >= 0 ? "t-ok" : "t-risk"}`}>{count(g.netGrowth)}</span>
        </li>
      </ul>

      {g.months.some((m) => m.added > 0) ? (
        <div style={{ marginTop: 12 }}>
          <MiniBars
            points={g.months.map((m, i) => ({ key: `${m.label}-${i}`, value: m.added }))}
            labelLeft={g.months[0]?.label}
            labelRight={g.months[g.months.length - 1]?.label}
            format={(value, key) => `${key.split("-")[0]}: ${value} added`}
          />
        </div>
      ) : (
        <p className="cc-note">
          No contacts have been added in the last six months, so there is no trend to draw.
        </p>
      )}
    </Panel>
  );
}

function TopCampaignPanel({ board }: { board: Board }) {
  const top = board.topCampaign;
  return (
    <Panel
      title="Top Performing Campaign"
      icon={<IconZap size={15} />}
      action={top ? { href: "/admin/marketing/email?sort=open", label: "View All" } : undefined}
    >
      {!top ? (
        <EmptyState
          title="Nothing to rank yet"
          // Ranking a campaign that went to four people would send somebody
          // off to copy the wrong thing.
          text="A campaign appears here once it has been sent to at least twenty people and its open rate means something."
        />
      ) : (
        <>
          <div className="cc-feed-title cc-strong">
            <Link className="cc-link" href={`/admin/marketing/email/campaigns/${top.id}`}>{top.name}</Link>
          </div>
          <div className="cc-feed-sub">
            {top.clientName ?? "Tomorrow's Tech AI"}
            {top.audienceName ? ` · ${top.audienceName}` : ""}
          </div>
          <dl className="cc-kv" style={{ marginTop: 10 }}>
            <dt>Sent</dt><dd>{count(top.sent)}</dd>
            <dt>Open rate</dt><dd>{top.openRate === null ? DASH : pct(top.openRate, 0)}</dd>
            <dt>Click rate</dt><dd>{top.clickRate === null ? DASH : pct(top.clickRate, 1)}</dd>
            <dt>Conversions</dt>
            <dd title="Invoices attributed to this campaign.">
              {top.conversions > 0 ? count(top.conversions) : DASH}
            </dd>
          </dl>
          <Link className="cc-cta" href={`/admin/marketing/email/campaigns/${top.id}?tab=performance`}>
            View Details
          </Link>
        </>
      )}
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function EmailBoard({ filters }: { filters: EmailFilters }) {
  const session = await getAdminUser();
  const canSend = ["owner", "admin"].includes(session?.admin.role ?? "viewer");

  const supabase = await createSupabaseServerClient();
  const [board, choices] = await Promise.all([
    loadEmailBoard(supabase, filters),
    loadEmailChoices(supabase),
  ]);

  // Only the open tab's rows are loaded. Reading every sequence, audience and
  // template on every page view would be four queries nobody asked for.
  const [sequences, audiences, templates] = await Promise.all([
    filters.tab === "sequences" ? loadSequences(supabase) : Promise.resolve([] as SequenceRow[]),
    filters.tab === "audiences" ? loadAudiences(supabase) : Promise.resolve([] as AudienceRow[]),
    filters.tab === "templates" ? loadTemplates(supabase) : Promise.resolve([] as TemplateRow[]),
  ]);

  const filtered = Boolean(
    filters.q || filters.client || filters.status || filters.type || filters.audience || filters.owner
  );

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Email Marketing</h1>
          <p>Create, schedule, automate, and measure email campaigns across every audience and client.</p>
        </div>
        <div className="cc-greet-actions">
          <Link className="cc-btn" href="/admin/marketing/email?tab=sequences">Create Sequence</Link>
          <Link className="cc-btn" href="/admin/marketing/email?tab=audiences">Manage Audiences</Link>
          <Link className="cc-btn" href="/admin/marketing/email?tab=templates">Templates</Link>
          {canSend ? (
            <NewCampaign
              clients={choices.clients}
              audiences={choices.audiences}
              templates={choices.templates}
              brandProfiles={choices.brandProfiles}
              sendingDomains={choices.sendingDomains}
              services={choices.services}
              people={choices.people}
            />
          ) : null}
        </div>
      </div>

      <KpiRow board={board} />

      <div className="cc-board" style={{ marginBottom: 16 }}>
        <NeedsAttention board={board} />
      </div>

      <Tabs board={board} filters={filters} />

      <div className="cc-board">
        {filters.tab === "campaigns" ? (
          <Panel
            title="Campaigns"
            sub={
              board.campaigns.length > 0
                ? `Showing 1–${board.campaigns.length} of ${board.campaigns.length} campaigns`
                : undefined
            }
            icon={<IconMail size={15} />}
            className="cc-s8"
          >
            <EmailFiltersBar
              clients={board.clients}
              audiences={board.audiences}
              owners={board.owners}
            />

            {board.campaigns.length === 0 ? (
              board.empty ? (
                <EmptyState
                  icon={<IconMail size={17} />}
                  title="No email campaigns yet"
                  text="Create your first campaign to start reaching leads, customers, and subscribers."
                />
              ) : filtered ? (
                <EmptyState
                  title="Nothing matches those filters"
                  text="Clear a filter or two and the rest come back."
                  cta={{ href: "/admin/marketing/email", label: "Clear filters" }}
                />
              ) : (
                <EmptyState
                  title="Nothing in this window"
                  text="No campaign was sent or scheduled in the selected date range."
                  cta={{ href: "/admin/marketing/email?days=365", label: "Widen to 12 months" }}
                />
              )
            ) : filters.view === "cards" ? (
              <CampaignCards board={board} canSend={canSend} />
            ) : (
              <CampaignTable board={board} canSend={canSend} />
            )}
          </Panel>
        ) : filters.tab === "sequences" ? (
          <SequencesTab
            sequences={sequences}
            audiences={choices.audiences}
            clients={choices.clients}
            people={choices.people}
          />
        ) : filters.tab === "audiences" ? (
          <AudiencesTab audiences={audiences} choices={choices} />
        ) : filters.tab === "templates" ? (
          <TemplatesTab templates={templates} choices={choices} />
        ) : (
          <AnalyticsTab board={board} />
        )}

        {/* The right operational column. A wrapper rather than three loose
            cc-s4 panels, because grid auto-placement would wrap them under
            the table instead of stacking them beside it. */}
        {filters.tab === "campaigns" ? (
          <div className="cc-s4" style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <SendingHealthPanel board={board} />
            <AudienceGrowthPanel board={board} />
            <TopCampaignPanel board={board} />
          </div>
        ) : null}
      </div>
    </>
  );
}

export function EmailBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="Campaigns" rows={6} />
      <PanelSkeleton title="Sending Health" rows={5} />
      <PanelSkeleton title="Audience Growth" rows={3} />
    </div>
  );
}
