"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  createSocialPostAction,
  registerSocialAccountAction,
  resolveEngagementAction,
  reviewSocialPostAction,
  toggleSocialAutomationAction,
  updateSocialPostAction,
} from "@/app/admin/social-actions";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialBoard, type SocialFilters, type SocialPlatform, type SocialPostRow } from "@/lib/social/types";
import { IconAlert, IconCalendar, IconChart, IconCheck, IconImage, IconRepeat, IconSearch, IconSend, IconShare, IconUsers } from "../Icons";
import styles from "./SocialCenter.module.css";

const BASE = "/admin/marketing/social";
const TABS: Array<{ id: SocialFilters["tab"]; label: string }> = [
  { id: "queue", label: "Content Queue" },
  { id: "calendar", label: "Calendar" },
  { id: "analytics", label: "Analytics" },
  { id: "engagement", label: "Engagement" },
  { id: "media", label: "Media Library" },
  { id: "automations", label: "Automations" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", needs_approval: "Waiting Approval", approved: "Approved",
  scheduled: "Scheduled", publishing: "Publishing", published: "Published",
  failed: "Failed", canceled: "Canceled",
  not_required: "Not Required", waiting: "Waiting", changes_requested: "Changes Requested", rejected: "Rejected",
};

const AUTOMATIONS = [
  ["auto_publish_approved", "Auto Publish Approved Posts", "Queues approved posts at their scheduled time."],
  ["approval_reminder", "Send Approval Reminder", "Flags client approvals that are blocking scheduled content."],
  ["failed_publish_alert", "Notify Admin on Failed Publish", "Creates an alert and follow-up when delivery fails."],
  ["content_ready_notice", "Notify Client When Content Is Ready", "Prepared for the future client approval portal."],
  ["monthly_content_plan", "Generate Monthly Content Plan", "Creates a proposed plan for human review."],
  ["monthly_content_tasks", "Create Monthly Content Tasks", "Adds production work to the existing Tasks system."],
  ["analytics_report", "Generate Analytics Report", "Builds a monthly report from synced platform data."],
  ["connection_health", "Flag Account Connection Errors", "Surfaces expired tokens and provider failures."],
  ["credential_expiry", "Notify When Credentials Expire", "Warns before a token expiration date."],
] as const;

function n(value: number | null, suffix = "") { return value === null ? "Unknown" : `${Intl.NumberFormat("en-US", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value)}${suffix}`; }
function when(value: string | null) { if (!value) return "Unknown"; return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(value)); }
function ago(value: string | null) { if (!value) return "Never synced"; const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`; }

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  const letters: Record<SocialPlatform, string> = { facebook: "f", instagram: "◎", linkedin: "in", google_business: "G", tiktok: "♪", youtube: "▶" };
  return <span className={`${styles.platformIcon} ${styles[platform]}`}>{letters[platform]}</span>;
}

function MediaTile({ post, large = false }: { post: SocialPostRow; large?: boolean }) {
  return (
    <div className={`${styles.mediaTile} ${large ? styles.mediaLarge : ""} ${post.mediaType !== "none" ? styles.hasMedia : ""}`}>
      {post.mediaType === "video" ? "VIDEO" : post.mediaType === "carousel" ? "CAROUSEL" : post.mediaType === "image" || post.mediaAssetId || post.mediaUrl ? "IMAGE" : post.platforms[0] ? PLATFORM_LABELS[post.platforms[0]].toUpperCase() : "POST"}
    </div>
  );
}

function Status({ value }: { value: string }) { return <span className={`${styles.badge} ${styles[`status_${value}`] ?? ""}`}>{STATUS_LABELS[value] ?? value.replaceAll("_", " ")}</span>; }

function Kpis({ board }: { board: SocialBoard }) {
  const cards = [
    ["Connected Accounts", String(board.kpis.connectedAccounts), "Live platform profiles", <IconUsers key="i" size={20} />],
    ["Scheduled Posts", String(board.kpis.scheduledPosts), "Next 30 days", <IconCalendar key="i" size={20} />],
    ["Waiting Approval", String(board.kpis.waitingApproval), board.kpis.waitingApproval ? "Needs a decision" : "Nothing waiting", <IconCheck key="i" size={20} />],
    ["Published This Month", String(board.kpis.publishedThisMonth), "Successful records", <IconSend key="i" size={20} />],
    ["Engagement Rate", n(board.kpis.engagementRate, "%"), board.kpis.engagementRate === null ? "Connect analytics" : "Engagements ÷ reach", <IconChart key="i" size={20} />],
    ["Accounts Needing Attention", String(board.kpis.accountsNeedingAttention), board.kpis.accountsNeedingAttention ? "Review connections" : "No connection issues", <IconAlert key="i" size={20} />],
  ];
  return <div className={styles.kpis}>{cards.map(([label, value, foot, icon]) => <div className={styles.kpi} key={String(label)}><div className={styles.kpiTop}><span>{label}</span>{icon}</div><strong>{value}</strong><small>{foot}</small></div>)}</div>;
}

function Attention({ board }: { board: SocialBoard }) {
  return <section className={styles.attention}><div className={styles.attentionTitle}><IconAlert size={18} /><b>Needs Attention</b></div>{board.attentions.length ? <div className={styles.attentionItems}>{board.attentions.slice(0, 4).map((item) => <Link href={item.href} className={`${styles.attentionItem} ${styles[item.severity]}`} key={item.id}><b>{item.client}</b><span>{item.detail}</span></Link>)}</div> : <span className={styles.allClear}><IconCheck size={15} /> Nothing needs attention</span>}<Link href={`${BASE}?tab=queue&status=failed`} className={styles.viewAll}>View All →</Link></section>;
}

function Filters({ board, filters }: { board: SocialBoard; filters: SocialFilters }) {
  const assignees = [...new Set(board.posts.map((post) => post.assignedTo).filter((value): value is string => Boolean(value)))];
  return <form className={styles.filters} method="get"><input type="hidden" name="tab" value="queue" /><label className={styles.search}><IconSearch size={15} /><input name="q" defaultValue={filters.q} placeholder="Search posts, clients, or content..." /></label><select name="client" defaultValue={filters.client ?? ""}><option value="">All clients</option>{board.clients.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select><select name="platform" defaultValue={filters.platform ?? ""}><option value="">All platforms</option>{SOCIAL_PLATFORMS.map((p) => <option value={p} key={p}>{PLATFORM_LABELS[p]}</option>)}</select><select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{["draft", "needs_approval", "approved", "scheduled", "publishing", "published", "failed", "canceled"].map((s) => <option value={s} key={s}>{STATUS_LABELS[s]}</option>)}</select><select name="approval" defaultValue={filters.approval ?? ""}><option value="">All approvals</option>{["not_required", "waiting", "approved", "changes_requested", "rejected"].map((s) => <option value={s} key={s}>{STATUS_LABELS[s]}</option>)}</select><select name="assigned" defaultValue={filters.assigned ?? ""}><option value="">All assignees</option>{assignees.map((name) => <option key={name}>{name}</option>)}</select><input aria-label="From date" title="From date" type="date" name="from" defaultValue={filters.from}/><input aria-label="To date" title="To date" type="date" name="to" defaultValue={filters.to}/><button className={styles.filterButton}>Apply</button><Link className={styles.clearButton} href={`${BASE}?tab=queue`}>Clear</Link><div className={styles.viewToggle}><Link aria-label="Table view" className={filters.view === "table" ? styles.active : ""} href={`${BASE}?tab=queue&view=table`}>☷</Link><Link aria-label="Grid view" className={filters.view === "grid" ? styles.active : ""} href={`${BASE}?tab=queue&view=grid`}>▦</Link></div></form>;
}

function PostMenu({ post }: { post: SocialPostRow }) {
  const action = (name: string, label: string) => <form action={updateSocialPostAction}><input type="hidden" name="post_id" value={post.id}/><input type="hidden" name="post_action" value={name}/><button>{label}</button></form>;
  return <details className={styles.menu}><summary aria-label={`Actions for ${post.title}`}>•••</summary><div><Link href={`${BASE}?tab=queue&post=${post.id}`}>View / Edit</Link>{action("duplicate", "Duplicate")}{["draft", "approved", "scheduled"].includes(post.status) ? action("publish_now", "Publish now") : null}{post.externalUrl ? <a href={post.externalUrl} target="_blank" rel="noreferrer">View result</a> : null}{post.approvalStatus === "waiting" ? <><form action={reviewSocialPostAction}><input type="hidden" name="post_id" value={post.id}/><input type="hidden" name="decision" value="approved"/><button>Approve</button></form><form action={reviewSocialPostAction}><input type="hidden" name="post_id" value={post.id}/><input type="hidden" name="decision" value="changes_requested"/><button>Request changes</button></form></> : null}{post.status === "failed" ? action("retry", "Retry publish") : null}{["scheduled", "needs_approval", "approved"].includes(post.status) ? action("cancel", "Cancel schedule") : null}{post.status === "draft" ? action("archive", "Archive draft") : null}</div></details>;
}

function Queue({ board, filters }: { board: SocialBoard; filters: SocialFilters }) {
  return <><Filters board={board} filters={filters}/>{board.posts.length === 0 ? <div className={styles.empty}><IconShare size={28}/><h3>No content scheduled</h3><p>Create your first post or build a monthly content calendar.</p></div> : filters.view === "grid" ? <div className={styles.postGrid}>{board.posts.map((post) => <article className={styles.postCard} key={post.id}><MediaTile post={post} large/><div><small>{post.clientName}</small><h3>{post.title}</h3><p>{post.body}</p><div className={styles.platforms}>{post.platforms.map((p) => <PlatformIcon key={p} platform={p}/>)}</div><div className={styles.cardFoot}><Status value={post.status}/><PostMenu post={post}/></div></div></article>)}</div> : <div className={styles.tableWrap}><table><thead><tr><th>Publish Time</th><th>Client</th><th>Content</th><th>Platforms</th><th>Status</th><th>Approval</th><th>Assigned To</th><th>Actions</th></tr></thead><tbody>{board.posts.map((post) => <tr key={post.id}><td><b>{when(post.scheduledAt || post.publishedAt)}</b><small>{post.timezone}</small></td><td>{post.clientName}</td><td><div className={styles.contentCell}><MediaTile post={post}/><div><b>{post.title}</b><span>{post.body.slice(0, 100)}{post.body.length > 100 ? "…" : ""}</span></div></div>{post.error ? <small className={styles.rowError}>{post.error}</small> : null}</td><td><div className={styles.platforms}>{post.platforms.map((p) => <PlatformIcon key={p} platform={p}/>)}</div></td><td><Status value={post.status}/></td><td><Status value={post.approvalStatus}/></td><td>{post.assignedTo || "Unassigned"}</td><td><PostMenu post={post}/></td></tr>)}</tbody></table></div>}</>;
}

function ScheduledPreview({ posts }: { posts: SocialPostRow[] }) {
  return <section className={styles.preview}><div className={styles.sectionHead}><div><h2>Scheduled Content Preview</h2><p>The next approved posts in the publishing queue.</p></div><Link href={`${BASE}?tab=calendar`}>View Calendar →</Link></div>{posts.length ? <div className={styles.previewRail}>{posts.map((post) => <article key={post.id}><MediaTile post={post} large/><b>{post.title}</b><span>{post.clientName}</span><small>{when(post.scheduledAt)}</small><div className={styles.platforms}>{post.platforms.map((p) => <PlatformIcon key={p} platform={p}/>)}</div></article>)}</div> : <div className={styles.previewEmpty}>Nothing is scheduled yet.</div>}</section>;
}

function Accounts({ board }: { board: SocialBoard }) {
  return <section className={styles.sideCard}><div className={styles.sectionHead}><h2>Connected Accounts</h2><Link href={`${BASE}?tab=queue`}>View All →</Link></div><div className={styles.accountList}>{board.platformSummary.map((row) => <div className={styles.accountRow} key={row.platform}><PlatformIcon platform={row.platform}/><div><b>{PLATFORM_LABELS[row.platform]}</b><span>{row.accounts ? `${row.connected} of ${row.accounts} connected` : "No accounts"}</span></div><div className={row.errors ? styles.healthError : row.connected ? styles.healthGood : styles.healthUnknown}>{row.errors ? `${row.errors} issue${row.errors === 1 ? "" : "s"}` : row.connected ? "Connected" : "Not configured"}<small>{ago(row.lastSync)}</small></div></div>)}</div></section>;
}

function Performance({ board }: { board: SocialBoard }) {
  const metrics = [["Reach", board.performance.reach], ["Engagements", board.performance.engagements], ["Clicks", board.performance.clicks], ["Followers Gained", board.performance.followersGained]] as const;
  return <section className={styles.sideCard}><div className={styles.sectionHead}><h2>Performance Snapshot</h2><span>Last 30 days</span></div><div className={styles.miniMetrics}>{metrics.map(([label, value]) => <div key={label}><span>{label}</span><b>{n(value)}</b><small>{value === null ? "Not connected" : "Synced data"}</small></div>)}</div></section>;
}

function TopPost({ post }: { post: SocialPostRow | null }) {
  return <section className={styles.sideCard}><div className={styles.sectionHead}><h2>Top Performing Post</h2></div>{post ? <><div className={styles.topPost}><MediaTile post={post}/><div><b>{post.title}</b><span>{post.clientName}</span><small>{when(post.publishedAt)}</small></div></div><div className={styles.topMetrics}><span>Reach <b>{n(post.metrics.reach)}</b></span><span>Engagements <b>{n(post.metrics.engagements)}</b></span><span>Clicks <b>{n(post.metrics.clicks)}</b></span></div>{post.externalUrl ? <a className={styles.secondaryButton} href={post.externalUrl} target="_blank" rel="noreferrer">View Post</a> : null}</> : <div className={styles.sideEmpty}>No published post has synced engagement data yet.</div>}</section>;
}

function CalendarTab({ posts }: { posts: SocialPostRow[] }) {
  const dated = posts.filter((p) => p.scheduledAt || p.publishedAt);
  const groups = new Map<string, SocialPostRow[]>();
  for (const post of dated) { const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(post.scheduledAt || post.publishedAt!)); groups.set(date, [...(groups.get(date) ?? []), post]); }
  return <section className={styles.tabPanel}><div className={styles.sectionHead}><div><h2>Social Content Calendar</h2><p>Scheduled and published content shown in Central time.</p></div><div className={styles.segment}><span className={styles.active}>Agenda</span><span>Week</span><span>Month</span></div></div>{groups.size ? <div className={styles.agenda}>{[...groups.entries()].map(([date, rows]) => <div className={styles.agendaDay} key={date}><div><b>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`))}</b><strong>{date.slice(-2)}</strong><span>{new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${date}T12:00:00`))}</span></div><ul>{rows.map((post) => <li key={post.id}><time>{when(post.scheduledAt || post.publishedAt).split(", ").at(-1)}</time><MediaTile post={post}/><section><b>{post.title}</b><span>{post.clientName}</span></section><div className={styles.platforms}>{post.platforms.map((p) => <PlatformIcon key={p} platform={p}/>)}</div><Status value={post.status}/></li>)}</ul></div>)}</div> : <div className={styles.empty}><IconCalendar size={28}/><h3>No dated content</h3><p>Schedule a post and it will appear here and on the Admin Center Calendar.</p></div>}</section>;
}

function AnalyticsTab({ board }: { board: SocialBoard }) {
  const known = board.performance.reach !== null || board.performance.engagements !== null;
  return <section className={styles.tabPanel}><div className={styles.sectionHead}><div><h2>Organic Social Analytics</h2><p>Paid ad spend and ROAS remain in Ad Studio.</p></div><span>Last 30 days</span></div><div className={styles.analyticsKpis}>{[["Reach", board.performance.reach], ["Engagements", board.performance.engagements], ["Clicks", board.performance.clicks], ["Followers Gained", board.performance.followersGained], ["Engagement Rate", board.kpis.engagementRate === null ? null : Number(board.kpis.engagementRate.toFixed(2))]].map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{n(value as number | null, label === "Engagement Rate" ? "%" : "")}</b><small>{value === null ? "Unknown / not connected" : "Synced platform data"}</small></div>)}</div><div className={styles.chartGrid}><div><h3>Reach Over Time</h3>{known ? <div className={styles.barChart}>{board.platformSummary.map((p) => { const value = board.accounts.filter((a) => a.platform === p.platform).reduce((sum, a) => sum + (a.reach ?? 0), 0); const max = Math.max(1, ...board.accounts.map((a) => a.reach ?? 0)); return <div key={p.platform}><span>{PLATFORM_LABELS[p.platform]}</span><i style={{ width: `${Math.max(2, value / max * 100)}%` }}/><b>{n(value)}</b></div>; })}</div> : <div className={styles.emptyChart}>Connect analytics-enabled accounts to populate this chart.</div>}</div><div><h3>Publishing Frequency</h3><div className={styles.frequency}>{SOCIAL_PLATFORMS.map((platform) => <div key={platform}><PlatformIcon platform={platform}/><span>{PLATFORM_LABELS[platform]}</span><b>{board.posts.filter((post) => post.platforms.includes(platform)).length} posts</b></div>)}</div></div></div></section>;
}

function EngagementTab({ board }: { board: SocialBoard }) {
  return <section className={styles.tabPanel}><div className={styles.sectionHead}><div><h2>Engagement Inbox</h2><p>Comments, mentions, messages, replies, and reviews when provider APIs allow access.</p></div></div>{board.engagement.length ? <div className={styles.engagementList}>{board.engagement.map((item) => <article key={item.id}><PlatformIcon platform={item.platform as SocialPlatform}/><div><b>{item.author} <span>· {item.client}</span></b><p>{item.body}</p><small>{item.type} · {ago(item.occurredAt)}{item.assignedTo ? ` · ${item.assignedTo}` : ""}</small></div>{item.needsReply ? <span className={styles.needsReply}>Needs reply</span> : null}<form action={resolveEngagementAction}><input type="hidden" name="engagement_id" value={item.id}/><button className={styles.secondaryButton}>Mark resolved</button></form></article>)}</div> : <div className={styles.empty}><IconShare size={28}/><h3>No engagement data available</h3><p>Provider inbox permissions are not configured. Social Center will not pretend messages were synced.</p></div>}</section>;
}

function MediaTab({ board, openComposer }: { board: SocialBoard; openComposer: (asset?: string) => void }) {
  return <section className={styles.tabPanel}><div className={styles.sectionHead}><div><h2>Client Media Library</h2><p>Uses the existing private Content Studio asset storage.</p></div><Link className={styles.secondaryButton} href="/admin/marketing/content">Open Content Studio</Link></div>{board.assets.length ? <div className={styles.assetGrid}>{board.assets.map((asset) => <article key={asset.id}><div className={styles.assetPreview}><IconImage size={28}/><span>{asset.type}</span></div><b>{asset.title}</b><small>{new Date(asset.createdAt).toLocaleDateString()}</small><button className={styles.secondaryButton} onClick={() => openComposer(asset.id)}>Use in Post</button></article>)}</div> : <div className={styles.empty}><IconImage size={28}/><h3>No media assets</h3><p>Upload approved graphics, photos, and videos in Content Studio.</p></div>}</section>;
}

function AutomationsTab({ board }: { board: SocialBoard }) {
  const enabled = new Map(board.automations.map((row) => [`${row.customerId ?? "global"}:${row.key}`, row.enabled]));
  return <section className={styles.tabPanel}><div className={styles.sectionHead}><div><h2>Social Automations</h2><p>Settings reuse Social Center records and leave irreversible publishing behind approval gates.</p></div></div><div className={styles.automationClient}><label>Client scope</label><select form="noop" disabled><option>Global defaults</option></select><span>Client overrides appear after a Social Management service is assigned.</span></div><div className={styles.automationList}>{AUTOMATIONS.map(([key, title, description]) => { const isEnabled = enabled.get(`global:${key}`) ?? false; return <article key={key}><IconRepeat size={19}/><div><b>{title}</b><p>{description}</p></div><form action={toggleSocialAutomationAction}><input type="hidden" name="automation_key" value={key}/><input type="hidden" name="enabled" value={String(!isEnabled)}/><button className={`${styles.switch} ${isEnabled ? styles.switchOn : ""}`} aria-label={`${isEnabled ? "Disable" : "Enable"} ${title}`}><span/></button></form></article>; })}</div></section>;
}

function Usage({ board }: { board: SocialBoard }) {
  if (!board.serviceUsage.length) return null;
  const meter = (used: number, limit: number | null) => <><b>{used} / {limit ?? "—"}</b><i><span style={{ width: `${limit ? Math.min(100, used / limit * 100) : 0}%` }}/></i></>;
  return <section className={styles.usage}><div className={styles.sectionHead}><div><h2>Social Management Usage</h2><p>Limits come from each assigned service and its editable inclusions.</p></div></div><div>{board.serviceUsage.map((usage) => <article key={usage.assignmentId}><div><b>{usage.clientName}</b><span>{usage.manager || "No manager assigned"}</span></div><label>Posts {meter(usage.postsUsed, usage.postLimit)}</label><label>Video edits {meter(usage.videoUsed, usage.videoLimit)}</label><label>Platforms {meter(usage.platformsUsed, usage.platformLimit)}</label></article>)}</div></section>;
}

function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}><section className={`${styles.modal} ${wide ? styles.modalWide : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={close} aria-label="Close">×</button></header>{children}</section></div>;
}

function PostDetails({ post, close }: { post: SocialPostRow; close: () => void }) {
  const editable = !["published", "publishing"].includes(post.status);
  return <Modal title={post.title} close={close} wide><div className={styles.composer}><form action={updateSocialPostAction} className={styles.composerForm}><input type="hidden" name="post_id" value={post.id}/><input type="hidden" name="post_action" value="save_edit"/><div className={styles.row2}><label>Status<div><Status value={post.status}/></div></label><label>Approval<div><Status value={post.approvalStatus}/></div></label></div><label>Internal Title<input name="title" defaultValue={post.title} readOnly={!editable}/></label><label>Caption<textarea name="body" rows={7} defaultValue={post.body} readOnly={!editable}/></label><div className={styles.row2}><label>Call to Action<input name="cta" readOnly={!editable}/></label><label>Destination URL<input name="destination_url" type="url" readOnly={!editable}/></label></div>{editable ? <button className={styles.primaryButton}>Save Changes</button> : null}</form><aside className={styles.previews}><h3>Post Operations</h3><p>Scheduled time: {when(post.scheduledAt)}</p><p>Assigned to: {post.assignedTo || "Unassigned"}</p><p>Platforms: {post.platforms.map((platform) => PLATFORM_LABELS[platform]).join(", ")}</p>{post.error ? <div className={styles.flashError}>{post.error}</div> : null}{editable ? <form action={updateSocialPostAction} className={styles.modalForm}><input type="hidden" name="post_id" value={post.id}/><input type="hidden" name="post_action" value="reschedule"/><label>Reschedule<input required type="datetime-local" name="scheduled_at"/></label><button className={styles.secondaryButton}>Confirm Reschedule</button></form> : null}{post.externalUrl ? <a className={styles.secondaryButton} href={post.externalUrl} target="_blank" rel="noreferrer">Open Published Post</a> : null}</aside></div></Modal>;
}

function Composer({ board, close, initialAsset }: { board: SocialBoard; close: () => void; initialAsset?: string }) {
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<SocialPlatform[]>(["facebook"]);
  const preview = selected.filter((p) => ["facebook", "instagram", "linkedin"].includes(p));
  return <Modal title="Create Social Post" close={close} wide><form action={createSocialPostAction} className={styles.composer}><div className={styles.composerForm}><div className={styles.row2}><label>Client<select name="customer_id" defaultValue=""><option value="">Tomorrow&apos;s Tech AI</option>{board.clients.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Assigned To<input name="assigned_to" placeholder="John or team member"/></label></div><label>Platforms<div className={styles.platformPicker}>{SOCIAL_PLATFORMS.map((p) => <label key={p} className={selected.includes(p) ? styles.selectedPlatform : ""}><input type="checkbox" name="platforms" value={p} checked={selected.includes(p)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, p] : current.filter((x) => x !== p))}/><PlatformIcon platform={p}/><span>{PLATFORM_LABELS[p]}</span></label>)}</div></label><label>Internal Title<input required name="title" placeholder="October service spotlight"/></label><label>Caption<textarea required name="body" rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write the client-facing caption..."/></label><div className={styles.aiButtons}><Link href="/admin/marketing/content">Generate in Content Studio</Link><button type="button" disabled title="AI rewrite is available in Content Studio">Rewrite</button><button type="button" disabled>Shorten</button><button type="button" disabled>Add CTA</button><button type="button" disabled>Generate Hashtags</button></div><div className={styles.row2}><label>Headline<input name="headline"/></label><label>Call to Action<input name="cta" placeholder="Book now"/></label></div><label>Destination URL<input name="destination_url" type="url" placeholder="https://"/></label><div className={styles.row2}><label>Media Type<select name="media_type" defaultValue={initialAsset ? "image" : "none"}><option value="none">No media</option><option value="image">Image</option><option value="video">Video</option><option value="carousel">Carousel</option></select></label><label>Media Asset<select name="media_asset_id" defaultValue={initialAsset ?? ""}><option value="">No asset selected</option>{board.assets.map((a) => <option value={a.id} key={a.id}>{a.title}</option>)}</select></label></div><label>Hashtags<input name="hashtags" placeholder="#smallbusiness #centraltexas"/></label><div className={styles.row2}><label>Alt Text<input name="alt_text"/></label><label>Location<input name="location"/></label></div><label>First Comment<textarea name="first_comment" rows={2}/></label><div className={styles.row2}><label>Approval<select name="approval_type" defaultValue="none"><option value="none">No Approval Required</option><option value="internal">Internal Approval Required</option><option value="client">Client Approval Required</option></select></label><label>Timezone<select name="timezone" defaultValue="America/Chicago"><option>America/Chicago</option><option>America/New_York</option><option>America/Denver</option><option>America/Los_Angeles</option></select></label></div><label>Schedule Date and Time<input type="datetime-local" name="scheduled_at"/></label><div className={styles.composerActions}><button className={styles.secondaryButton} type="submit" name="publish_intent" value="draft">Save Draft</button><button className={styles.primaryButton} type="submit" name="publish_intent" value="schedule">Schedule</button><button className={styles.secondaryButton} type="submit" name="publish_intent" value="publish_now">Publish Now</button></div></div><aside className={styles.previews}><h3>Approximate Platform Preview</h3><p>Layout guidance only. Each platform controls its final rendering.</p>{preview.length ? preview.map((platform) => <article key={platform}><div><PlatformIcon platform={platform}/><b>{PLATFORM_LABELS[platform]}</b></div><MediaTile post={{ mediaType: initialAsset ? "image" : "none", platforms: [platform] } as SocialPostRow} large/><p>{caption || "Your caption preview will appear here."}</p></article>) : <div className={styles.sideEmpty}>Choose Facebook, Instagram, or LinkedIn to see a preview.</div>}</aside></form></Modal>;
}

