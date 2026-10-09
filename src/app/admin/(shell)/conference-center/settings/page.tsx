import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminUser } from "@/lib/supabase/server";
import {
  ZOOM_REQUIRED_SCOPES, zoomConnection, zoomRedirectUri, zoomWebhookUrl,
} from "@/lib/zoom/oauth";
import { getConferenceSettings } from "@/lib/conference/settings";
import { CONFERENCE_PARTNERS } from "@/lib/conference/partners";
import {
  disconnectZoomAction, updateConferenceSettingsAction,
} from "@/app/admin/conference-actions";
import ConferenceSettingsForm from "@/components/admin/cc/conference/ConferenceSettingsForm";
import { CopyButton } from "@/components/admin/cc/conference/ConferenceLaunchers";
import { Panel } from "@/components/admin/cc/Panel";
import { IconArrowRight } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Zoom settings · Conference Center" };

const MESSAGES: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "Zoom connected. Conferences will be created on this Zoom account." },
  disconnected: { tone: "ok", text: "Zoom disconnected. The stored tokens were deleted." },
  denied: { tone: "bad", text: "Zoom was not given permission, so nothing was connected." },
  badstate: { tone: "bad", text: "The Zoom sign-in could not be verified (state mismatch or expired). Nothing was stored — try again." },
  nocode: { tone: "bad", text: "Zoom did not return an authorization code. Nothing was stored." },
  failed: { tone: "bad", text: "Zoom would not complete the connection." },
  unconfigured: { tone: "bad", text: "Zoom is not configured on the server yet." },
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-fact"><span>{label}</span><b>{children}</b></div>;
}

export default async function ZoomSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const [zoom, settings, h] = await Promise.all([zoomConnection(), getConferenceSettings(), headers()]);
  const host = h.get("x-forwarded-host") || h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") || "https"}://${host}` : null;
  const status = one("zoom");
  const banner = status ? MESSAGES[status] : null;
  const detail = one("detail");

  return (
    <>
      <header className="cc-greet cf-head">
        <div>
          <p className="cf-crumb"><Link href="/admin/conference-center">Conference Center</Link> / Zoom settings</p>
          <h1>Zoom settings</h1>
          <p>Connect the Zoom account conferences are created on, and set how new meetings behave.</p>
        </div>
      </header>

      {banner ? (
        <p className={banner.tone === "ok" ? "cf-ok cf-banner" : "cc-error cf-banner"} role="status">
          {banner.text}{detail ? ` ${detail}` : ""}
        </p>
      ) : null}

      <div className="cf-grid">
        <Panel title="Zoom connection" className="cf-panel">
          <section className="mt-facts">
            <Fact label="Server configuration">
              {zoom.configured ? "Ready" : <span className="cf-bad">Missing {zoom.missing.join(", ")}</span>}
            </Fact>
            <Fact label="Status">
              {zoom.connected
                ? <span className="cf-good">Connected</span>
                : <span className="cf-bad">Not connected</span>}
            </Fact>
            {zoom.connected ? (
              <>
                <Fact label="Account">{zoom.account ?? "unknown"}{zoom.accountName ? <em className="mt-rel">{zoom.accountName}</em> : null}</Fact>
                <Fact label="Plan">
                  {zoom.planLabel ?? "unknown"}
                  {zoom.planType === 1 ? <em className="mt-rel">Group meetings end after 40 minutes on Basic.</em> : null}
                </Fact>
                <Fact label="Connected">
                  {zoom.connectedAt ? new Date(zoom.connectedAt).toLocaleString("en-US", { timeZone: settings.default_timezone }) : "—"}
                  {zoom.connectedBy ? <em className="mt-rel">by {zoom.connectedBy}</em> : null}
                </Fact>
                <Fact label="Granted scopes">{zoom.scope || "as configured on the Zoom app"}</Fact>
              </>
            ) : null}
            <Fact label="Last error">
              {zoom.lastError
                ? <span className="cf-bad">{zoom.lastError}{zoom.lastErrorAt ? ` (${new Date(zoom.lastErrorAt).toLocaleString("en-US", { timeZone: settings.default_timezone })})` : ""}</span>
                : "None"}
            </Fact>
          </section>

          <div className="cf-actions">
            {zoom.configured ? (
              <a href="/api/zoom/oauth/start" className="cc-btn primary">
                {zoom.connected ? "Reauthorize Zoom" : "Connect Zoom"} <IconArrowRight size={13} />
              </a>
            ) : null}
            {zoom.connected ? (
              <form action={disconnectZoomAction}>
                <button type="submit" className="cc-btn is-danger">Disconnect Zoom</button>
              </form>
            ) : null}
          </div>
          <p className="cc-faint cf-small">
            Tokens are encrypted (AES-256-GCM) and stored server-side in a table no browser session can read.
            The host start link is fetched fresh at each Start and never stored or emailed.
          </p>
        </Panel>

        <Panel title="Zoom Marketplace app" sub="one-time setup" className="cf-panel">
          <ol className="cf-steps">
            <li>At marketplace.zoom.us → Develop → Build App, create a <b>General App</b> (user-managed).</li>
            <li>
              OAuth Redirect URL and Allow List:
              <div className="cf-linkrow"><code>{zoomRedirectUri(origin)}</code><CopyButton text={zoomRedirectUri(origin)} label="Copy" className="cc-btn is-sm" /></div>
            </li>
            <li>
              Scopes:
              <ul className="cf-scopes">{ZOOM_REQUIRED_SCOPES.map((s) => <li key={s}><code>{s}</code></li>)}</ul>
            </li>
            <li>
              Event subscriptions → endpoint URL, with <i>meeting.started</i>, <i>meeting.ended</i>, <i>meeting.deleted</i>
              and the app deauthorization event:
              <div className="cf-linkrow"><code>{zoomWebhookUrl(origin)}</code><CopyButton text={zoomWebhookUrl(origin)} label="Copy" className="cc-btn is-sm" /></div>
            </li>
            <li>
              In Vercel, set <code>ZOOM_CLIENT_ID</code>, <code>ZOOM_CLIENT_SECRET</code>,
              <code>ZOOM_WEBHOOK_SECRET_TOKEN</code> and <code>INTEGRATION_ENCRYPTION_KEY</code> (32+ random characters), then redeploy and press Connect Zoom.
            </li>
          </ol>
        </Panel>
      </div>

      <Panel title="Meeting defaults" className="cf-panel">
        <ConferenceSettingsForm settings={settings} save={updateConferenceSettingsAction} />
      </Panel>

      <Panel title="Partner organizations" sub="cross-company conferences" className="cf-panel">
        <ul className="cf-requests">
          {CONFERENCE_PARTNERS.map((p) => (
            <li key={p.key}>
              <div>
                <b>{p.name}</b>
                <span className="cc-sub">
                  {p.syncStatus === "active"
                    ? "Shared conference invitations sync to their Conference Center."
                    : "Sync pending configuration — partner meetings are created on your Zoom and the participant link is emailed. Nothing is synchronized to their Conference Center yet."}
                </span>
              </div>
              <span className={`cc-chip ${p.syncStatus === "active" ? "t-ok" : "t-warn"}`}>
                {p.syncStatus === "active" ? "Active" : "Pending configuration"}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
