"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  deleteArticleAction,
  restoreRevisionAction,
  saveArticleAction,
  setArticleStatusAction,
  type BlogActionResult,
} from "@/app/admin/blog-actions";
import {
  checkArticle,
  normalize,
  SEO_DESC_MAX,
  SEO_TITLE_MAX,
  slugify,
  slugLocked,
  todayCentral,
  type EditableArticle,
} from "@/lib/blog/editor-model";
import { CALLOUT_TYPES, countWords, renderMarkdown } from "@/lib/blog/markdown";
import { uploadArticleImage } from "@/lib/blog/upload-image";
import type { ArticleStatus, CategorySlug } from "@/lib/blog/types";
import { DiscrepanciesEditor, SourcesEditor, SpecsEditor } from "./FactEditors";
import type { BlogReview } from "@/lib/blog/review";

export type EditorRevision = { id: string; created_at: string; note: string | null; actor: string | null };
export type EditorCategory = { slug: CategorySlug; name: string; cta: { service: string; label: string; blurb: string } };

type Props = {
  id: string | null;
  initial: EditableArticle;
  revisions: EditorRevision[];
  categories: EditorCategory[];
  authors: { id: string; name: string }[];
  siteUrl: string;
  /** Server-rendered Performance tab (saved articles only). */
  performance?: ReactNode;
};

