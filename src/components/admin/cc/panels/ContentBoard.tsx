import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadContentBoard,
  type ContentBoard as Board,
  type ContentFilters,
  type ContentRow,
} from "@/lib/content/queries";
import { PLATFORM_LABELS, TYPE_LABELS } from "@/lib/content/formats";
import { setContentStatusAction } from "@/app/admin/content-actions";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import ContentAssistant from "../ContentAssistant";
import ContentFiltersBar from "../ContentFilters";
import AssetUpload from "../AssetUpload";
import { ago, clockTime, count, DASH, shortDate } from "../format";
import {
  IconAlert,
  IconCalendar,
  IconChart,
  IconCheck,
  IconFile,
  IconImage,
  IconLayers,
  IconMegaphone,
  IconPulse,
  IconRepeat,
  IconSend,
  IconShare,
  IconSpark,
  IconZap,
} from "../Icons";

/**
 * The Content Studio.
 *
 * Two halves, kept apart on purpose. What we WROTE — counts, statuses, the
 * queue, the calendar, campaign grouping — is ours and is true. What a
 * platform DID with it — reach, engagement, CTR — belongs to the platforms,
 * and social_accounts.connected is the only thing that licenses showing it.
 * No account is connected today, so performance says so instead of rendering
 * a zero engagement rate that would read as a measurement.
 */

const STATUS_TONE: Record<string, string> = {
  draft: "t-muted",
  generating: "t-info",
  needs_review: "t-warn",
  approved: "t-ok",
  scheduled: "t-info",
  published: "t-ok",
  failed: "t-risk",
  archived: "t-muted",
};

/* ── 1. The six numbers ────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;

  const cards = [
    {
      label: "Content pieces",
      value: count(k.total),
      icon: <IconFile size={15} />,
      foot: <span className="cc-faint">Across every channel and status</span>,
      href: "/admin/marketing/content",
    },
    {
      label: "Scheduled this week",
      value: count(k.scheduledThisWeek),
      icon: <IconCalendar size={15} />,
      foot: <span className="cc-faint">Next seven days</span>,
      href: "/admin/marketing/content?tab=scheduled",
    },
    {
      label: "Published this month",
      value: count(k.publishedThisMonth),
      icon: <IconSend size={15} />,
      foot: <span className="cc-faint">Last 30 days</span>,
      href: "/admin/marketing/content",
    },
    {
      label: "Needs review",
      value: count(k.needsReview),
      icon: <IconAlert size={15} />,
      foot: (
        <span className={k.needsReview > 0 ? "cc-delta down" : "cc-faint"}>
          {k.needsReview > 0 ? "Waiting on you" : "Nothing waiting"}
        </span>
      ),
      href: "/admin/marketing/content?tab=needs_review",
    },
    {
      label: "Content leads",
      value: k.contentLeads === null ? DASH : count(k.contentLeads),
      icon: <IconSpark size={15} />,
      foot: (
        <span className="cc-faint">
          {k.contentLeads === null ? "No campaign on any content yet" : "Leads on matching campaigns"}
        </span>
      ),
      href: "/admin/leads",
    },
    {
      label: "Active campaigns",
      value: count(k.activeCampaigns),
      icon: <IconMegaphone size={15} />,
      foot: <span className="cc-faint">Campaigns with content attached</span>,
      href: "/admin/marketing/campaigns/business-launch",
    },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((c) => (
        <Link className="cc-kpi" key={c.label} href={c.href}>
          <div className="cc-kpi-top">
            <span className="cc-kpi-icon">{c.icon}</span>
            <span className="cc-kpi-label">{c.label}</span>
          </div>
          <div className="cc-kpi-value">{c.value}</div>
          <div className="cc-kpi-foot">{c.foot}</div>
        </Link>
      ))}
    </div>
  );
}

/* ── 2. The assistant ──────────────────────────────────────────────── */

function Assistant({ board }: { board: Board }) {
  return (
    <Panel
      title="AI Content Assistant"
      sub="Your AI copilot for ideas, creation, and optimization"
      icon={<IconSpark size={15} />}
    >
      {board.brands.length === 0 ? (
        <EmptyState
          title="No brand voice set up"
          text="Content is written in a brand's voice. Add a brand profile before generating anything."
        />
      ) : (
        <ContentAssistant
          brands={board.brands.map((b) => ({ id: b.id, name: b.name }))}
          activeBrandId={board.activeBrand?.id ?? null}
        />
      )}
    </Panel>
  );
}

/* ── 3. Calendar ───────────────────────────────────────────────────── */