function ConnectAccount({ board, close }: { board: SocialBoard; close: () => void }) {
  return <Modal title="Connect Social Account" close={close}><form action={registerSocialAccountAction} className={styles.modalForm}><div className={styles.noticeBox}><IconAlert size={17}/><span>Provider OAuth credentials are not configured. This registers the client account as disconnected so setup can be tracked without storing or exposing a token.</span></div><label>Client<select name="customer_id" defaultValue=""><option value="">Tomorrow&apos;s Tech AI</option>{board.clients.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Platform<select name="platform" defaultValue="facebook">{SOCIAL_PLATFORMS.map((p) => <option value={p} key={p}>{PLATFORM_LABELS[p]} — Not configured</option>)}</select></label><label>Account / Page Name<input name="display_name" required/></label><label>Username or Handle<input name="handle" required placeholder="@business"/></label><label>External Account ID <small>optional</small><input name="external_id"/></label><label>Timezone<select name="timezone" defaultValue="America/Chicago"><option>America/Chicago</option><option>America/New_York</option><option>America/Denver</option><option>America/Los_Angeles</option></select></label><button className={styles.primaryButton}>Register Account</button></form></Modal>;
}

export default function SocialCenter({ board, filters, notice, error }: { board: SocialBoard; filters: SocialFilters; notice?: string; error?: string }) {
  const [composer, setComposer] = useState<{ open: boolean; asset?: string }>({ open: false });
  const [connect, setConnect] = useState(false);
  const [detailOpen, setDetailOpen] = useState(Boolean(filters.post));
  const selectedPost = filters.post ? board.posts.find((post) => post.id === filters.post) : undefined;
  const tabHref = (tab: SocialFilters["tab"]) => `${BASE}?tab=${tab}`;
  const activeContent = useMemo(() => {
    if (filters.tab === "calendar") return <CalendarTab posts={board.posts}/>;
    if (filters.tab === "analytics") return <AnalyticsTab board={board}/>;
    if (filters.tab === "engagement") return <EngagementTab board={board}/>;
    if (filters.tab === "media") return <MediaTab board={board} openComposer={(asset) => setComposer({ open: true, asset })}/>;
    if (filters.tab === "automations") return <AutomationsTab board={board}/>;
    return <Queue board={board} filters={filters}/>;
  }, [board, filters]);

  return <div className={styles.page}><header className={styles.header}><div><h1>Social Center</h1><p>Manage content, publishing, engagement, approvals, and performance across every connected client account.</p></div><div><button className={styles.primaryButton} onClick={() => setComposer({ open: true })}>＋ Create Post</button><button className={styles.secondaryButton} onClick={() => setConnect(true)}>⌁ Connect Account</button><Link className={styles.secondaryButton} href={`${BASE}?tab=calendar`}><IconCalendar size={15}/> Open Calendar</Link></div></header>{notice ? <div className={styles.flashSuccess}><IconCheck size={16}/>{notice}</div> : null}{error ? <div className={styles.flashError}><IconAlert size={16}/>{error}</div> : null}<Kpis board={board}/><Attention board={board}/><nav className={styles.tabs}>{TABS.map((tab) => <Link className={filters.tab === tab.id ? styles.active : ""} href={tabHref(tab.id)} key={tab.id}>{tab.label}{tab.id === "queue" && board.posts.length ? <span>{board.posts.length}</span> : null}{tab.id === "engagement" && board.engagement.length ? <span>{board.engagement.length}</span> : null}</Link>)}</nav><main className={styles.layout}><div className={styles.mainColumn}>{activeContent}{filters.tab === "queue" ? <><ScheduledPreview posts={board.scheduledPreview}/><Usage board={board}/></> : null}</div><aside className={styles.sideColumn}><Accounts board={board}/><Performance board={board}/><TopPost post={board.topPost}/></aside></main>{composer.open ? <Composer board={board} close={() => setComposer({ open: false })} initialAsset={composer.asset}/> : null}{connect ? <ConnectAccount board={board} close={() => setConnect(false)}/> : null}{detailOpen && selectedPost ? <PostDetails post={selectedPost} close={() => setDetailOpen(false)}/> : null}</div>;
}
