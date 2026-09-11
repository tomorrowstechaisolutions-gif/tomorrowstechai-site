"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  approveCampaignAction,
  checkDomainAction,
  createCampaignAction,
  enrollInSequenceAction,
  importAudienceMembersAction,
  refreshAudienceSizeAction,
  requestApprovalAction,
  reviewCampaignAction,
  saveAudienceAction,
  saveCampaignContentAction,
  saveSendingDomainAction,
  saveSequenceAction,
  saveSequenceStepAction,
  saveTemplateAction,
  scheduleCampaignAction,
  sendCampaignNowAction,
  sendTestAction,
  setCampaignAudienceAction,
  setSequenceStatusAction,
  suppressEmailAction,
  unsuppressEmailAction,
} from "@/app/admin/email-actions";
import { IconMail, IconPlus, IconX } from "../Icons";
import {
  AUDIENCE_TYPE_LABELS,
  AUDIENCE_TYPE_ORDER,
  BLOCK_LABELS,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPE_ORDER,
  DELAY_UNIT_LABELS,
  DELAY_UNIT_ORDER,
  ENROLLMENT_TRIGGER_LABELS,
  ENROLLMENT_TRIGGER_ORDER,
  PERSONALIZATION_TOKENS,
  STEP_CONDITION_LABELS,
  STEP_CONDITION_ORDER,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_ORDER,
  TIMEZONE_OPTIONS,
  slugify,
  type BlockType,
  type EmailBlock,
} from "@/lib/email-marketing/types";

/**
 * Every write surface for Email Marketing.
 *
 * One file because they share the sheet shell and the same error discipline:
 * a server action that throws must put its sentence on screen, not in the
 * console. Several of these actions REFUSE on purpose — scheduling an
 * unapproved campaign, sending to an audience where everybody is suppressed,
 * resubscribing somebody without a reason — and the refusal is the useful
 * part, so it is always rendered.
 */

/* ── Shared shell ──────────────────────────────────────────────────── */