function Calendar({ board }: { board: Board }) {
  return (
    <Panel
      title="Content calendar"
      sub="What is dated, soonest first"
      icon={<IconCalendar size={15} />}
      className="cc-s4"
    >
      {board.calendar.length === 0 ? (
        <EmptyState
          icon={<IconCalendar size={17} />}
          title="Nothing scheduled"
          text="Approve a draft and give it a date, and it appears here and on the calendar."
        />
      ) : (
        <ul className="cc-today">
          {board.calendar.map((c) => (
            <li className="cc-today-item" key={c.id}>
              <span className={`cc-today-dot ${STATUS_TONE[c.status]}`} />
              <div className="cc-today-main">
                <div className="cc-today-title">{c.title}</div>
                <div className="cc-today-sub">
                  {[c.platformLabel, c.campaign].filter(Boolean).join(" · ") || c.typeLabel}
                </div>
              </div>
              <span className="cc-today-when">
                {c.scheduledAt ? `${shortDate(c.scheduledAt)} ${clockTime(c.scheduledAt)}` : DASH}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── 4. Drafts and review queue ────────────────────────────────────── */

function QueueRow({ item }: { item: ContentRow }) {
  // Approve is the gate. It is a form with a named actor behind it, never a
  // link, so nothing can approve by being navigated to.
  const next =
    item.status === "draft"
      ? { status: "needs_review", label: "Send for review" }
      : item.status === "needs_review"
        ? { status: "approved", label: "Approve" }
        : null;

  return (
    <tr>
      <td>
        <span className="cc-strong">{item.title}</span>
        <span className="cc-client-sub">
          {(item.body ?? "").slice(0, 90)}
          {(item.body?.length ?? 0) > 90 ? "…" : ""}
        </span>
      </td>
      <td className="cc-dim">{item.typeLabel}</td>
      <td className="cc-dim">{item.platformLabel ?? DASH}</td>
      <td className="cc-dim">{item.campaign ?? DASH}</td>
      <td>
        <span className={`cc-chip ${STATUS_TONE[item.status] ?? "t-muted"}`}>{item.statusLabel}</span>
      </td>
      <td>
        {item.aiGenerated ? (
          <span className="cc-chip t-info" title="Written by AI, saved as a draft for review">
            AI
          </span>
        ) : (
          <span className="cc-dim">{DASH}</span>
        )}
      </td>
      <td className="cc-dim">{ago(item.updatedAt)}</td>
      <td>
        {next ? (
          <form action={setContentStatusAction} className="cc-inline-form">
            <input type="hidden" name="content_id" value={item.id} />
            <input type="hidden" name="status" value={next.status} />
            <button type="submit" className="cc-btn">{next.label}</button>
          </form>
        ) : (
          <span className="cc-faint">{item.status === "approved" ? "Ready to schedule" : DASH}</span>
        )}
      </td>
    </tr>
  );
}

function Queue({ board, filters }: { board: Board; filters: ContentFilters }) {
  const tabs: { key: ContentFilters["tab"]; label: string }[] = [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "needs_review", label: "Needs review" },
    { key: "approved", label: "Approved" },
    { key: "scheduled", label: "Scheduled" },
  ];

  const filtered = Boolean(filters.q || filters.platform || filters.type || filters.campaign || filters.ai);

  return (
    <Panel
      title="Drafts & review queue"
      sub={`${count(board.queue.length)} shown`}
      icon={<IconLayers size={15} />}
      className="cc-s12"
    >
      <div className="cc-tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/marketing/content" : `/admin/marketing/content?tab=${t.key}`}
            className={`cc-tab ${filters.tab === t.key ? "is-on" : ""}`}
          >
            {t.label}
            <span className="cc-tab-n">{count(board.tabCounts[t.key])}</span>
          </Link>
        ))}
      </div>

      {board.queue.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Nothing matches those filters"
            text="Clear a filter and the rest of the queue comes back."
            cta={{ href: "/admin/marketing/content", label: "Clear filters" }}
          />
        ) : (
          <EmptyState
            icon={<IconFile size={17} />}
            title="No content has been created yet"
            text="Describe what you want in the assistant above and it writes the drafts. They land here for review — nothing goes out without you approving it."
          />
        )
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Content</th>
                <th>Type</th>
                <th>Platform</th>
                <th>Campaign</th>
                <th>Status</th>
                <th>Source</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {board.queue.map((c) => (
                <QueueRow item={c} key={c.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── 5. Campaign content ───────────────────────────────────────────── */

function Campaigns({ board }: { board: Board }) {
  return (
    <Panel
      title="Campaign content"
      sub="Grouped by the campaign on each piece"
      icon={<IconMegaphone size={15} />}
      className="cc-s6"
      action={{ href: "/admin/marketing/campaigns/business-launch", label: "Campaigns" }}
    >
      {board.campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns on any content"
          text="Put a campaign name on a piece of content and it groups here, alongside the leads that campaign brought in."
        />
      ) : (
        <ul className="cc-health">
          {board.campaigns.map((c) => (
            <li className="cc-health-row" key={c.name}>
              <div className="cc-health-name">{c.name}</div>
              <div className="cc-health-detail">
                {c.total} {c.total === 1 ? "piece" : "pieces"} · {c.scheduled} scheduled · {c.published} published
              </div>
              {c.needsReview > 0 ? (
                <span className="cc-chip t-warn">{c.needsReview} to review</span>
              ) : null}
              <span className="cc-mono">{c.leads > 0 ? `${c.leads} leads` : DASH}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── 6. Asset library ──────────────────────────────────────────────── */

function Assets({ board }: { board: Board }) {
  return (
    <Panel
      title="Brand & asset library"
      sub={board.assetCount > 0 ? `${count(board.assetCount)} shown` : undefined}
      icon={<IconImage size={15} />}
    >
      <div className="cc-assets">
        {board.assets.map((a) => (
          <div className="cc-asset" key={a.id}>
            <span className="cc-asset-thumb" aria-hidden="true">
              {a.mimeType?.startsWith("video/") ? "▶" : a.mimeType?.startsWith("audio/") ? "♪" : "▣"}
            </span>
            <span className="cc-asset-name" title={a.title}>{a.title}</span>
            <span className="cc-asset-meta">
              {a.assetType.replace(/_/g, " ")}
              {a.fileSize ? ` · ${(a.fileSize / 1024).toFixed(0)} KB` : ""}
            </span>
          </div>
        ))}
        <AssetUpload brandId={board.activeBrand?.id ?? null} />
      </div>

      {board.assetCount === 0 ? (
        <p className="cc-note">
          No brand assets uploaded yet. Files go to a private bucket — nothing here is served from a
          public URL, and previews use a link that expires in five minutes.
        </p>
      ) : null}
    </Panel>
  );
}

/* ── 7. Repurpose ──────────────────────────────────────────────────── */

function Repurpose({ board }: { board: Board }) {
  return (
    <Panel
      title="Repurpose center"
      sub="One piece, several channels"
      icon={<IconRepeat size={15} />}
      className="cc-s6"
    >
      {board.repurposeSources.length === 0 ? (
        <EmptyState
          icon={<IconRepeat size={17} />}
          title="Nothing long enough to repurpose yet"
          text="Blogs, emails and longer pieces show up here. Ask the assistant for a blog, then turn it into a Reel script, a LinkedIn post and an email in one go."
        />
      ) : (
        <ul className="cc-health">
          {board.repurposeSources.map((c) => (
            <li className="cc-health-row" key={c.id}>
              <div className="cc-health-name">{c.title}</div>
              <div className="cc-health-detail">
                {c.typeLabel} · {(c.body ?? "").split(/\s+/).filter(Boolean).length} words
              </div>
              <span className="cc-chip t-info">Source</span>
            </li>
          ))}
        </ul>
      )}
      <p className="cc-note">
        Repurposing writes new drafts that point back at the original, so &ldquo;what came from this
        blog&rdquo; is always answerable. Nothing is published in the process.
      </p>
    </Panel>
  );
}

/* ── 8. Performance ────────────────────────────────────────────────── */

function Performance({ board }: { board: Board }) {
  return (
    <Panel title="Performance insights" icon={<IconChart size={15} />} className="cc-s6">
      {board.social.connected ? (
        <EmptyState
          title="Connected, nothing synced"
          text={`${board.social.connectedCount} account${board.social.connectedCount === 1 ? "" : "s"} connected, but no performance data has come back yet.`}
        />
      ) : (
        <>
          <EmptyState
            icon={<IconShare size={17} />}
            title="No social accounts connected"
            text={
              board.social.totalAccounts === 0
                ? "Reach, engagement and CTR belong to the platforms. Until an account is connected in Social Center there is nothing to report, and a zero here would read as a measurement."
                : `${board.social.totalAccounts} account${board.social.totalAccounts === 1 ? "" : "s"} recorded, none currently connected.`
            }
            cta={{ href: "/admin/marketing/social", label: "Open Social Center" }}
          />
          <p className="cc-note">
            Lead counts elsewhere on this page are real — they come from your own database by
            campaign, not from a platform.
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── 9. Activity ───────────────────────────────────────────────────── */

function Activity({ board }: { board: Board }) {
  return (
    <Panel title="Recent activity" icon={<IconPulse size={15} />} className="cc-s6">
      {board.activity.length === 0 ? (
        <EmptyState title="Nothing has happened yet" text="Content events appear here as you create and approve." />
      ) : (
        <ul className="cc-feed">
          {board.activity.map((a) => (
            <li className="cc-feed-item" key={a.id}>
              <span className={`cc-feed-icon ${a.actor === "AI" ? "m-ai" : "m-social"}`}>
                {a.actor === "AI" ? <IconSpark size={13} /> : <IconCheck size={13} />}
              </span>
              <span className="cc-feed-main">
                <span className="cc-feed-title">{a.title}</span>
                <span className="cc-feed-sub">{a.detail ?? a.actor ?? ""}</span>
              </span>
              <span className="cc-feed-when">{ago(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── 10. Quick actions ─────────────────────────────────────────────── */

function QuickActions({ board }: { board: Board }) {
  const canGenerate = board.brands.length > 0;

  const actions: { label: string; hint: string; href?: string; icon: React.ReactNode }[] = [
    { label: "Create post", hint: canGenerate ? "Ask the assistant above" : "Add a brand first", href: canGenerate ? "#assistant" : undefined, icon: <IconSpark size={16} /> },
    { label: "Create blog", hint: canGenerate ? "Pick Blog, then generate" : "Add a brand first", href: canGenerate ? "#assistant" : undefined, icon: <IconFile size={16} /> },
    { label: "Upload asset", hint: "Private bucket, signed previews", href: "#assets", icon: <IconImage size={16} /> },
    { label: "Run SEO audit", hint: "Finds what to write about", href: "/admin/marketing/seo", icon: <IconZap size={16} /> },
    { label: "Schedule content", hint: board.social.connected ? "Hands off to Social Center" : "Needs a connected account", href: board.social.connected ? "/admin/marketing/social" : undefined, icon: <IconCalendar size={16} /> },
    { label: "Build campaign", hint: "No campaign builder yet", icon: <IconMegaphone size={16} /> },
  ];

  return (
    <Panel title="Quick actions" icon={<IconZap size={15} />} className="cc-s12">
      <div className="cc-jobs">
        {actions.map((a) =>
          a.href ? (
            <Link className="cc-job-btn" href={a.href} key={a.label}>
              <span className="cc-job-icon">{a.icon}</span>
              <span className="cc-job-label">{a.label}</span>
              <span className="cc-job-hint">{a.hint}</span>
            </Link>
          ) : (
            <button className="cc-job-btn" key={a.label} type="button" disabled>
              <span className="cc-job-icon">{a.icon}</span>
              <span className="cc-job-label">{a.label}</span>
              <span className="cc-job-hint">{a.hint}</span>
            </button>
          )
        )}
      </div>
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function ContentBoard({ filters }: { filters: ContentFilters }) {
  const supabase = await createSupabaseServerClient();
  const board = await loadContentBoard(supabase, filters);

  const platforms = Object.entries(PLATFORM_LABELS).map(([key, label]) => ({ key, label }));
  const types = Object.entries(TYPE_LABELS).map(([key, label]) => ({ key, label }));

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Content Studio</h1>
          <p>Create, organize, repurpose, approve, and schedule content across every channel.</p>
        </div>
      </div>

      <KpiRow board={board} />
      <ContentFiltersBar
        brands={board.brands.map((b) => ({ id: b.id, name: b.name }))}
        campaigns={board.campaignNames}
        platforms={platforms}
        types={types}
      />

      <div className="cc-board">
        {/* The wrapper carries the grid span so the panel can keep an id
            for the quick-action links to jump to. */}
        <div id="assistant" className="cc-s8">
          <Assistant board={board} />
        </div>
        <Calendar board={board} />
        <Queue board={board} filters={filters} />
        {/* The asset grid earns full width — more tiles per row, fewer
            orphaned ones on the last line. */}
        <div id="assets" className="cc-s12">
          <Assets board={board} />
        </div>
        <Campaigns board={board} />
        <Repurpose board={board} />
        <Performance board={board} />
        <Activity board={board} />
        <QuickActions board={board} />
      </div>
    </>
  );
}

export function ContentBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="AI Content Assistant" rows={5} />
      <PanelSkeleton title="Content calendar" rows={4} />
      <PanelSkeleton title="Drafts & review queue" rows={6} />
    </div>
  );
}