const TABS = [
  { key: "write", label: "Write" },
  { key: "facts", label: "Sources & facts" },
  { key: "image", label: "Image" },
  { key: "seo", label: "SEO & call to action" },
  { key: "settings", label: "Settings" },
  { key: "review", label: "AI review" },
  { key: "performance", label: "Performance" },
  { key: "history", label: "History" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const STATUS_CHIP: Record<ArticleStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "t-muted" },
  scheduled: { label: "Scheduled", tone: "t-info" },
  published: { label: "Published", tone: "t-ok" },
  archived: { label: "Archived", tone: "t-warn" },
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** publishedAt ↔ the date and optional time inputs (time in this browser's zone). */
function dateParts(v: string): { date: string; time: string } {
  if (!v) return { date: "", time: "" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { date: v, time: "" };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
function fromParts(date: string, time: string): string {
  if (!date) return "";
  if (!time) return date;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? date : d.toISOString();
}

export function ArticleEditor({ id: initialId, initial, revisions, categories, authors, siteUrl, performance }: Props) {
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const [a, setA] = useState<EditableArticle>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(normalize(initial)));
  const [tab, setTab] = useState<Tab>("write");
  const [result, setResult] = useState<BlogActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(() => Boolean(initial.slug) && initial.slug !== slugify(initial.title));
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // "Future" is judged against when the editor opened; precise enough for choosing Publish vs Schedule.
  const [openedAt] = useState(() => Date.now());
  // AI review: suggestions only; nothing is applied unless John clicks "Use".
  const [review, setReview] = useState<BlogReview | null>(null);
  const [reviewedBody, setReviewedBody] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<Set<number>>(() => new Set());
  const today = todayCentral();

  const status = a.status;
  const dirty = JSON.stringify(normalize(a)) !== saved;
  const locked = slugLocked(status);
  const category = categories.find((c) => c.slug === a.category) ?? categories[0];

  const set = useCallback((patch: Partial<EditableArticle>) => setA((prev) => ({ ...prev, ...patch })), []);

  // Live checks against the status the next step would give it.
  const deferred = useDeferredValue(a);
  // A draft dated in the future is headed for Schedule, otherwise for Publish.
  const futureDated = Boolean(deferred.publishedAt) && Date.parse(deferred.publishedAt) > openedAt;
  const target: ArticleStatus = status === "draft" ? (futureDated ? "scheduled" : "published") : status;
  const issues = useMemo(() => checkArticle(deferred, target), [deferred, target]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const hints: string[] = [];
  const seoTitle = a.seo?.title?.trim() || a.title.trim();
  const seoDesc = a.seo?.description?.trim() || a.summary.trim();
  if (seoTitle.length > SEO_TITLE_MAX) hints.push(`Search title is ${seoTitle.length} characters; Google shows about ${SEO_TITLE_MAX}. Set a shorter one under SEO.`);
  if (seoDesc.length > SEO_DESC_MAX) hints.push(`Search description is ${seoDesc.length} characters; about ${SEO_DESC_MAX} show.`);
  if (!a.hero?.src) hints.push("No hero image. It is also the share image on LinkedIn and Facebook.");
  if (a.summary.trim() && a.summary.trim().length < 70) hints.push("The summary is short; one or two full sentences works best.");

  const words = useMemo(() => countWords(deferred.body), [deferred.body]);
  const sourceIds = (a.sources ?? []).map((s) => s.id).filter(Boolean);
  const preview = useMemo(() => {
    try {
      return renderMarkdown(deferred.body, { sourceIds: (deferred.sources ?? []).map((s) => s.id) });
    } catch {
      return <p className="cc-faint">The body can&apos;t be previewed yet.</p>;
    }
  }, [deferred.body, deferred.sources]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── Writing helpers ──────────────────────────────────────────────────
  const insert = useCallback(
    (before: string, after = "", placeholder = "") => {
      const el = bodyRef.current;
      setTab("write");
      setA((prev) => {
        const start = el?.selectionStart ?? prev.body.length;
        const end = el?.selectionEnd ?? prev.body.length;
        const selected = prev.body.slice(start, end) || placeholder;
        const body = prev.body.slice(0, start) + before + selected + after + prev.body.slice(end);
        requestAnimationFrame(() => {
          if (!el) return;
          el.focus();
          const caret = start + before.length;
          el.setSelectionRange(caret, caret + selected.length);
        });
        return { ...prev, body };
      });
    },
    []
  );
  const block = (text: string) => {
    const el = bodyRef.current;
    const pos = el?.selectionStart ?? a.body.length;
    const lead = pos === 0 || a.body.slice(0, pos).endsWith("\n\n") ? "" : a.body.slice(0, pos).endsWith("\n") ? "\n" : "\n\n";
    insert(`${lead}${text}`, "\n\n");
  };

  // ── Saving and status ────────────────────────────────────────────────
  const save = useCallback(
    async (quiet = false): Promise<string | null> => {
      const res = await saveArticleAction(id, a);
      if (!quiet || !res.ok) setResult(res);
      if (!res.ok || !res.id) return null;
      setSaved(JSON.stringify(normalize(a)));
      if (!id) {
        setId(res.id);
        router.replace(`/admin/blog/${res.id}/edit`);
      } else router.refresh();
      return res.id;
    },
    [a, id, router]
  );

  const run = (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    });
  };

  const onSave = () => run("save", async () => void (await save()));

  const changeStatus = (action: "publish" | "schedule" | "unpublish" | "archive", confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    run(action, async () => {
      const articleId = dirty || !id ? await save(true) : id;
      if (!articleId) return;
      const res = await setArticleStatusAction(articleId, action);
      setResult(res);
      if (res.ok && res.status) {
        const nextStatus = res.status;
        setA((prev) => {
          const next = { ...prev, status: nextStatus, publishedAt: res.publishedAt ?? prev.publishedAt };
          setSaved(JSON.stringify(normalize(next)));
          return next;
        });
        router.refresh();
      }
    });
  };

  const onDelete = () => {
    if (!id) return;
    if (!window.confirm(`Delete "${a.title}" permanently, with its history? This can't be undone.`)) return;
    run("delete", async () => {
      const res = await deleteArticleAction(id, deleteConfirm);
      setResult(res);
      if (res.ok) {
        setSaved(JSON.stringify(normalize(a)));
        router.push("/admin/blog");
      }
    });
  };

  const runReview = async () => {
    setReviewing(true);
    setReviewError(null);
    try {
      const res = await fetch("/api/admin/blog/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article: a }),
      });
      const data = (await res.json().catch(() => ({}))) as { review?: BlogReview; error?: string };
      if (!res.ok || !data.review) throw new Error(data.error || "The review is unavailable right now.");
      setReview(data.review);
      setReviewedBody(a.body);
      setNotFound(new Set());
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "The review failed.");
    } finally {
      setReviewing(false);
    }
  };

  /** Jump to a quoted passage in the body and select it. */
  const findInBody = (quote: string, index: number) => {
    const at = a.body.indexOf(quote);
    if (at < 0) {
      setNotFound((prev) => new Set(prev).add(index));
      return;
    }
    setTab("write");
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at + quote.length);
      const line = a.body.slice(0, at).split("\n").length;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      el.scrollTop = Math.max(0, (line - 3) * lh);
    });
  };

  const onRestore = (rev: EditorRevision) => {
    if (!id) return;
    if (dirty && !window.confirm("You have unsaved changes; restoring replaces them. Continue?")) return;
    if (!window.confirm(`Restore the version from ${fmtWhen(rev.created_at)}? The current text is kept in History.`)) return;
    run("restore", async () => {
      const res = await restoreRevisionAction(id, rev.id);
      setResult(res);
      // Reload so the editor shows the restored content.
      if (res.ok) window.location.reload();
    });
  };

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!pending) onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Images ───────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState<string | null>(null);
  const upload = async (file: File | undefined, apply: (url: string) => void, label: string) => {
    if (!file) return;
    setUploading(label);
    const res = await uploadArticleImage(file, a.slug);
    setUploading(null);
    if ("error" in res) setResult({ ok: false, message: res.error });
    else apply(res.url);
  };

  const parts = dateParts(a.publishedAt);
  const livePath = `/blog/${a.slug}`;
  const canPublish = errors.length === 0;
  const chip = STATUS_CHIP[status];

  return (
    <div className="be-root">
      {/* ── Action bar ─────────────────────────────────────────────── */}
      <div className="be-bar">
        <Link href="/admin/blog" className="cc-btn ghost is-sm">← Blog</Link>
        <div className="be-bar-title">
          <strong>{a.title.trim() || "Untitled article"}</strong>
          <span className={`cc-chip ${chip.tone}`}>{chip.label}</span>
          <span className="be-savestate" aria-live="polite">
            {busy === "save" ? "Saving…" : dirty ? "Unsaved changes" : id ? "All changes saved" : "Not saved yet"}
          </span>
        </div>
        <div className="be-bar-actions">
          {id ? (
            <a className="cc-btn is-sm" href={`/admin/blog/${id}/preview`} target="_blank" rel="noopener noreferrer" title="Opens the last saved version exactly as readers will see it">
              Full preview ↗
            </a>
          ) : null}
          {status === "published" || status === "archived" ? (
            <a className="cc-btn is-sm" href={livePath} target="_blank" rel="noopener noreferrer">View live ↗</a>
          ) : null}
          <button
            type="button"
            className="cc-btn"
            onClick={onSave}
            disabled={pending || (!dirty && Boolean(id)) || ((status === "published" || status === "scheduled") && !canPublish)}
            title={(status === "published" || status === "scheduled") && !canPublish ? "This article is live; fix the errors in Checks before updating it" : "Ctrl+S"}
          >
            {status === "published" || status === "scheduled" ? "Update" : "Save draft"}
          </button>
          {status === "draft" ? (
            <>
              <button
                type="button"
                className="cc-btn"
                disabled={pending || !canPublish}
                title={canPublish ? "Goes live automatically at the publish date and time in Settings" : "Fix the errors in Checks first"}
                onClick={() => changeStatus("schedule", "Schedule this article to go live at its publish date and time?")}
              >
                Schedule
              </button>
              <button
                type="button"
                className="cc-btn primary"
                disabled={pending || !canPublish}
                title={canPublish ? undefined : "Fix the errors in Checks first"}
                onClick={() => changeStatus("publish", `Publish now? It goes live at ${siteUrl}${livePath} and appears on the blog, feed and sitemap.`)}
              >
                {busy === "publish" ? "Publishing…" : "Publish"}
              </button>
            </>
          ) : null}
          {status === "scheduled" ? (
            <button type="button" className="cc-btn primary" disabled={pending || !canPublish} onClick={() => changeStatus("publish", "Publish now instead of waiting for the scheduled time?")}>
              Publish now
            </button>
          ) : null}
          {status === "archived" ? (
            <button type="button" className="cc-btn primary" disabled={pending || !canPublish} onClick={() => changeStatus("publish", "Put this article back on the blog, feed and sitemap?")}>
              Republish
            </button>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className={`be-result ${result.ok ? "is-ok" : "is-err"}`} role={result.ok ? "status" : "alert"}>
          <span>{result.message}</span>
          {result.errors?.length ? (
            <ul>
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="be-result-x" onClick={() => setResult(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      <div className={`be-grid${showPreview ? "" : " no-preview"}`}>
        {/* ── Left: the form ───────────────────────────────────────── */}
        <div className="be-form">
          <div className="cc-tabs be-tabs" role="tablist" aria-label="Editor sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`cc-tab ${tab === t.key ? "is-on" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.key === "facts" && (a.sources?.length ?? 0) > 0 ? <span className="cc-tab-n">{a.sources?.length}</span> : null}
                {t.key === "history" && revisions.length > 0 ? <span className="cc-tab-n">{revisions.length}</span> : null}
              </button>
            ))}
            <button type="button" className="cc-btn ghost is-sm be-previewtoggle" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
          </div>

          {tab === "write" ? (
            <div className="be-pane">
              <label className="cc-field">
                <span className="cc-label">Headline</span>
                <input
                  className="cc-input be-title"
                  value={a.title}
                  onChange={(e) => set({ title: e.target.value, ...(!locked && !slugTouched ? { slug: slugify(e.target.value) } : {}) })}
                  placeholder="What happened, and why it matters to a business owner"
                />
              </label>
              <label className="cc-field">
                <span className="cc-label">Summary ({a.summary.trim().length} characters)</span>
                <textarea className="cc-textarea" rows={3} value={a.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="One or two sentences under the headline. Also the search and share description unless SEO overrides it." />
              </label>
              <div className="cc-field">
                <span className="cc-label">Body · {words.toLocaleString()} words · {Math.max(1, Math.round(words / 230))} min read</span>
                <div className="be-toolbar" role="toolbar" aria-label="Formatting">
                  <button type="button" className="cc-btn is-sm" onClick={() => block("## ")} title="Section heading">H2</button>
                  <button type="button" className="cc-btn is-sm" onClick={() => block("### ")} title="Sub-heading">H3</button>
                  <button type="button" className="cc-btn is-sm" onClick={() => insert("**", "**", "bold text")}><b>B</b></button>
                  <button type="button" className="cc-btn is-sm" onClick={() => insert("*", "*", "italic text")}><i>I</i></button>
                  <button type="button" className="cc-btn is-sm" onClick={() => insert("[", "](https://)", "link text")}>Link</button>
                  <button type="button" className="cc-btn is-sm" onClick={() => block("- ")}>• List</button>
                  <button type="button" className="cc-btn is-sm" onClick={() => block("1. ")}>1. List</button>
                  <button type="button" className="cc-btn is-sm" onClick={() => block("> ")}>Quote</button>
                  <select
                    className="cc-select be-toolselect"
                    value=""
                    aria-label="Insert callout"
                    onChange={(e) => {
                      if (e.target.value) block(`> [!${e.target.value}] Title\n> Text`);
                    }}
                  >
                    <option value="">Callout…</option>
                    {CALLOUT_TYPES.map((t) => (
                      <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                  <button type="button" className="cc-btn is-sm" onClick={() => block("| Column | Column |\n|---|---|\n| Value | Value |")}>Table</button>
                  <button type="button" className="cc-btn is-sm" onClick={() => block("---")}>Divider</button>
                  <select
                    className="cc-select be-toolselect"
                    value=""
                    aria-label="Cite a source"
                    onChange={(e) => e.target.value && insert(`[^${e.target.value}]`)}
                    disabled={sourceIds.length === 0}
                    title={sourceIds.length ? undefined : "Add sources under Sources & facts"}
                  >
                    <option value="">Cite…</option>
                    {sourceIds.map((sid) => (
                      <option key={sid} value={sid}>{sid}</option>
                    ))}
                  </select>
                  <label className="cc-btn is-sm be-upload">
                    {uploading === "body" ? "Uploading…" : "Image"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void upload(f, (url) => block(`![Describe what the image shows](${url} "Caption | Credit: who made it")`), "body");
                      }}
                    />
                  </label>
                </div>
                <textarea
                  ref={bodyRef}
                  className="cc-textarea be-body"
                  value={a.body}
                  onChange={(e) => set({ body: e.target.value })}
                  spellCheck
                  placeholder={"Write in Field Notes Markdown.\n\n## A section heading\n\nParagraphs are separated by a blank line. Cite sources like this.[^source-id]"}
                />
              </div>
            </div>
          ) : null}

          {tab === "facts" ? (
            <div className="be-pane">
              <h3 className="be-h">Sources</h3>
              <SourcesEditor sources={a.sources ?? []} onChange={(sources) => set({ sources })} onCite={(sid) => insert(`[^${sid}]`)} today={today} />
              <h3 className="be-h">Technical specs</h3>
              <SpecsEditor specs={a.specs ?? []} sourceIds={sourceIds} onChange={(specs) => set({ specs })} />
              <h3 className="be-h">Where sources disagree</h3>
              <DiscrepanciesEditor items={a.discrepancies ?? []} sourceIds={sourceIds} onChange={(discrepancies) => set({ discrepancies })} />
            </div>
          ) : null}

          {tab === "image" ? (
            <div className="be-pane">
              <p className="be-help">The hero sits under the headline and is the share image on social media. Use 1600×900 or wider; WebP keeps it light.</p>
              <div className="be-hero">
                {a.hero?.src ? (
                  // Admin-only thumbnail; plain img so any path or upload shows immediately.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.hero.src} alt="" className="be-hero-img" />
                ) : (
                  <div className="be-hero-empty">No hero image</div>
                )}
                <div className="be-hero-actions">
                  <label className="cc-btn be-upload">
                    {uploading === "hero" ? "Uploading…" : a.hero?.src ? "Replace image" : "Upload image"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        void upload(f, (url) => set({ hero: { alt: "", ...a.hero, src: url } }), "hero");
                      }}
                    />
                  </label>
                  {a.hero?.src ? (
                    <button type="button" className="cc-btn is-danger" onClick={() => set({ hero: undefined })}>Remove</button>
                  ) : null}
                </div>
              </div>
              <label className="cc-field">
                <span className="cc-label">Image address</span>
                <input className="cc-input" value={a.hero?.src ?? ""} onChange={(e) => set({ hero: { alt: "", ...a.hero, src: e.target.value } })} placeholder="/blog/file.webp or an uploaded image URL" />
              </label>
              <label className="cc-field">
                <span className="cc-label">Alt text: describe what the image shows</span>
                <input className="cc-input" value={a.hero?.alt ?? ""} onChange={(e) => set({ hero: { src: "", ...a.hero, alt: e.target.value } })} placeholder="e.g. Server rack with four GPUs on a workbench" disabled={!a.hero?.src} />
              </label>
              <div className="be-cols">
                <label className="cc-field">
                  <span className="cc-label">Credit</span>
                  <input className="cc-input" value={a.hero?.credit ?? ""} onChange={(e) => set({ hero: { src: "", alt: "", ...a.hero, credit: e.target.value } })} placeholder="e.g. Illustration: Tomorrow’s Tech AI" disabled={!a.hero?.src} />
                </label>
                <label className="cc-field">
                  <span className="cc-label">Credit link (optional)</span>
                  <input className="cc-input" value={a.hero?.creditUrl ?? ""} onChange={(e) => set({ hero: { src: "", alt: "", ...a.hero, creditUrl: e.target.value } })} placeholder="https://…" disabled={!a.hero?.src} />
                </label>
              </div>
              <label className="cc-field">
                <span className="cc-label">Caption (optional)</span>
                <input className="cc-input" value={a.hero?.caption ?? ""} onChange={(e) => set({ hero: { src: "", alt: "", ...a.hero, caption: e.target.value } })} disabled={!a.hero?.src} />
              </label>
              <p className="be-help">Only credit what you can confirm: who made the image, or &quot;AI-generated illustration&quot; when it is one.</p>
            </div>
          ) : null}

          {tab === "seo" ? (
            <div className="be-pane">
              <h3 className="be-h">Search result</h3>
              <div className="be-serp" aria-label="Search result preview">
                <span className="be-serp-url">{siteUrl.replace(/^https:\/\//, "")} › blog › {a.slug || "slug"}</span>
                <span className="be-serp-title">{seoTitle || "Headline"}</span>
                <span className="be-serp-desc">{seoDesc.length > SEO_DESC_MAX ? `${seoDesc.slice(0, SEO_DESC_MAX - 1)}…` : seoDesc || "Summary"}</span>
              </div>
              <label className="cc-field">
                <span className="cc-label">
                  Search title · {(a.seo?.title?.trim() || a.title.trim()).length}/{SEO_TITLE_MAX}
                </span>
                <input className="cc-input" value={a.seo?.title ?? ""} onChange={(e) => set({ seo: { ...a.seo, title: e.target.value } })} placeholder={a.title || "Defaults to the headline"} />
              </label>
              <label className="cc-field">
                <span className="cc-label">
                  Search description · {(a.seo?.description?.trim() || a.summary.trim()).length}/{SEO_DESC_MAX}
                </span>
                <textarea className="cc-textarea" rows={3} value={a.seo?.description ?? ""} onChange={(e) => set({ seo: { ...a.seo, description: e.target.value } })} placeholder={a.summary || "Defaults to the summary"} />
              </label>
              <label className="cc-field">
                <span className="cc-label">Canonical URL (only for articles first published elsewhere)</span>
                <input className="cc-input" value={a.seo?.canonical ?? ""} onChange={(e) => set({ seo: { ...a.seo, canonical: e.target.value } })} placeholder={`${siteUrl}${livePath}`} />
              </label>

              <h3 className="be-h">When shared</h3>
              <p className="be-help">
                LinkedIn, Facebook and X show the full headline, the search description and the hero image.
                {a.hero?.src ? "" : " With no hero image the post gets the generic Field Notes card; add one under Image."}
              </p>
              <div className="be-shares">
                <figure className="be-share be-share-li" aria-label="LinkedIn preview">
                  <figcaption>LinkedIn</figcaption>
                  {a.hero?.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.hero.src} alt="" />
                  ) : (
                    <div className="be-share-noimg">Field Notes default card</div>
                  )}
                  <div className="be-share-text">
                    <strong>{a.title || "Headline"}</strong>
                    <span>{siteUrl.replace(/^https:\/\/(www\.)?/, "")}</span>
                  </div>
                </figure>
                <figure className="be-share be-share-fb" aria-label="Facebook preview">
                  <figcaption>Facebook</figcaption>
                  {a.hero?.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.hero.src} alt="" />
                  ) : (
                    <div className="be-share-noimg">Field Notes default card</div>
                  )}
                  <div className="be-share-text">
                    <span className="be-share-domain">{siteUrl.replace(/^https:\/\/(www\.)?/, "").toUpperCase()}</span>
                    <strong>{a.title || "Headline"}</strong>
                    <span className="be-share-desc">{seoDesc || "Summary"}</span>
                  </div>
                </figure>
              </div>

              <h3 className="be-h">Call to action</h3>
              <p className="be-help">
                By default the article uses the {category?.name} section&apos;s call to action: <strong>{category?.cta.label}</strong>. Override it when
                a specific service fits this story better.
              </p>
              <label className="be-check">
                <input
                  type="checkbox"
                  checked={Boolean(a.cta)}
                  onChange={(e) => set({ cta: e.target.checked ? { ...(category?.cta ?? { service: "", label: "", blurb: "" }) } : undefined })}
                />{" "}
                Use a custom call to action for this article
              </label>
              {a.cta ? (
                <div className="be-card" style={{ marginTop: 10 }}>
                  <div className="be-cols">
                    <label className="cc-field">
                      <span className="cc-label">Button label</span>
                      <input className="cc-input" value={a.cta.label} onChange={(e) => set({ cta: { ...a.cta!, label: e.target.value } })} />
                    </label>
                    <label className="cc-field">
                      <span className="cc-label">Service tag (for the lead)</span>
                      <input className="cc-input be-mono" value={a.cta.service} onChange={(e) => set({ cta: { ...a.cta!, service: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } })} />
                    </label>
                  </div>
                  <label className="cc-field">
                    <span className="cc-label">Blurb</span>
                    <textarea className="cc-textarea" rows={2} value={a.cta.blurb} onChange={(e) => set({ cta: { ...a.cta!, blurb: e.target.value } })} />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "settings" ? (
            <div className="be-pane">
              <label className="cc-field">
                <span className="cc-label">URL</span>
                <div className="be-slug">
                  <span className="be-slug-pre">/blog/</span>
                  <input
                    className="cc-input be-mono"
                    value={a.slug}
                    disabled={locked}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
                    }}
                  />
                </div>
                <span className="be-help">
                  {locked ? "Locked: this URL has been public, so changing it would break links." : "Set from the headline until you edit it. It can't change after publishing."}
                </span>
              </label>
              <div className="be-cols">
                <label className="cc-field">
                  <span className="cc-label">Section</span>
                  <select className="cc-select" value={a.category} onChange={(e) => set({ category: e.target.value as CategorySlug })}>
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label className="cc-field">
                  <span className="cc-label">Author</span>
                  <select className="cc-select" value={a.authorId ?? "editorial-team"} onChange={(e) => set({ authorId: e.target.value })}>
                    {authors.map((au) => (
                      <option key={au.id} value={au.id}>{au.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="cc-field">
                <span className="cc-label">Also list under</span>
                <div className="be-chips">
                  {categories
                    .filter((c) => c.slug !== a.category)
                    .map((c) => {
                      const on = a.secondaryCategories?.includes(c.slug) ?? false;
                      return (
                        <button
                          key={c.slug}
                          type="button"
                          className={`cc-btn is-sm${on ? " is-on" : ""}`}
                          aria-pressed={on}
                          onClick={() =>
                            set({ secondaryCategories: on ? (a.secondaryCategories ?? []).filter((x) => x !== c.slug) : [...(a.secondaryCategories ?? []), c.slug] })
                          }
                        >
                          {c.name}
                        </button>
                      );
                    })}
                </div>
              </div>
              <label className="cc-field">
                <span className="cc-label">Tags (comma separated)</span>
                <input
                  className="cc-input"
                  defaultValue={a.tags.join(", ")}
                  onBlur={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                  placeholder="e.g. Nvidia, GPUs, key-person risk"
                />
              </label>
              <label className="be-check">
                <input type="checkbox" checked={Boolean(a.featured)} onChange={(e) => set({ featured: e.target.checked })} /> Feature as the lead story on the blog
              </label>

              <h3 className="be-h">Dates</h3>
              <div className="be-cols">
                <label className="cc-field">
                  <span className="cc-label">Publish date</span>
                  <input type="date" className="cc-input" value={parts.date} onChange={(e) => set({ publishedAt: fromParts(e.target.value, parts.time) })} />
                </label>
                <label className="cc-field">
                  <span className="cc-label">Time (only to schedule)</span>
                  <input type="time" className="cc-input" value={parts.time} disabled={!parts.date} onChange={(e) => set({ publishedAt: fromParts(parts.date, e.target.value) })} />
                </label>
              </div>
              <p className="be-help">
                {status === "draft" && !a.publishedAt
                  ? "Left empty, Publish uses today's date. To schedule, set a future date and time, then Schedule."
                  : "The date readers see. A published article can't have a future date; schedule it instead."}
              </p>
              <div className="be-cols">
                <label className="cc-field">
                  <span className="cc-label">Updated date (after a meaningful edit)</span>
                  <input type="date" className="cc-input" value={(a.updatedAt ?? "").slice(0, 10)} onChange={(e) => set({ updatedAt: e.target.value || undefined })} />
                </label>
                <div className="cc-field be-endrow">
                  <button type="button" className="cc-btn is-sm" onClick={() => set({ updatedAt: today })}>Mark updated today</button>
                  {a.updatedAt ? (
                    <button type="button" className="cc-btn is-sm ghost" onClick={() => set({ updatedAt: undefined })}>Clear</button>
                  ) : null}
                </div>
              </div>
              <label className="cc-field">
                <span className="cc-label">Read time label (optional)</span>
                <input className="cc-input" value={a.readTime ?? ""} onChange={(e) => set({ readTime: e.target.value })} placeholder={`${Math.max(1, Math.round(words / 230))} min read (automatic)`} />
              </label>
              {a.legacy ? <p className="be-help">Legacy article: written before the current editorial standards, so missing credits and sources are warnings, not errors.</p> : null}

              {id ? (
                <>
                  <h3 className="be-h">Visibility</h3>
                  <div className="be-danger">
                    {status === "published" || status === "scheduled" ? (
                      <button type="button" className="cc-btn" disabled={pending} onClick={() => changeStatus("unpublish", `Unpublish? ${livePath} stops working and the article becomes a draft.`)}>
                        {status === "scheduled" ? "Cancel schedule (back to draft)" : "Unpublish (back to draft)"}
                      </button>
                    ) : null}
                    {status === "published" ? (
                      <button type="button" className="cc-btn" disabled={pending} onClick={() => changeStatus("archive", "Archive? It leaves the blog lists, feed and sitemap, but the URL keeps working for old links.")}>
                        Archive
                      </button>
                    ) : null}
                    {status === "archived" ? (
                      <button type="button" className="cc-btn" disabled={pending} onClick={() => changeStatus("unpublish", `Move back to drafts? ${livePath} stops working.`)}>
                        Back to draft
                      </button>
                    ) : null}
                  </div>
                  {status === "draft" || status === "archived" ? (
                    <div className="be-card be-delete">
                      <p className="be-help" style={{ marginTop: 0 }}>
                        Delete permanently, with all history. Type <code>{a.slug}</code> to confirm.
                      </p>
                      <div className="be-account">
                        <input className="cc-input be-mono" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} aria-label="Type the slug to confirm" />
                        <button type="button" className="cc-btn is-danger" disabled={pending || deleteConfirm !== a.slug} onClick={onDelete}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {tab === "review" ? (
            <div className="be-pane">
              <h3 className="be-h">Second read</h3>
              <p className="be-help">
                Claude reads the draft like an editor: claims that need a source, whether the summary is clear, and search titles.
                It only suggests. Nothing changes unless you click Use, and the checks on the right still decide what can be published.
              </p>
              <div className="be-reviewbar">
                <button type="button" className="cc-btn primary" disabled={reviewing || a.body.trim().length < 200} onClick={runReview}>
                  {reviewing ? "Reading…" : review ? "Review again" : "Review with AI"}
                </button>
                {a.body.trim().length < 200 ? <span className="cc-faint">Write a few paragraphs first.</span> : null}
                {reviewing ? <span className="cc-faint">Usually 20 to 60 seconds.</span> : null}
                {review && reviewedBody !== a.body && !reviewing ? <span className="cc-faint">The body changed since this review.</span> : null}
              </div>
              {reviewError ? (
                <p className="be-result is-err" role="alert" style={{ marginTop: 12 }}>
                  {reviewError}
                </p>
              ) : null}

              {review ? (
                <div className="be-review">
                  <h3 className="be-h">Claims to check ({review.claims.length})</h3>
                  {review.claims.length ? (
                    <ol className="be-review-list">
                      {review.claims.map((c, i) => (
                        <li key={`${i}-${c.quote}`}>
                          <blockquote>{c.quote}</blockquote>
                          <p>{c.why}</p>
                          <button type="button" className="cc-btn ghost is-sm" disabled={notFound.has(i)} onClick={() => findInBody(c.quote, i)}>
                            {notFound.has(i) ? "Not found (edited since?)" : "Find in body"}
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="be-help">Every checkable claim has a citation.</p>
                  )}

                  <h3 className="be-h">Summary</h3>
                  <p className="be-help" style={{ marginBottom: 6 }}>
                    <span className={`cc-chip ${review.summary.verdict === "clear" ? "t-ok" : "t-warn"}`}>{review.summary.verdict}</span> {review.summary.note}
                  </p>
                  {review.summary.suggestion ? (
                    <div className="be-suggest">
                      <p>{review.summary.suggestion}</p>
                      <button
                        type="button"
                        className="cc-btn is-sm"
                        disabled={a.summary === review.summary.suggestion}
                        onClick={() => set({ summary: review.summary.suggestion ?? a.summary })}
                      >
                        {a.summary === review.summary.suggestion ? "In use" : "Use this summary"}
                      </button>
                    </div>
                  ) : null}

                  <h3 className="be-h">Search titles</h3>
                  {review.seoTitles.map((t) => (
                    <div className="be-suggest" key={t}>
                      <p>
                        {t} <span className="cc-faint">({t.length} characters)</span>
                      </p>
                      <button type="button" className="cc-btn is-sm" disabled={a.seo?.title === t} onClick={() => set({ seo: { ...(a.seo ?? {}), title: t } })}>
                        {a.seo?.title === t ? "In use" : "Use"}
                      </button>
                    </div>
                  ))}

                  {review.other.length ? (
                    <>
                      <h3 className="be-h">Other notes</h3>
                      <ul className="be-review-notes">
                        {review.other.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <p className="be-help">Reviewed by {review.model}. Anything you use is kept only when you save the article.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "performance" ? (
            <div className="be-pane">
              {id && performance ? performance : <p className="be-help">Performance shows once the article is saved and published.</p>}
            </div>
          ) : null}

          {tab === "history" ? (
            <div className="be-pane">
              {!id ? <p className="be-help">History starts with the first save.</p> : null}
              {id && revisions.length === 0 ? <p className="be-help">No saved versions yet.</p> : null}
              <ol className="be-history">
                {revisions.map((r, i) => (
                  <li key={r.id}>
                    <div>
                      <strong>{r.note || "Saved"}</strong>
                      <span className="cc-faint">
                        {fmtWhen(r.created_at)} CT{r.actor ? ` · ${r.actor}` : ""}
                        {i === 0 ? " · current" : ""}
                      </span>
                    </div>
                    {i > 0 ? (
                      <button type="button" className="cc-btn is-sm" disabled={pending} onClick={() => onRestore(r)}>
                        Restore
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        {/* ── Right: checks and live preview ───────────────────────── */}
        {showPreview ? (
          <aside className="be-side" aria-label="Checks and preview">
            <section className={`be-checks ${errors.length ? "has-err" : "ok"}`}>
              <h3>
                {errors.length
                  ? `${errors.length} thing${errors.length === 1 ? "" : "s"} to fix before ${status === "draft" ? "publishing" : "saving"}`
                  : status === "draft"
                    ? "Ready to publish"
                    : "Passes the editorial checks"}
              </h3>
              {errors.length || warnings.length || hints.length ? (
                <ul>
                  {errors.map((e) => (
                    <li key={`e${e.message}`} className="is-err">{e.message}</li>
                  ))}
                  {warnings.map((w) => (
                    <li key={`w${w.message}`} className="is-warn">{w.message}</li>
                  ))}
                  {hints.map((h) => (
                    <li key={`h${h}`} className="is-hint">{h}</li>
                  ))}
                </ul>
              ) : null}
            </section>
            <div className="be-preview">
              <div className="be-preview-label">Live preview · body as readers see it</div>
              {a.hero?.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.hero.src} alt={a.hero.alt} className="be-preview-hero" />
              ) : null}
              <h1 className="be-preview-title">{a.title || "Headline"}</h1>
              {a.summary ? <p className="be-preview-dek">{a.summary}</p> : null}
              <div className="prose-blog fn-prose">{preview}</div>
              {(a.sources ?? []).length ? (
                <ol className="be-preview-sources">
                  {(a.sources ?? []).map((s, i) => (
                    <li key={`${s.id}-${i}`} id={`source-${s.id}`}>
                      {s.title || "Untitled"}, {s.publisher || "publisher"}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