function Sheet({
  label,
  title,
  children,
  buttonClass = "cc-add-btn",
  buttonLabel,
  wide,
}: {
  label: string;
  title: string;
  children: (close: () => void) => ReactNode;
  buttonClass?: string;
  buttonLabel?: ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        {buttonLabel ?? (<><IconPlus size={15} /><span>{label}</span></>)}
      </button>

      {open ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="cc-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={wide ? { maxWidth: 760 } : undefined}
          >
            <div className="cc-sheet-head">
              <IconMail size={17} />
              <h3>{title}</h3>
              <button
                type="button"
                className="cc-icon-btn"
                style={{ marginLeft: "auto", width: 28, height: 28 }}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <IconX size={14} />
              </button>
            </div>
            <div className="cc-sheet-body">{children(() => setOpen(false))}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ActionForm({
  action,
  submitLabel,
  onDone,
  children,
  confirm,
  danger,
}: {
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  onDone?: () => void;
  children: ReactNode;
  confirm?: string;
  danger?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      // A sheet renders inline, as a sibling of the button that opened it, so
      // any descendant rule on the surrounding container reaches inside it.
      // ".cc-rowacts form { display: inline-flex }" is one of those, and it
      // turns a stacked form into a single unreadable row. Declaring the
      // display here outranks every stylesheet rule and keeps a sheet looking
      // the same wherever its trigger button happens to sit.
      style={{ display: "block" }}
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          if (confirm && !window.confirm(confirm)) return;
          try {
            await action(fd);
            onDone?.();
          } catch (err) {
            if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
            setError(err instanceof Error ? err.message : "That did not save.");
          }
        })
      }
    >
      {children}
      {error ? <p className="cc-error" style={{ marginTop: 12 }}>{error}</p> : null}
      <div className="cc-sheet-foot">
        <button type="submit" className={`cc-btn ${danger ? "" : "primary"}`} disabled={pending}>
          {pending ? "Working…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/* ── New campaign ──────────────────────────────────────────────────── */

export function NewCampaign({
  clients,
  audiences,
  templates,
  brandProfiles,
  sendingDomains,
  services,
  people,
}: {
  clients: { id: string; name: string }[];
  audiences: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  brandProfiles: { id: string; name: string }[];
  sendingDomains: { id: string; domain: string; fromEmail: string | null }[];
  services: { id: string; name: string }[];
  people: string[];
}) {
  const [name, setName] = useState("");

  return (
    <Sheet label="Create Campaign" title="New campaign">
      {(close) => (
        <ActionForm action={createCampaignAction} submitLabel="Create campaign" onDone={close}>
          <p className="cc-subhead">Campaign setup</p>

          <div className="cc-field">
            <label className="cc-label" htmlFor="ec-name">Campaign name</label>
            <input
              id="ec-name" name="name" className="cc-input" required autoFocus
              placeholder="September Website Promo"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-internal">Internal name</label>
              <input id="ec-internal" name="internal_name" className="cc-input" placeholder="Optional" />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-slug">Slug</label>
              <input id="ec-slug" name="slug" className="cc-input" placeholder={slugify(name) || "auto"} />
            </div>
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-client">Client</label>
              <select id="ec-client" name="customer_id" className="cc-select" defaultValue="">
                <option value="">Tomorrow&rsquo;s Tech AI (internal)</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-type">Campaign type</label>
              <select id="ec-type" name="campaign_type" className="cc-select" defaultValue="newsletter">
                {CAMPAIGN_TYPE_ORDER.map((k) => (
                  <option key={k} value={k}>{CAMPAIGN_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="ec-desc">Description</label>
            <textarea id="ec-desc" name="description" className="cc-textarea" rows={2}
              placeholder="Drive website traffic for fall" />
          </div>

          <p className="cc-subhead">Audience and content</p>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-audience">Audience</label>
              <select id="ec-audience" name="audience_id" className="cc-select" defaultValue="">
                <option value="">Choose later</option>
                {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-template">Start from a template</label>
              <select id="ec-template" name="template_id" className="cc-select" defaultValue="">
                <option value="">Blank</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <p className="cc-note">
            A template is copied into the campaign once. Editing the template later will
            not rewrite a campaign that has already gone out.
          </p>

          <p className="cc-subhead">Sending and approval</p>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-domain">Sending domain</label>
              <select id="ec-domain" name="sending_domain_id" className="cc-select" defaultValue="">
                <option value="">Default</option>
                {sendingDomains.map((d) => (
                  <option key={d.id} value={d.id}>{d.domain}</option>
                ))}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-approval">Approval</label>
              <select id="ec-approval" name="approval_mode" className="cc-select" defaultValue="none">
                <option value="none">No approval required</option>
                <option value="internal">Internal approval required</option>
                <option value="client">Client approval required</option>
              </select>
            </div>
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-owner">Owner</label>
              <input id="ec-owner" name="owner" className="cc-input" list="ec-people" placeholder="name@…" />
              <datalist id="ec-people">
                {people.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-tz">Timezone</label>
              <select id="ec-tz" name="timezone" className="cc-select" defaultValue="America/Chicago">
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-brand">Brand profile</label>
              <select id="ec-brand" name="brand_profile_id" className="cc-select" defaultValue="">
                <option value="">None</option>
                {brandProfiles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="ec-service">Related service</label>
              <select id="ec-service" name="service_id" className="cc-select" defaultValue="">
                <option value="">None</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <p className="cc-note">
            Creating a campaign sends nothing. It opens as a draft — you choose the
            audience, write the content, send yourself a test, and only then schedule it.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

/* ── The block composer ────────────────────────────────────────────── */

const NEW_BLOCK: Record<BlockType, EmailBlock> = {
  heading: { type: "heading", text: "A clear heading" },
  text: { type: "text", text: "Write the message here." },
  button: { type: "button", label: "Book a call", href: "https://tomorrowstechai.com" },
  image: { type: "image", src: "", alt: "" },
  divider: { type: "divider" },
  spacer: { type: "spacer", size: 16 },
  bullets: { type: "bullets", items: ["First point", "Second point"] },
  quote: { type: "quote", text: "Something a client said." },
  fineprint: { type: "fineprint", text: "Small print." },
  signoff: { type: "signoff" },
  html: { type: "html", html: "<p>Custom HTML</p>" },
};

const ADDABLE: BlockType[] = [
  "heading", "text", "button", "bullets", "image", "quote",
  "divider", "spacer", "fineprint", "signoff",
];

/**
 * A structured block editor, not a drag-and-drop canvas.
 *
 * §12 explicitly allows this, and it is the right call: the project has no
 * drag-and-drop library and adding one would be a large dependency for a
 * worse result. More importantly, TYPED BLOCKS are what make the pre-send
 * checks possible — a slab of HTML cannot be scanned for a missing CTA or a
 * broken personalization token, and those two checks are worth more than
 * pixel-level control over a marketing email that has to survive Outlook.
 */
export function ContentComposer({
  campaignId,
  initial,
  subject,
  previewText,
  fromName,
  fromEmail,
  replyTo,
  tone,
  readOnly,
}: {
  campaignId: string;
  initial: EmailBlock[];
  subject: string | null;
  previewText: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  tone: string;
  readOnly: boolean;
}) {
  const [blocks, setBlocks] = useState<EmailBlock[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (index: number, next: EmailBlock) =>
    setBlocks((current) => current.map((b, i) => (i === index ? next : b)));
  const remove = (index: number) => setBlocks((current) => current.filter((_, i) => i !== index));
  const move = (index: number, delta: number) =>
    setBlocks((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  if (readOnly) {
    return (
      <p className="cc-note" style={{ marginTop: 0 }}>
        This campaign has been sent, so its content is locked. What went out is what
        recipients received — editing it now would make the record disagree with their
        inboxes. Duplicate it to make a new version.
      </p>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          setSaved(false);
          fd.set("blocks", JSON.stringify(blocks));
          try {
            await saveCampaignContentAction(fd);
            setSaved(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "That did not save.");
          }
        })
      }
    >
      <input type="hidden" name="campaign_id" value={campaignId} />

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="cm-subject">Subject line</label>
          <input id="cm-subject" name="subject" className="cc-input" defaultValue={subject ?? ""}
            placeholder="Your website, refreshed for fall" />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="cm-preview">Preview text</label>
          <input id="cm-preview" name="preview_text" className="cc-input" defaultValue={previewText ?? ""}
            placeholder="The grey line the inbox shows next to the subject" />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="cm-fromname">From name</label>
          <input id="cm-fromname" name="from_name" className="cc-input" defaultValue={fromName ?? ""}
            placeholder="Tomorrow's Tech AI" />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="cm-fromemail">From address</label>
          <input id="cm-fromemail" name="from_email" className="cc-input" defaultValue={fromEmail ?? ""}
            placeholder="hello@tomorrowstechai.com" />
        </div>
      </div>

      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="cm-replyto">Reply-to</label>
          <input id="cm-replyto" name="reply_to" className="cc-input" defaultValue={replyTo ?? ""}
            placeholder="john@tomorrowstechai.com" />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="cm-tone">Accent</label>
          <select id="cm-tone" name="tone" className="cc-select" defaultValue={tone}>
            <option value="default">Blue (default)</option>
            <option value="success">Green</option>
            <option value="alert">Amber</option>
          </select>
        </div>
      </div>

      <p className="cc-subhead">Content</p>

      {blocks.length === 0 ? (
        <p className="cc-note" style={{ marginTop: 0 }}>
          Nothing in the email yet. Add a block below.
        </p>
      ) : null}

      {blocks.map((block, index) => (
        <div
          key={index}
          className="cc-field"
          style={{ border: "1px solid var(--cc-border)", borderRadius: 10, padding: 12, marginBottom: 10 }}
        >
          <div className="cc-rowacts" style={{ marginBottom: 8 }}>
            <span className="cc-chip t-muted">{BLOCK_LABELS[block.type]}</span>
            <span style={{ marginLeft: "auto" }} />
            <button type="button" className="cc-btn is-sm" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
            <button type="button" className="cc-btn is-sm" onClick={() => move(index, 1)} disabled={index === blocks.length - 1}>↓</button>
            <button type="button" className="cc-btn is-sm" onClick={() => remove(index)}>Remove</button>
          </div>

          {block.type === "heading" || block.type === "text" || block.type === "quote" || block.type === "fineprint" ? (
            <textarea
              className="cc-textarea"
              rows={block.type === "text" ? 3 : 2}
              value={block.text}
              onChange={(e) => update(index, { ...block, text: e.target.value })}
              aria-label={BLOCK_LABELS[block.type]}
            />
          ) : null}

          {block.type === "button" ? (
            <div className="cc-field row2" style={{ marginBottom: 0 }}>
              <div className="cc-field">
                <label className="cc-label">Label</label>
                <input className="cc-input" value={block.label}
                  onChange={(e) => update(index, { ...block, label: e.target.value })} />
              </div>
              <div className="cc-field">
                <label className="cc-label">Link</label>
                <input className="cc-input" value={block.href}
                  onChange={(e) => update(index, { ...block, href: e.target.value })} placeholder="https://…" />
              </div>
            </div>
          ) : null}

          {block.type === "image" ? (
            <div className="cc-field row2" style={{ marginBottom: 0 }}>
              <div className="cc-field">
                <label className="cc-label">Image URL</label>
                <input className="cc-input" value={block.src}
                  onChange={(e) => update(index, { ...block, src: e.target.value })} placeholder="https://…" />
              </div>
              <div className="cc-field">
                <label className="cc-label">Alt text</label>
                <input className="cc-input" value={block.alt}
                  onChange={(e) => update(index, { ...block, alt: e.target.value })}
                  placeholder="What the image shows" />
              </div>
            </div>
          ) : null}

          {block.type === "bullets" ? (
            <textarea
              className="cc-textarea"
              rows={Math.max(3, block.items.length)}
              value={block.items.join("\n")}
              onChange={(e) => update(index, { ...block, items: e.target.value.split("\n") })}
              aria-label="Bullet points, one per line"
              placeholder="One point per line"
            />
          ) : null}

          {block.type === "spacer" ? (
            <input
              className="cc-input" type="number" min={4} max={64}
              value={block.size ?? 16}
              onChange={(e) => update(index, { ...block, size: Number(e.target.value) })}
              aria-label="Spacer height in pixels"
            />
          ) : null}

          {block.type === "divider" || block.type === "signoff" ? (
            <p className="cc-note" style={{ margin: 0 }}>
              {block.type === "divider" ? "A horizontal rule." : "Signs off as John, Founder."}
            </p>
          ) : null}
        </div>
      ))}

      <div className="cc-rowacts" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        {ADDABLE.map((type) => (
          <button
            key={type}
            type="button"
            className="cc-btn is-sm"
            onClick={() => setBlocks((current) => [...current, structuredClone(NEW_BLOCK[type])])}
          >
            + {BLOCK_LABELS[type]}
          </button>
        ))}
      </div>

      <details>
        <summary className="cc-label" style={{ cursor: "pointer" }}>Personalization tokens</summary>
        <ul className="cc-health" style={{ marginTop: 8 }}>
          {PERSONALIZATION_TOKENS.map((token) => (
            <li className="cc-health-row" key={token.token}>
              <div className="cc-health-name cc-mono">{`{{${token.token}}}`}</div>
              <div className="cc-health-detail">{token.description}</div>
              <span className="cc-chip t-muted">
                falls back to {token.fallback ? `"${token.fallback}"` : "nothing"}
              </span>
            </li>
          ))}
        </ul>
        <p className="cc-note">
          Any other {"{{token}}"} is left in the message exactly as written, and the
          pre-send checks refuse to let the campaign go out until it is fixed.
        </p>
      </details>

      <p className="cc-note">
        The unsubscribe footer and the sender identity are added automatically to every
        marketing email. They are not blocks and cannot be removed.
      </p>

      {error ? <p className="cc-error">{error}</p> : null}
      {saved ? <p className="cc-note" style={{ color: "var(--cc-ok, #22C55E)" }}>Saved.</p> : null}

      <div className="cc-sheet-foot">
        <button type="submit" className="cc-btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save content"}
        </button>
      </div>
    </form>
  );
}

/* ── Audience, schedule, test, approval, send ──────────────────────── */

export function SetAudience({
  campaignId,
  audiences,
  current,
}: {
  campaignId: string;
  audiences: { id: string; name: string }[];
  current: string | null;
}) {
  return (
    <ActionForm action={setCampaignAudienceAction} submitLabel="Set audience">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <div className="cc-field">
        <label className="cc-label" htmlFor="sa-audience">Audience</label>
        <select id="sa-audience" name="audience_id" className="cc-select" defaultValue={current ?? ""}>
          <option value="">None</option>
          {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <p className="cc-note">
        Choosing an audience resolves it now and records how many can actually be
        emailed — the total minus anybody suppressed, unsubscribed or without consent.
      </p>
    </ActionForm>
  );
}

export function ScheduleCampaign({
  campaignId,
  timezone,
  audienceSize,
}: {
  campaignId: string;
  timezone: string;
  audienceSize: number | null;
}) {
  return (
    <Sheet label="Schedule" title="Schedule this campaign" buttonClass="cc-btn" buttonLabel="Schedule">
      {(close) => (
        <ActionForm action={scheduleCampaignAction} submitLabel="Schedule campaign" onDone={close}>
          <input type="hidden" name="campaign_id" value={campaignId} />
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-date">Date</label>
              <input id="sc-date" name="send_date" className="cc-input" type="date" required />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="sc-time">Time</label>
              <input id="sc-time" name="send_time" className="cc-input" type="time" required defaultValue="09:00" />
            </div>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="sc-tz">Timezone</label>
            <select id="sc-tz" name="timezone" className="cc-select" defaultValue={timezone}>
              {TIMEZONE_OPTIONS.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>
          <p className="cc-note">
            The time you pick is the time in that zone, not in your browser&rsquo;s.
            {audienceSize !== null ? ` This will go to ${audienceSize.toLocaleString("en-US")} recipients.` : ""}
          </p>
          <p className="cc-note">
            Scheduling freezes the recipient list now, so the people who receive it are
            the people counted above — not whoever the segment happens to match later.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function SendTest({ campaignId, defaultTo }: { campaignId: string; defaultTo: string }) {
  return (
    <Sheet label="Send Test" title="Send a test" buttonClass="cc-btn" buttonLabel="Send test">
      {(close) => (
        <ActionForm action={sendTestAction} submitLabel="Send test" onDone={close}>
          <input type="hidden" name="campaign_id" value={campaignId} />
          <div className="cc-field">
            <label className="cc-label" htmlFor="st-to">Send to</label>
            <input id="st-to" name="test_emails" className="cc-input" required defaultValue={defaultTo}
              placeholder="you@example.com, someone@example.com" />
          </div>
          <p className="cc-note">
            Up to five addresses. A test uses sample personalization values, is not
            counted in the campaign&rsquo;s numbers, and does not check the suppression
            list — so you can test to yourself even after unsubscribing.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function SendNow({ campaignId, recipients }: { campaignId: string; recipients: number | null }) {
  return (
    <Sheet label="Send now" title="Send this campaign now" buttonClass="cc-btn primary" buttonLabel="Send now">
      {(close) => (
        <ActionForm
          action={sendCampaignNowAction}
          submitLabel="Send it"
          onDone={close}
          confirm={
            recipients
              ? `Send this campaign to ${recipients.toLocaleString("en-US")} recipients right now?\n\nThis cannot be undone.`
              : "Send this campaign now? This cannot be undone."
          }
        >
          <input type="hidden" name="campaign_id" value={campaignId} />
          <p className="cc-note" style={{ marginTop: 0 }}>
            {recipients
              ? `This goes to ${recipients.toLocaleString("en-US")} people immediately.`
              : "The audience will be resolved and the campaign sent immediately."}
          </p>
          <p className="cc-note">
            Suppressed, unsubscribed and hard-bounced addresses are removed before
            anything is sent, and recorded as skipped so you can see who was left out
            and why.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function ApprovalActions({
  campaignId,
  approvalMode,
  approvalStatus,
  canApprove,
}: {
  campaignId: string;
  approvalMode: string;
  approvalStatus: string;
  canApprove: boolean;
}) {
  if (approvalMode === "none") return null;

  return (
    <div className="cc-rowacts" style={{ flexWrap: "wrap" }}>
      {approvalStatus !== "waiting" && approvalStatus !== "approved" ? (
        <form action={requestApprovalAction} style={{ display: "inline" }}>
          <input type="hidden" name="campaign_id" value={campaignId} />
          <button type="submit" className="cc-btn is-sm">Request approval</button>
        </form>
      ) : null}

      {canApprove && approvalStatus !== "approved" ? (
        <Sheet label="Approve" title="Approve this campaign" buttonClass="cc-btn is-sm" buttonLabel="Approve">
          {(close) => (
            <ActionForm action={approveCampaignAction} submitLabel="Approve" onDone={close}>
              <input type="hidden" name="campaign_id" value={campaignId} />
              <div className="cc-field">
                <label className="cc-label" htmlFor="ap-notes">Notes (optional)</label>
                <textarea id="ap-notes" name="approval_notes" className="cc-textarea" rows={2} />
              </div>
              <p className="cc-note">
                Approving unlocks scheduling and sending. Your name and the time are
                recorded against the campaign.
              </p>
            </ActionForm>
          )}
        </Sheet>
      ) : null}

      {canApprove && approvalStatus === "waiting" ? (
        <Sheet label="Request changes" title="Request changes" buttonClass="cc-btn is-sm" buttonLabel="Request changes">
          {(close) => (
            <ActionForm action={reviewCampaignAction} submitLabel="Send back" onDone={close} danger>
              <input type="hidden" name="campaign_id" value={campaignId} />
              <input type="hidden" name="decision" value="changes_requested" />
              <div className="cc-field">
                <label className="cc-label" htmlFor="rc-notes">What needs to change</label>
                <textarea id="rc-notes" name="approval_notes" className="cc-textarea" rows={3} required />
              </div>
              <p className="cc-note">
                This moves the campaign back to draft. A rejection with no reason cannot
                be acted on, so the note is required.
              </p>
            </ActionForm>
          )}
        </Sheet>
      ) : null}
    </div>
  );
}

/* ── Audiences ─────────────────────────────────────────────────────── */

export function AudienceSheet({
  clients,
  leadStatuses,
  businessTypes,
  sources,
  people,
}: {
  clients: { id: string; name: string }[];
  leadStatuses: string[];
  businessTypes: string[];
  sources: string[];
  people: string[];
}) {
  const [type, setType] = useState("dynamic_segment");
  const [table, setTable] = useState("leads");
  const dynamic = type === "dynamic_segment" || type === "crm_segment";

  return (
    <Sheet label="New Audience" title="New audience" wide>
      {(close) => (
        <ActionForm action={saveAudienceAction} submitLabel="Create audience" onDone={close}>
          <div className="cc-field">
            <label className="cc-label" htmlFor="au-name">Audience name</label>
            <input id="au-name" name="name" className="cc-input" required autoFocus placeholder="Local Business Leads" />
          </div>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="au-client">Client</label>
              <select id="au-client" name="customer_id" className="cc-select" defaultValue="">
                <option value="">Tomorrow&rsquo;s Tech AI (internal)</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="au-type">Type</label>
              <select id="au-type" name="audience_type" className="cc-select" value={type}
                onChange={(e) => setType(e.target.value)}>
                {AUDIENCE_TYPE_ORDER.map((k) => (
                  <option key={k} value={k}>{AUDIENCE_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="au-desc">Description</label>
            <input id="au-desc" name="description" className="cc-input" placeholder="Optional" />
          </div>

          {dynamic ? (
            <>
              <p className="cc-subhead">Who is in it</p>

              <div className="cc-field">
                <label className="cc-label" htmlFor="au-table">Built from</label>
                <select id="au-table" name="source_table" className="cc-select" value={table}
                  onChange={(e) => setTable(e.target.value)}>
                  <option value="leads">Leads</option>
                  <option value="customers">Clients</option>
                </select>
              </div>

              {table === "leads" ? (
                <div className="cc-field row2">
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="au-status">Lead status</label>
                    <select id="au-status" name="lead_status" className="cc-select" multiple
                      size={Math.min(5, Math.max(2, leadStatuses.length))}>
                      {leadStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="cc-field">
                    <label className="cc-label" htmlFor="au-industry">Industry</label>
                    <select id="au-industry" name="business_type" className="cc-select" multiple
                      size={Math.min(5, Math.max(2, businessTypes.length))}>
                      {businessTypes.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="cc-field">
                  <label className="cc-label" htmlFor="au-cstatus">Client status</label>
                  <select id="au-cstatus" name="customer_status" className="cc-select" multiple size={3}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="churned">Churned</option>
                  </select>
                </div>
              )}

              {table === "leads" && sources.length > 0 ? (
                <div className="cc-field">
                  <label className="cc-label" htmlFor="au-source">Lead source</label>
                  <select id="au-source" name="source" className="cc-select" multiple
                    size={Math.min(5, Math.max(2, sources.length))}>
                    {sources.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ) : null}

              <div className="cc-field row2">
                <div className="cc-field">
                  <label className="cc-label" htmlFor="au-after">Created after</label>
                  <input id="au-after" name="created_after" className="cc-input" type="date" />
                </div>
                <div className="cc-field">
                  <label className="cc-label" htmlFor="au-before">Created before</label>
                  <input id="au-before" name="created_before" className="cc-input" type="date" />
                </div>
              </div>

              <div className="cc-field row2">
                <div className="cc-field">
                  <label className="cc-label" htmlFor="au-assigned">Assigned to</label>
                  <input id="au-assigned" name="assigned_to" className="cc-input" list="au-people" />
                  <datalist id="au-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
                </div>
                <div className="cc-field">
                  <label className="cc-label" htmlFor="au-notcontacted">Not contacted since</label>
                  <input id="au-notcontacted" name="last_contacted_before" className="cc-input" type="date" />
                </div>
              </div>

              <div className="cc-field">
                <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" name="require_consent" defaultChecked />
                  <span>Only contacts with recorded email consent</span>
                </label>
              </div>

              <p className="cc-note">
                A dynamic segment is resolved fresh every time it is used, so it never
                goes stale. Suppressed and unsubscribed addresses are removed at send
                time regardless of the filters above.
              </p>
            </>
          ) : (
            <p className="cc-note">
              A static or imported list holds its own addresses. Create it, then paste
              or import the contacts.
            </p>
          )}
        </ActionForm>
      )}
    </Sheet>
  );
}

export function ImportContacts({ audienceId, audienceName }: { audienceId: string; audienceName: string }) {
  return (
    <Sheet label="Import" title={`Import into ${audienceName}`} buttonClass="cc-btn is-sm" buttonLabel="Import">
      {(close) => (
        <ActionForm action={importAudienceMembersAction} submitLabel="Import contacts" onDone={close}>
          <input type="hidden" name="audience_id" value={audienceId} />
          <div className="cc-field">
            <label className="cc-label" htmlFor="ic-contacts">Contacts</label>
            <textarea
              id="ic-contacts" name="contacts" className="cc-textarea" rows={10} required
              placeholder={"email@example.com, First, Last, Company\nanother@example.com"}
            />
          </div>
          <p className="cc-note">
            One per line: email first, then optionally first name, last name and company,
            separated by commas or tabs. Paste straight from a spreadsheet.
          </p>
          <p className="cc-note">
            Addresses already on the suppression list are added as unsubscribed.
            Importing an old spreadsheet can never resubscribe somebody who opted out.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function RefreshSize({ audienceId }: { audienceId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form action={(fd) => startTransition(async () => { await refreshAudienceSizeAction(fd); })} style={{ display: "inline" }}>
      <input type="hidden" name="audience_id" value={audienceId} />
      <button type="submit" className="cc-btn is-sm" disabled={pending}>
        {pending ? "Counting…" : "Recount"}
      </button>
    </form>
  );
}

/* ── Templates ─────────────────────────────────────────────────────── */

export function TemplateSheet({
  clients,
  brandProfiles,
}: {
  clients: { id: string; name: string }[];
  brandProfiles: { id: string; name: string }[];
}) {
  return (
    <Sheet label="New Template" title="New email template">
      {(close) => (
        <ActionForm action={saveTemplateAction} submitLabel="Create template" onDone={close}>
          <div className="cc-field">
            <label className="cc-label" htmlFor="tp-name">Template name</label>
            <input id="tp-name" name="name" className="cc-input" required autoFocus placeholder="Sales Follow-Up" />
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="tp-client">Client</label>
              <select id="tp-client" name="customer_id" className="cc-select" defaultValue="">
                <option value="">Tomorrow&rsquo;s Tech AI (internal)</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="tp-cat">Category</label>
              <select id="tp-cat" name="category" className="cc-select" defaultValue="other">
                {TEMPLATE_CATEGORY_ORDER.map((k) => (
                  <option key={k} value={k}>{TEMPLATE_CATEGORY_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="tp-subject">Subject</label>
              <input id="tp-subject" name="subject" className="cc-input" placeholder="Following up on {{company_name}}" />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="tp-brand">Brand profile</label>
              <select id="tp-brand" name="brand_profile_id" className="cc-select" defaultValue="">
                <option value="">None</option>
                {brandProfiles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="tp-preview">Preview text</label>
            <input id="tp-preview" name="preview_text" className="cc-input" />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="tp-status">Status</label>
            <select id="tp-status" name="status" className="cc-select" defaultValue="draft">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </div>
          <p className="cc-note">
            Create the template, then build its content the same way you build a
            campaign. Brand colours, logo and footer come from the brand profile —
            nothing is duplicated here.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

/* ── Sequences ─────────────────────────────────────────────────────── */

export function SequenceSheet({
  clients,
  audiences,
  people,
}: {
  clients: { id: string; name: string }[];
  audiences: { id: string; name: string }[];
  people: string[];
}) {
  return (
    <Sheet label="Create Sequence" title="New sequence">
      {(close) => (
        <ActionForm action={saveSequenceAction} submitLabel="Create sequence" onDone={close}>
          <div className="cc-field">
            <label className="cc-label" htmlFor="sq-name">Sequence name</label>
            <input id="sq-name" name="name" className="cc-input" required autoFocus placeholder="Welcome Series" />
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="sq-client">Client</label>
              <select id="sq-client" name="customer_id" className="cc-select" defaultValue="">
                <option value="">Tomorrow&rsquo;s Tech AI (internal)</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="sq-trigger">Enrollment trigger</label>
              <select id="sq-trigger" name="enrollment_trigger" className="cc-select" defaultValue="manual">
                {ENROLLMENT_TRIGGER_ORDER.map((k) => (
                  <option key={k} value={k}>{ENROLLMENT_TRIGGER_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="sq-audience">Default audience</label>
              <select id="sq-audience" name="audience_id" className="cc-select" defaultValue="">
                <option value="">None</option>
                {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="sq-owner">Owner</label>
              <input id="sq-owner" name="owner" className="cc-input" list="sq-people" />
              <datalist id="sq-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
            </div>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="sq-goal">Goal</label>
            <input id="sq-goal" name="goal" className="cc-input" placeholder="Book a discovery call" />
          </div>

          <p className="cc-subhead">Exit rules</p>
          <div className="cc-field">
            <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="exit_on_reply" defaultChecked /><span>Stop when they reply</span>
            </label>
            <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="exit_on_meeting" defaultChecked /><span>Stop when a meeting is booked</span>
            </label>
            <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="exit_on_proposal_accepted" defaultChecked /><span>Stop when a proposal is accepted</span>
            </label>
            <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="exit_on_conversion" defaultChecked /><span>Stop when they convert</span>
            </label>
          </div>
          <p className="cc-note">
            Unsubscribes, spam complaints and hard bounces always exit a sequence — that
            is enforced in the database and cannot be turned off. The rules above are the
            ones about not pestering somebody who already said yes.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function SequenceStepSheet({
  sequenceId,
  nextStepNumber,
  templates,
}: {
  sequenceId: string;
  nextStepNumber: number;
  templates: { id: string; name: string }[];
}) {
  const [condition, setCondition] = useState("always");
  const needsValue = condition === "lead_stage" || condition === "has_tag";

  return (
    <Sheet label="Add step" title={`Add step ${nextStepNumber}`} buttonClass="cc-btn is-sm" buttonLabel="Add step">
      {(close) => (
        <ActionForm action={saveSequenceStepAction} submitLabel="Add step" onDone={close}>
          <input type="hidden" name="sequence_id" value={sequenceId} />
          <input type="hidden" name="step_number" value={nextStepNumber} />

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="ss-delay">Wait</label>
              <input id="ss-delay" name="delay_amount" className="cc-input" type="number" min={0} defaultValue={nextStepNumber === 1 ? 0 : 2} />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="ss-unit">Unit</label>
              <select id="ss-unit" name="delay_unit" className="cc-select" defaultValue="days">
                {DELAY_UNIT_ORDER.map((u) => <option key={u} value={u}>{DELAY_UNIT_LABELS[u]}</option>)}
              </select>
            </div>
          </div>
          <p className="cc-note" style={{ marginTop: 0 }}>
            Measured from the previous step being sent, not from enrollment — so a paused
            sequence resumes with proper spacing instead of firing everything at once.
          </p>

          <div className="cc-field">
            <label className="cc-label" htmlFor="ss-name">Step name</label>
            <input id="ss-name" name="step_name" className="cc-input" placeholder="Case study" />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="ss-subject">Subject</label>
            <input id="ss-subject" name="subject" className="cc-input" placeholder="How {{company_name}} could look" />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="ss-template">Start from a template</label>
            <select id="ss-template" name="template_id" className="cc-select" defaultValue="">
              <option value="">Blank</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="ss-cond">Only send if</label>
            <select id="ss-cond" name="condition_type" className="cc-select" value={condition}
              onChange={(e) => setCondition(e.target.value)}>
              {STEP_CONDITION_ORDER.map((k) => (
                <option key={k} value={k}>{STEP_CONDITION_LABELS[k]}</option>
              ))}
            </select>
          </div>
          {needsValue ? (
            <div className="cc-field">
              <label className="cc-label" htmlFor="ss-condval">
                {condition === "lead_stage" ? "Stage" : "Tag"}
              </label>
              <input id="ss-condval" name="condition_value" className="cc-input" required />
            </div>
          ) : null}
        </ActionForm>
      )}
    </Sheet>
  );
}

export function SequenceStatusButton({
  sequenceId,
  status,
  steps,
}: {
  sequenceId: string;
  status: string;
  steps: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = status === "active" ? "paused" : "active";

  return (
    <>
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            if (next === "active" && steps === 0) {
              setError("Add at least one step before activating this sequence.");
              return;
            }
            try {
              await setSequenceStatusAction(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That did not work.");
            }
          })
        }
        style={{ display: "inline" }}
      >
        <input type="hidden" name="sequence_id" value={sequenceId} />
        <input type="hidden" name="status" value={next} />
        <button type="submit" className="cc-btn is-sm" disabled={pending}>
          {next === "active" ? "Activate" : "Pause"}
        </button>
      </form>
      {error ? <span className="cc-error">{error}</span> : null}
    </>
  );
}

export function EnrollSheet({
  sequenceId,
  audiences,
}: {
  sequenceId: string;
  audiences: { id: string; name: string }[];
}) {
  return (
    <Sheet label="Enroll" title="Enroll an audience" buttonClass="cc-btn is-sm" buttonLabel="Enroll">
      {(close) => (
        <ActionForm action={enrollInSequenceAction} submitLabel="Enroll audience" onDone={close}>
          <input type="hidden" name="sequence_id" value={sequenceId} />
          <div className="cc-field">
            <label className="cc-label" htmlFor="en-audience">Audience</label>
            <select id="en-audience" name="audience_id" className="cc-select" required defaultValue="">
              <option value="" disabled>Choose an audience</option>
              {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <p className="cc-note">
            Anybody suppressed, unsubscribed or without recorded consent is skipped.
            Somebody already enrolled is left where they are rather than restarted.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

/* ── Suppression and sending domain ────────────────────────────────── */

export function SuppressSheet() {
  return (
    <Sheet label="Suppress an address" title="Add to the suppression list" buttonClass="cc-btn is-sm" buttonLabel="Suppress an address">
      {(close) => (
        <ActionForm action={suppressEmailAction} submitLabel="Suppress" onDone={close}>
          <div className="cc-field">
            <label className="cc-label" htmlFor="su-email">Email address</label>
            <input id="su-email" name="email" className="cc-input" required autoFocus type="email" />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="su-reason">Reason</label>
            <select id="su-reason" name="reason" className="cc-select" defaultValue="manual">
              <option value="manual">Asked to be removed</option>
              <option value="complaint">Reported as spam</option>
              <option value="hard_bounce">Hard bounce</option>
              <option value="invalid">Invalid address</option>
              <option value="do_not_contact">Do not contact</option>
            </select>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="su-note">Note</label>
            <input id="su-note" name="note" className="cc-input" placeholder="Called and asked to be removed" />
          </div>
          <p className="cc-note">
            This address will be excluded from every future campaign and sequence, and
            removed from any list it is on. It also exits any sequence it is currently in.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function UnsuppressSheet({ email }: { email: string }) {
  return (
    <Sheet label="Resubscribe" title={`Resubscribe ${email}`} buttonClass="cc-btn is-sm" buttonLabel="Resubscribe">
      {(close) => (
        <ActionForm action={unsuppressEmailAction} submitLabel="Resubscribe" onDone={close} danger>
          <input type="hidden" name="email" value={email} />
          <div className="cc-field">
            <label className="cc-label" htmlFor="un-note">Why is this address being resubscribed?</label>
            <textarea id="un-note" name="note" className="cc-textarea" rows={3} required
              placeholder="They emailed asking to be put back on the list" />
          </div>
          <p className="cc-note">
            Only do this when the person has asked. Resubscribing somebody who
            unsubscribed is the fastest route to a spam complaint, and the reason you
            type here is recorded against your name.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function DomainSheet({
  domain,
}: {
  domain?: {
    id: string; domain: string; fromEmail: string | null; fromName: string | null;
    replyTo: string | null; dailySendLimit: number | null; isDefault: boolean;
  };
}) {
  return (
    <Sheet
      label="Add sending domain"
      title={domain ? `Edit ${domain.domain}` : "Add a sending domain"}
      buttonClass="cc-btn is-sm"
      buttonLabel={domain ? "Edit" : "Add sending domain"}
    >
      {(close) => (
        <ActionForm action={saveSendingDomainAction} submitLabel="Save domain" onDone={close}>
          {domain ? <input type="hidden" name="domain_id" value={domain.id} /> : null}
          <div className="cc-field">
            <label className="cc-label" htmlFor="dm-domain">Domain</label>
            <input id="dm-domain" name="domain" className="cc-input" required
              defaultValue={domain?.domain} placeholder="tomorrowstechai.com" />
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="dm-fromname">From name</label>
              <input id="dm-fromname" name="from_name" className="cc-input" defaultValue={domain?.fromName ?? ""} />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="dm-fromemail">From address</label>
              <input id="dm-fromemail" name="from_email" className="cc-input" defaultValue={domain?.fromEmail ?? ""} />
            </div>
          </div>
          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="dm-replyto">Reply-to</label>
              <input id="dm-replyto" name="reply_to" className="cc-input" defaultValue={domain?.replyTo ?? ""} />
            </div>
            <div className="cc-field">
              <label className="cc-label" htmlFor="dm-limit">Daily send limit</label>
              <input id="dm-limit" name="daily_send_limit" className="cc-input" type="number" min={1}
                defaultValue={domain?.dailySendLimit ?? ""} placeholder="Leave blank for none" />
            </div>
          </div>
          <div className="cc-field">
            <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="is_default" defaultChecked={domain?.isDefault} />
              <span>Use as the default sending domain</span>
            </label>
          </div>
          <p className="cc-note">
            SPF, DKIM and DMARC are not set here — they are read from the provider by
            Check Domain. Nothing in this admin can mark a domain verified by hand,
            because a green badge nobody earned is how mail starts going to spam.
          </p>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function CheckDomainButton({ domainId }: { domainId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            try {
              await checkDomainAction(fd);
            } catch (err) {
              setError(err instanceof Error ? err.message : "The check failed.");
            }
          })
        }
        style={{ display: "inline" }}
      >
        <input type="hidden" name="domain_id" value={domainId} />
        <button type="submit" className="cc-btn is-sm" disabled={pending}>
          {pending ? "Checking…" : "Check domain"}
        </button>
      </form>
      {error ? <span className="cc-error">{error}</span> : null}
    </>
  );
}
