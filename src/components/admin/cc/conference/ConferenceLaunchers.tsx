"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORY_GROUP_ORDER, CONFERENCE_CATEGORIES, TIMEZONE_OPTIONS,
} from "@/lib/conference/config";
import type { ConferenceResult } from "@/app/admin/conference-actions";
import { invitationText } from "@/lib/conference/invitation";
import type { ConferenceContactOption } from "@/lib/conference/queries";
import { IconCalendar, IconCheck, IconLink, IconVideo, IconX } from "../Icons";

/**
 * The two primary actions: Start Instant Conference and Schedule Conference.
 *
 * Instant: a blank tab is opened SYNCHRONOUSLY on click — popup blockers
 * only allow windows opened inside the user gesture — and is pointed at the
 * host-start route only after Zoom has confirmed the meeting exists. If Zoom
 * refuses, the blank tab is closed and the error is shown. Nothing on this
 * screen says "started" until the server returned a Zoom meeting id.
 */

type Props = {
  zoomReady: boolean;
  zoomReason: string | null;
  contacts: ConferenceContactOption[];
  defaultDate: string;
  defaultTimezone: string;
  defaultDuration: number;
  sendInvites: boolean;
  startInstant: (fd: FormData) => Promise<ConferenceResult>;
  invite: (fd: FormData) => Promise<ConferenceResult>;
  schedule: (fd: FormData) => Promise<ConferenceResult>;
  /** Pre-selected contact when opened from a CRM record (?contact=lead:<id>). */
  presetContact?: string | null;
  presetCategory?: string | null;
  openSchedule?: boolean;
  proposalId?: string | null;
  jobId?: string | null;
};

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
}

export function CopyButton({ text, label, className = "cc-btn" }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("ok");
          setTimeout(() => setState("idle"), 2000);
        } catch {
          setState("fail");
        }
      }}
    >
      {state === "ok" ? <IconCheck size={13} /> : <IconLink size={13} />}
      {state === "ok" ? "Copied" : state === "fail" ? "Copy blocked — select the text" : label}
    </button>
  );
}

