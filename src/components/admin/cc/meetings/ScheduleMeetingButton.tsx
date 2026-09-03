"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DURATION_PRESETS, PROVIDER_IS_VIDEO, TYPE_DEFAULT_MINUTES, TYPE_GROUPS,
  TYPE_LABELS, suggestedTitle,
} from "@/lib/meetings/config";
import type { MeetingType } from "@/lib/meetings/config";
import type { MeetingContact } from "@/lib/meetings/types";
import { IconCalendar, IconX } from "../Icons";

/**
 * Schedule Meeting — the one entry point, wherever it is pressed from.
 *
 * A lead, a client, a proposal, a project and the Meetings Center all render
 * this same component with a different `contact`. That is the whole reason
 * resolveContact() exists on the server: by the time this opens, "who is this
 * with" is already answered and the form never has to ask.
 *
 * Provider readiness arrives as data, not as a guess. Google Meet is
 * selectable when Google is connected and explains itself when it is not, and
 * Zoom says it is coming rather than pretending. Nothing in this file knows
 * what Google is.
 */

type ProviderOption = {
  key: string;
  label: string;
  ready: boolean;
  reason?: string;
  account?: string | null;
  comingSoon?: boolean;
};

export default function ScheduleMeetingButton({
  contact,
  providers,
  action,
  defaultDate,
  defaultType = "discovery",
  defaultTitle,
  proposalId = null,
  jobId = null,
  returnTo,
  label = "Schedule Meeting",
  variant = "primary",
  timezone,
  timezoneLabel,
}: {
  contact: MeetingContact;
  providers: ProviderOption[];
  action: (formData: FormData) => void | Promise<void>;
  /** YYYY-MM-DD, computed on the server so the first render matches. */
  defaultDate: string;
  defaultType?: MeetingType;
  defaultTitle?: string;
  proposalId?: string | null;
  jobId?: string | null;
  returnTo?: string;
  label?: string;
  variant?: "primary" | "ghost";
  timezone: string;
  timezoneLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MeetingType>(defaultType);
  const [title, setTitle] = useState(defaultTitle ?? suggestedTitle(defaultType, contact.company));
  const [titleEdited, setTitleEdited] = useState(Boolean(defaultTitle));
  const [duration, setDuration] = useState(String(TYPE_DEFAULT_MINUTES[defaultType]));
  const [provider, setProvider] = useState<string>("google_meet");
  const [submitting, setSubmitting] = useState(false);

  const firstReady = useMemo(
    () => providers.find((p) => p.ready)?.key ?? "phone",
    [providers]
  );

  useEffect(() => {
    if (!open) return;
    setProvider((current) => (providers.find((p) => p.key === current)?.ready ? current : firstReady));
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, providers, firstReady]);

  /** Changing the type refills the title, unless the person has touched it. */
  function chooseType(next: MeetingType) {
    setType(next);
    setDuration(String(TYPE_DEFAULT_MINUTES[next]));
    if (!titleEdited) setTitle(suggestedTitle(next, contact.company));
  }

  const chosen = providers.find((p) => p.key === provider);
  const needsEmail = PROVIDER_IS_VIDEO[provider as keyof typeof PROVIDER_IS_VIDEO] ?? false;
  const missingEmail = needsEmail && !contact.email;

  return (
    <>
      <button
        type="button"
        className={variant === "primary" ? "cc-btn primary" : "cc-btn"}
        onClick={() => setOpen(true)}
      >
        <IconCalendar size={14} /> {label}
      </button>

      {open ? (
        <>
          <div className="tk-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="tk-modal mt-modal" role="dialog" aria-label="Schedule a meeting">
            <header>
              <h2>Schedule a meeting</h2>
              <button type="button" className="cc-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                <IconX size={14} />
              </button>
            </header>

            <form
              action={action}
              onSubmit={() => { setSubmitting(true); setOpen(false); }}
            >
              <input type="hidden" name="lead_id" value={contact.leadId ?? ""} />
              <input type="hidden" name="customer_id" value={contact.customerId ?? ""} />
              <input type="hidden" name="company_id" value={contact.companyId ?? ""} />
              <input type="hidden" name="job_id" value={jobId ?? contact.jobId ?? ""} />
              <input type="hidden" name="proposal_id" value={proposalId ?? contact.proposalId ?? ""} />
              <input type="hidden" name="company" value={contact.company ?? ""} />
              <input type="hidden" name="timezone" value={timezone} />
              {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}

              {/* ── Who ─────────────────────────────────────────── */}
              <div className="mt-contact">
                <span className="mt-avatar" aria-hidden="true">{contact.initials}</span>
                <div className="mt-contact-body">
                  <b>{contact.name || contact.company || "Contact"}</b>
                  {contact.company && contact.name ? <span>{contact.company}</span> : null}
                  <span className="mt-contact-lines">
                    {contact.email ? <i>{contact.email}</i> : <i className="is-missing">No email on file</i>}
                    {contact.phone ? <i>{contact.phone}</i> : null}
                  </span>
                </div>
                {contact.href ? (
                  <a className="cc-btn" href={contact.href} target="_blank" rel="noreferrer">Open record</a>
                ) : null}
              </div>

              <input type="hidden" name="attendee_name" value={contact.name ?? ""} />
              <input type="hidden" name="attendee_phone" value={contact.phone ?? ""} />

              <label className="tk-stack">
                <span>Send the invitation to {contact.email ? <i>(from the record)</i> : <i>required for video</i>}</span>
                <input
                  name="attendee_email"
                  type="email"
                  className="cc-input"
                  defaultValue={contact.email ?? ""}
                  placeholder="name@company.com"
                  required={needsEmail}
                />
              </label>

              {/* ── What ────────────────────────────────────────── */}
              <label className="tk-stack">
                <span>Meeting type</span>
                <select
                  name="meeting_type"
                  className="cc-input"
                  value={type}
                  onChange={(event) => chooseType(event.target.value as MeetingType)}
                >
                  {TYPE_GROUPS.map((group) => (
                    <optgroup key={group.head} label={group.head}>
                      {group.types.map((key) => (
                        <option key={key} value={key}>{TYPE_LABELS[key]}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="tk-stack">
                <span>Title <i>shown on the invitation</i></span>
                <input
                  name="title"
                  className="cc-input"
                  value={title}
                  onChange={(event) => { setTitle(event.target.value); setTitleEdited(true); }}
                  required
                />
              </label>

              {/* ── When ────────────────────────────────────────── */}
              <div className="mt-row3">
                <label className="tk-stack">
                  <span>Date</span>
                  <input name="date" type="date" className="cc-input" defaultValue={defaultDate} required />
                </label>
                <label className="tk-stack">
                  <span>Start</span>
                  <input name="time" type="time" className="cc-input" defaultValue="10:00" step={900} required />
                </label>
                <label className="tk-stack">
                  <span>Duration</span>
                  <select
                    name="duration"
                    className="cc-input"
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                  >
                    {DURATION_PRESETS.map((minutes) => (
                      <option key={minutes} value={minutes}>{minutes} minutes</option>
                    ))}
                    <option value="custom">Custom…</option>
                  </select>
                </label>
              </div>

              {duration === "custom" ? (
                <label className="tk-stack">
                  <span>Custom length <i>minutes</i></span>
                  <input name="duration_custom" type="number" min={5} max={480} step={5}
                    className="cc-input" defaultValue={30} />
                </label>
              ) : null}

              <p className="mt-tz">Times are {timezoneLabel}, the same clock the rest of the admin uses.</p>

              {/* ── Where ───────────────────────────────────────── */}
              <fieldset className="mt-providers">
                <legend>How you will meet</legend>
                {providers.map((option) => (
                  <label
                    key={option.key}
                    className={`mt-provider${option.ready ? "" : " is-off"}${provider === option.key ? " is-on" : ""}`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={option.key}
                      checked={provider === option.key}
                      disabled={!option.ready}
                      onChange={() => setProvider(option.key)}
                    />
                    <span className="mt-provider-body">
                      <b>
                        {option.label}
                        {option.comingSoon ? <em className="cc-chip t-muted">Coming soon</em> : null}
                      </b>
                      {option.ready && option.account ? <i>{option.account}</i> : null}
                      {!option.ready && option.reason ? <i>{option.reason}</i> : null}
                    </span>
                  </label>
                ))}
              </fieldset>

              {provider === "in_person" || provider === "phone" ? (
                <label className="tk-stack">
                  <span>{provider === "phone" ? "Number to call" : "Where"} <i>optional</i></span>
                  <input name="location" className="cc-input"
                    defaultValue={provider === "phone" ? (contact.phone ?? "") : ""}
                    placeholder={provider === "phone" ? "(254) 555-0123" : "Address or room"} />
                </label>
              ) : null}

              <label className="tk-stack">
                <span>Agenda <i>optional — goes on the invitation</i></span>
                <textarea name="agenda" className="cc-input" rows={3}
                  placeholder={"What you want to get out of it.\nOne line per point is plenty."} />
              </label>

              <label className="mt-check">
                <input type="checkbox" name="no_invite" />
                <span>Don&rsquo;t email the invitation — I&rsquo;ll send the link myself</span>
              </label>

              {missingEmail ? (
                <p className="mt-warn">
                  {chosen?.label ?? "This provider"} needs an email address to invite anyone. Add one above,
                  or choose Phone or In Person.
                </p>
              ) : null}

              <footer>
                <button type="button" className="cc-btn" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="cc-btn primary" disabled={submitting || missingEmail}>
                  {submitting ? "Scheduling…" : "Schedule meeting"}
                </button>
              </footer>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
