"use client";

import { useActionState, useState } from "react";
import {
  BODY_MAX,
  SUBJECT_MAX,
  emailBlock,
  leadEmailTemplates,
  type EmailableLead,
} from "@/lib/leads/direct-email";
import type { LeadEmailState } from "@/app/admin/lead-email-actions";

type Props = {
  lead: EmailableLead & { id: string; lead_status: string };
  /** Pending automated follow-ups; the composer offers to stop them. */
  pendingFollowups: number;
  action: (prev: LeadEmailState, formData: FormData) => Promise<LeadEmailState>;
};

/**
 * Write and send a personal email to a lead without leaving the admin.
 * Templates fill the boxes; nothing is sent until Send is pressed, and the
 * full text is logged on the lead's activity.
 */
export function LeadEmailComposer({ lead, pendingFollowups, action }: Props) {
  const templates = leadEmailTemplates(lead);
  const [templateId, setTemplateId] = useState("more-details");
  const start = templates.find((t) => t.id === templateId) ?? templates[0];
  const [subject, setSubject] = useState(start.subject);
  const [body, setBody] = useState(start.body);
  // After a successful send, reset to a blank reply so the same email can't
  // be sent twice by accident.
  const [state, formAction, pending] = useActionState(async (prev: LeadEmailState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.ok) {
      const blank = templates.find((t) => t.id === "blank")!;
      const sentSubject = String(fd.get("subject") ?? "").trim();
      setTemplateId("blank");
      setSubject(sentSubject && !/^re:/i.test(sentSubject) ? `Re: ${sentSubject}` : sentSubject);
      setBody(blank.body);
    }
    return result;
  }, null);
  const block = emailBlock(lead);
  const dirty = subject !== start.subject || body !== start.body;

  function pick(id: string) {
    if (dirty && !window.confirm("Replace what you've written with this template?")) return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setSubject(t.subject);
    setBody(t.body);
  }

  if (block.blocked) {
    return (
      <section className="ad-panel" id="email">
        <div className="ad-panel-head">
          <h2>Email {lead.first_name || "this lead"}</h2>
        </div>
        <p className="ad-note" style={{ margin: 0 }}>{block.reason}</p>
      </section>
    );
  }

  return (
    <section className="ad-panel ad-compose" id="email">
      <div className="ad-panel-head">
        <h2>Email {lead.first_name || "this lead"}</h2>
        <a className="ad-link ad-compose-alt" href={`mailto:${lead.email}?subject=${encodeURIComponent(subject)}`}>
          Open in my email app
        </a>
      </div>

      <div className="ad-compose-templates" role="group" aria-label="Start from a template">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ad-chip${t.id === templateId ? " is-on" : ""}`}
            aria-pressed={t.id === templateId}
            onClick={() => pick(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form action={formAction} className="ad-form">
        <input type="hidden" name="lead_id" value={lead.id} />
        <div className="ad-compose-to">
          <span className="ad-label">To</span>
          <span>{lead.email}</span>
        </div>
        <label className="ad-field">
          <span className="ad-label">Subject</span>
          <input
            name="subject"
            className="ad-input"
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What's this about?"
            required
          />
        </label>
        <label className="ad-field">
          <span className="ad-label">Message</span>
          <textarea
            name="body"
            className="ad-input ad-compose-body"
            rows={12}
            value={body}
            maxLength={BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </label>

        {block.warning ? <p className="ad-compose-warn">{block.warning}</p> : null}

        <div className="ad-compose-options">
          <label className="ad-check">
            <input type="checkbox" name="send_copy" defaultChecked />
            <span>Send me a copy</span>
          </label>
          {lead.lead_status === "New" ? (
            <label className="ad-check">
              <input type="checkbox" name="mark_contacted" defaultChecked />
              <span>Move status to Contacted</span>
            </label>
          ) : null}
          {pendingFollowups > 0 ? (
            <label className="ad-check">
              <input type="checkbox" name="stop_automation" defaultChecked />
              <span>
                Stop the {pendingFollowups} automated follow-up{pendingFollowups === 1 ? "" : "s"} still queued
              </span>
            </label>
          ) : null}
        </div>

        <div className="ad-compose-foot">
          <span className="ad-muted">Replies come back to your inbox. The full text is saved to Activity.</span>
          <button type="submit" className="ad-btn primary" disabled={pending}>
            {pending ? "Sending…" : "Send email"}
          </button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={`ad-compose-result${state ? (state.ok ? " is-ok" : " is-err") : ""}`}
        >
          {state?.message ?? ""}
        </p>
      </form>
    </section>
  );
}