function ContactSelect({
  contacts, value, onChange, name = "contact_key",
}: {
  contacts: ConferenceContactOption[];
  value: string;
  onChange: (key: string) => void;
  name?: string;
}) {
  const clients = contacts.filter((c) => c.kind === "client");
  const leads = contacts.filter((c) => c.kind === "lead");
  return (
    <select name={name} className="cc-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Not linked to a CRM record —</option>
      {clients.length > 0 ? (
        <optgroup label="Clients">
          {clients.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ""}{c.email ? "" : " (no email)"}
            </option>
          ))}
        </optgroup>
      ) : null}
      {leads.length > 0 ? (
        <optgroup label="Leads">
          {leads.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ""}{c.email ? "" : " (no email)"}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

// ── Instant ───────────────────────────────────────────────────────────

function InstantPanel({
  result, contacts, invite, onClose,
}: {
  result: ConferenceResult;
  contacts: ConferenceContactOption[];
  invite: Props["invite"];
  onClose: () => void;
}) {
  const [contactKey, setContactKey] = useState("");
  const [pending, startTransition] = useTransition();
  const [inviteResult, setInviteResult] = useState<ConferenceResult | null>(null);
  const router = useRouter();
  const contact = contacts.find((c) => c.key === contactKey);
  const text = invitationText({
    title: "Instant conference", joinUrl: result.joinUrl as string,
    zoomId: result.zoomMeetingId, passcode: result.passcode,
  });

  return (
    <div className="cf-instant" role="status">
      <div className="cf-instant-head">
        <span className="cf-live-dot" aria-hidden="true" />
        <b>Zoom confirmed the meeting.</b>
        <span className="cc-faint">Zoom should be opening as host in the other tab.</span>
        <button type="button" className="cc-icon-btn" onClick={onClose} aria-label="Dismiss">
          <IconX size={13} />
        </button>
      </div>

      <label className="tk-stack">
        <span>Participant link <i>safe to share — this is not the host link</i></span>
        <div className="cf-linkrow">
          <input className="cc-input" readOnly value={result.joinUrl ?? ""} onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={result.joinUrl ?? ""} label="Copy link" />
          <CopyButton text={text} label="Copy invitation" />
        </div>
      </label>
      {result.passcode ? <p className="cc-faint cf-small">Passcode {result.passcode} · included in the link.</p> : null}
      {result.warning ? <p className="mt-warn">{result.warning}</p> : null}

      <form
        className="cf-invite"
        onSubmit={(event) => {
          event.preventDefault();
          const fd = new FormData(event.currentTarget);
          fd.set("meeting_id", result.meetingId as string);
          startTransition(async () => {
            const r = await invite(fd);
            setInviteResult(r);
            if (r.ok) router.refresh();
          });
        }}
      >
        <label className="tk-stack">
          <span>Invite someone from the CRM</span>
          <ContactSelect contacts={contacts} value={contactKey} onChange={setContactKey} />
        </label>
        <label className="tk-stack">
          <span>…or an email address</span>
          <input name="email" type="email" className="cc-input" placeholder="name@company.com"
            defaultValue="" key={contactKey} disabled={Boolean(contact?.email)} />
        </label>
        <button type="submit" className="cc-btn" disabled={pending}>
          {pending ? "Sending…" : "Email the invitation"}
        </button>
      </form>
      {inviteResult ? (
        inviteResult.ok ? (
          <p className={inviteResult.emailed?.some((e) => e.sent) ? "cf-ok" : "mt-warn"}>
            {inviteResult.emailed?.length
              ? inviteResult.emailed.map((e) => `${e.to}: ${e.sent ? "sent" : "not sent"}`).join(" · ")
              : null}
            {inviteResult.emailNote ? ` ${inviteResult.emailNote}` : ""}
          </p>
        ) : <p className="cc-error">{inviteResult.error}</p>
      ) : null}
    </div>
  );
}

// ── Schedule ──────────────────────────────────────────────────────────

function ScheduleModal({
  contacts, defaultDate, defaultTimezone, defaultDuration, sendInvites, schedule,
  presetContact, presetCategory, proposalId, jobId, onClose,
}: Omit<Props, "zoomReady" | "zoomReason" | "startInstant" | "invite" | "openSchedule"> & { onClose: () => void }) {
  const router = useRouter();
  const [requestId] = useState(newRequestId);
  const [category, setCategory] = useState(presetCategory || "ai_consultation");
  const chosen = CONFERENCE_CATEGORIES.find((c) => c.key === category) ?? CONFERENCE_CATEGORIES[0];
  const [duration, setDuration] = useState(String(chosen.minutes || defaultDuration));
  const [contactKey, setContactKey] = useState(presetContact ?? "");
  const contact = contacts.find((c) => c.key === contactKey);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ConferenceResult | null>(null);
  const [submittedTitle, setSubmittedTitle] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const grouped = useMemo(
    () => CATEGORY_GROUP_ORDER.map((g) => ({ g, items: CONFERENCE_CATEGORIES.filter((c) => c.group === g) }))
      .filter((x) => x.items.length > 0),
    []
  );

  if (result?.ok) {
    const text = invitationText({
      title: submittedTitle || chosen.label,
      joinUrl: result.joinUrl as string,
      zoomId: result.zoomMeetingId,
      passcode: result.passcode,
    });
    return (
      <>
        <div className="tk-scrim" onClick={onClose} aria-hidden="true" />
        <div className="tk-modal mt-modal" role="dialog" aria-label="Conference scheduled">
          <header>
            <h2>{result.duplicate ? "Already scheduled" : "Conference scheduled"}</h2>
            <button type="button" className="cc-icon-btn" onClick={onClose} aria-label="Close"><IconX size={14} /></button>
          </header>
          <div className="cf-done">
            <p className="cf-ok">
              <IconCheck size={14} /> Zoom confirmed meeting {result.zoomMeetingId}. It is on the calendar and linked to the CRM record.
            </p>
            {result.emailed && result.emailed.length > 0 ? (
              <ul className="cf-sent">
                {result.emailed.map((e) => (
                  <li key={e.to} className={e.sent ? "is-ok" : "is-bad"}>
                    {e.sent ? "Invitation sent to" : "Invitation NOT sent to"} {e.to}
                  </li>
                ))}
              </ul>
            ) : null}
            {result.emailNote ? <p className="mt-warn">{result.emailNote}</p> : null}
            {result.warning ? <p className="mt-warn">{result.warning}</p> : null}
            <div className="cf-linkrow">
              <input className="cc-input" readOnly value={result.joinUrl ?? ""} onFocus={(e) => e.currentTarget.select()} />
              <CopyButton text={text} label="Copy invitation" />
            </div>
          </div>
          <footer>
            <a className="cc-btn" href={`/admin/conference-center?conference=${result.meetingId}`}>View details</a>
            <button type="button" className="cc-btn primary" onClick={onClose}>Done</button>
          </footer>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="tk-scrim" onClick={() => { if (!pending) onClose(); }} aria-hidden="true" />
      <div className="tk-modal mt-modal cf-modal" role="dialog" aria-label="Schedule a conference">
        <header>
          <h2>Schedule a conference</h2>
          <button type="button" className="cc-icon-btn" onClick={onClose} aria-label="Close" disabled={pending}>
            <IconX size={14} />
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            setSubmittedTitle(String(fd.get("title") || ""));
            startTransition(async () => {
              const r = await schedule(fd);
              setResult(r);
              if (r.ok || r.saved) router.refresh();
            });
          }}
        >
          <input type="hidden" name="client_request_id" value={requestId} />
          {proposalId ? <input type="hidden" name="proposal_id" value={proposalId} /> : null}
          {jobId ? <input type="hidden" name="job_id" value={jobId} /> : null}

          <div className="cf-row2">
            <label className="tk-stack">
              <span>Category</span>
              <select name="category" className="cc-input" value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  const next = CONFERENCE_CATEGORIES.find((c) => c.key === e.target.value);
                  if (next) setDuration(String(next.minutes));
                }}>
                {grouped.map(({ g, items }) => (
                  <optgroup key={g} label={g}>
                    {items.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="tk-stack">
              <span>Meeting title <i>optional — defaults to the category</i></span>
              <input name="title" className="cc-input" maxLength={200}
                placeholder={`${chosen.label}${contact?.company ? ` — ${contact.company}` : ""}`} />
            </label>
          </div>

          <label className="tk-stack">
            <span>Lead, client or company <i>links the conference to the CRM record and its history</i></span>
            <ContactSelect contacts={contacts} value={contactKey} onChange={setContactKey} />
          </label>

          <div className="cf-row2">
            <label className="tk-stack">
              <span>Guest email <i>required</i></span>
              <input name="guest_email" type="email" className="cc-input" required
                key={`e-${contactKey}`} defaultValue={contact?.email ?? ""} placeholder="name@company.com" />
            </label>
            <label className="tk-stack">
              <span>Guest name</span>
              <input name="guest_name" className="cc-input" key={`n-${contactKey}`} defaultValue={contact?.name ?? ""} />
            </label>
          </div>

          <label className="tk-stack">
            <span>Additional attendees <i>emails, separated by commas</i></span>
            <input name="additional_attendees" className="cc-input" placeholder="partner@example.com, colleague@example.com" />
          </label>

          <div className="mt-row3">
            <label className="tk-stack">
              <span>Date</span>
              <input name="date" type="date" className="cc-input" defaultValue={defaultDate} required />
            </label>
            <label className="tk-stack">
              <span>Time</span>
              <input name="time" type="time" className="cc-input" defaultValue="10:00" step={900} required />
            </label>
            <label className="tk-stack">
              <span>Duration</span>
              <select name="duration" className="cc-input" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {Array.from(new Set([15, 30, 45, 60, 90, 120, Number(duration)])).sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </label>
          </div>

          <label className="tk-stack">
            <span>Time zone</span>
            <select name="timezone" className="cc-input" defaultValue={defaultTimezone}>
              {TIMEZONE_OPTIONS.some((t) => t.value === defaultTimezone) ? null : (
                <option value={defaultTimezone}>{defaultTimezone}</option>
              )}
              {TIMEZONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          <label className="tk-stack">
            <span>Agenda <i>shared with guests and on the Zoom invitation</i></span>
            <textarea name="agenda" className="cc-input" rows={3} maxLength={2000} />
          </label>
          <label className="tk-stack">
            <span>Internal notes <i>private — never sent to Zoom or guests</i></span>
            <textarea name="internal_notes" className="cc-input" rows={2} maxLength={4000} />
          </label>

          {sendInvites ? (
            <label className="mt-check">
              <input type="checkbox" name="no_invite" />
              <span>Don&rsquo;t email the invitation — I&rsquo;ll share the link myself</span>
            </label>
          ) : (
            <p className="mt-tz">Invitation emails are turned off in Zoom settings; copy the link after scheduling.</p>
          )}

          {result && !result.ok ? <p className="cc-error cf-err">{result.error}</p> : null}
          {result?.saved && result.meetingId ? (
            <p className="cf-small">
              <a href={`/admin/conference-center?conference=${result.meetingId}`}>Open the saved conference to retry</a>
            </p>
          ) : null}

          <footer>
            <button type="button" className="cc-btn" onClick={onClose} disabled={pending}>Cancel</button>
            <button type="submit" className="cc-btn primary" disabled={pending || Boolean(result?.saved)}>
              {pending ? "Creating Zoom meeting…" : "Schedule conference"}
            </button>
          </footer>
        </form>
      </div>
    </>
  );
}

// ── The bar ───────────────────────────────────────────────────────────

export default function ConferenceLaunchers(props: Props) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = useState(Boolean(props.openSchedule));
  const [instant, setInstant] = useState<ConferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startInstant() {
    setError(null);
    // Opened inside the click, so no popup blocker objects. Pointed at the
    // host route only once Zoom has confirmed the meeting.
    const tab = window.open("", "_blank");
    if (tab) {
      try {
        tab.document.title = "Starting Zoom…";
        tab.document.body.style.cssText = "background:#0B0F14;color:#93A2B8;font:14px system-ui;display:grid;place-items:center;height:100vh;margin:0";
        tab.document.body.textContent = "Creating your Zoom meeting…";
      } catch { /* cross-origin edge cases: harmless */ }
    }
    const fd = new FormData();
    fd.set("client_request_id", newRequestId());
    startTransition(async () => {
      const r = await props.startInstant(fd);
      if (r.ok && r.meetingId) {
        if (tab) {
          tab.opener = null;
          tab.location.href = `/api/conference/${r.meetingId}/start`;
        }
        setInstant(r);
        router.refresh();
      } else {
        tab?.close();
        setError(r.error ?? "Zoom could not create the meeting.");
      }
    });
  }

  return (
    <div className="cf-launch">
      <div className="cf-launch-buttons">
        <button
          type="button"
          className="cc-btn primary cf-big"
          onClick={startInstant}
          disabled={!props.zoomReady || pending}
          title={props.zoomReady ? undefined : props.zoomReason ?? undefined}
        >
          <IconVideo size={16} /> {pending ? "Creating Zoom meeting…" : "Start Instant Conference"}
        </button>
        <button
          type="button"
          className="cc-btn cf-big"
          onClick={() => setScheduleOpen(true)}
          disabled={!props.zoomReady}
          title={props.zoomReady ? undefined : props.zoomReason ?? undefined}
        >
          <IconCalendar size={16} /> Schedule Conference
        </button>
      </div>

      {error ? <p className="cc-error cf-err" role="alert">{error}</p> : null}
      {instant?.ok ? (
        <InstantPanel result={instant} contacts={props.contacts} invite={props.invite} onClose={() => setInstant(null)} />
      ) : null}

      {scheduleOpen ? (
        <ScheduleModal
          contacts={props.contacts}
          defaultDate={props.defaultDate}
          defaultTimezone={props.defaultTimezone}
          defaultDuration={props.defaultDuration}
          sendInvites={props.sendInvites}
          schedule={props.schedule}
          presetContact={props.presetContact}
          presetCategory={props.presetCategory}
          proposalId={props.proposalId}
          jobId={props.jobId}
          onClose={() => setScheduleOpen(false)}
        />
      ) : null}
    </div>
  );
}
