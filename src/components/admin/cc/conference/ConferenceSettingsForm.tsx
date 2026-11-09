"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ConferenceResult } from "@/app/admin/conference-actions";
import type { ConferenceSettings } from "@/lib/conference/settings";
import { TIMEZONE_OPTIONS } from "@/lib/conference/config";

/** Meeting defaults. Saved to conference_settings; sent with every Zoom create. */
export default function ConferenceSettingsForm({
  settings, save,
}: {
  settings: ConferenceSettings;
  save: (fd: FormData) => Promise<ConferenceResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ConferenceResult | null>(null);

  const check = (name: keyof ConferenceSettings, label: string, hint?: string) => (
    <label className="mt-check">
      <input type="checkbox" name={name} defaultChecked={Boolean(settings[name])} />
      <span>{label}{hint ? <><br /><i className="cc-faint">{hint}</i></> : null}</span>
    </label>
  );

  return (
    <form
      className="cf-settings"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        startTransition(async () => {
          const r = await save(fd);
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      {!settings.persisted ? (
        <p className="mt-warn">
          These are the built-in defaults. The conference_settings table has not been created yet —
          apply the Conference Center migration before saving.
        </p>
      ) : null}

      <div className="cf-row2">
        <label className="tk-stack">
          <span>Default time zone</span>
          <select name="default_timezone" className="cc-input" defaultValue={settings.default_timezone}>
            {TIMEZONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="tk-stack">
          <span>Default consultation length <i>minutes</i></span>
          <input name="default_duration_minutes" type="number" min={5} max={480} step={5}
            className="cc-input" defaultValue={settings.default_duration_minutes} />
        </label>
        <label className="tk-stack">
          <span>Instant conference length <i>minutes</i></span>
          <input name="instant_duration_minutes" type="number" min={5} max={480} step={5}
            className="cc-input" defaultValue={settings.instant_duration_minutes} />
        </label>
        <label className="tk-stack">
          <span>Buffer between meetings <i>minutes</i></span>
          <input name="buffer_minutes" type="number" min={0} max={120} step={5}
            className="cc-input" defaultValue={settings.buffer_minutes} />
        </label>
      </div>

      {check("block_conflicts", "Block scheduling over another open meeting", "Uses the buffer above on both sides.")}
      {check("send_invites_by_email", "Email the branded invitation after scheduling", "Sent through Resend. Only the participant link is ever included.")}

      <h3 className="cf-h3">Zoom meeting defaults</h3>
      {check("zoom_waiting_room", "Waiting room on")}
      {check("zoom_join_before_host", "Allow guests to join before the host")}
      {check("zoom_mute_upon_entry", "Mute guests when they join")}
      {check("zoom_host_video", "Host video on at start")}
      {check("zoom_participant_video", "Guest video on at start")}

      <label className="tk-stack">
        <span>Automatic recording <i>requires participant consent and a plan that supports it</i></span>
        <select name="zoom_auto_recording" className="cc-input" defaultValue={settings.zoom_auto_recording}>
          <option value="none">Off</option>
          <option value="local">Record to the host&rsquo;s computer</option>
          <option value="cloud">Record to the Zoom cloud (paid plans)</option>
        </select>
      </label>

      {result ? (
        result.ok ? <p className="cf-ok">Saved. New conferences use these settings.</p>
          : <p className="cc-error">{result.error}</p>
      ) : null}

      <button type="submit" className="cc-btn primary" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
      {settings.updated_at ? (
        <p className="cc-faint cf-small">
          Last saved {new Date(settings.updated_at).toLocaleString("en-US", { timeZone: settings.default_timezone })}
          {settings.updated_by ? ` by ${settings.updated_by}` : ""}.
        </p>
      ) : null}
    </form>
  );
}
