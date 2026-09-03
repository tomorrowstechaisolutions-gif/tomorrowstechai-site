import Link from "next/link";
import { googleConnection } from "@/lib/google/oauth";
import { disconnectGoogleAction } from "@/app/admin/meeting-actions";

export const dynamic = "force-dynamic";

/**
 * Reports which environment variables are PRESENT. Never their values —
 * this page is behind auth, but a screenshot isn't.
 */
const GROUPS: { title: string; note: string; vars: { key: string; why: string }[] }[] = [
  {
    title: "Database",
    note: "Without these, leads still email out but nothing is stored and the admin is blank.",
    vars: [
      { key: "NEXT_PUBLIC_SUPABASE_URL", why: "Supabase project URL" },
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", why: "Publishable key — admin sign-in" },
      { key: "SUPABASE_SERVICE_ROLE_KEY", why: "Server-only. Writes public leads past RLS." },
    ],
  },
  {
    title: "Email",
    note: "Confirmation to the lead and the notification to you.",
    vars: [
      { key: "RESEND_API_KEY", why: "Resend API key" },
      { key: "CONTACT_FROM_EMAIL", why: "Verified sending address" },
      { key: "CONTACT_TO_EMAIL", why: "Where notifications land" },
    ],
  },
  {
    title: "Meta tracking",
    note: "Pixel is browser-side; the CAPI token is server-side and recovers the events ad blockers eat.",
    vars: [
      { key: "NEXT_PUBLIC_META_PIXEL_ID", why: "The one pixel — do not create a second" },
      { key: "META_CAPI_ACCESS_TOKEN", why: "Conversions API token" },
      { key: "META_TEST_EVENT_CODE", why: "Optional, only while testing" },
    ],
  },
  {
    title: "Automated follow-up",
    note: "The 24h and 72h emails stay off until CRON_SECRET is set. The hourly Vercel Cron is declared in vercel.json.",
    vars: [
      { key: "CRON_SECRET", why: "Authorises the follow-up cron endpoint" },
      { key: "NEXT_PUBLIC_SITE_URL", why: "Builds the one-click unsubscribe links" },
    ],
  },
  {
    title: "Google Calendar & Meet",
    note: "Scheduling a Google Meet needs an OAuth client. Once these are set, connect the account below — the refresh token is stored server-side and is never readable by an admin session.",
    vars: [
      { key: "GOOGLE_CLIENT_ID", why: "OAuth client id from Google Cloud" },
      { key: "GOOGLE_CLIENT_SECRET", why: "Server-only. Never reaches the browser." },
      { key: "GOOGLE_REDIRECT_URI", why: "Optional — defaults to /api/google/oauth/callback" },
    ],
  },
  {
    title: "Meta Instant Forms",
    note: "The webhook stays dormant until all three are set.",
    vars: [
      { key: "META_WEBHOOK_VERIFY_TOKEN", why: "Handshake token you invent" },
      { key: "META_APP_SECRET", why: "Verifies webhook signatures" },
      { key: "META_PAGE_ACCESS_TOKEN", why: "Reads the submitted lead fields" },
    ],
  },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  const google = await googleConnection();
  const result = one("google");

  return (
    <>
      <header className="ad-head">
        <h1>Settings</h1>
        <p>
          What this deployment has configured. Values are never shown — only
          whether they are set.
        </p>
      </header>

      {GROUPS.map((g) => (
        <section key={g.title} className="ad-panel">
          <div className="ad-panel-head">
            <h2>{g.title}</h2>
          </div>
          <p className="ad-note">{g.note}</p>
          <ul className="ad-envlist">
            {g.vars.map((v) => {
              const present = Boolean(process.env[v.key]);
              return (
                <li key={v.key}>
                  <span className={`ad-dot ${present ? "on" : "off"}`} aria-hidden="true" />
                  <code>{v.key}</code>
                  <span className="ad-muted">{v.why}</span>
                  <span className={present ? "ad-ok" : "ad-missing"}>
                    {present ? "set" : "not set"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* ── The one thing on this page that is a switch, not a report ── */}
      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Google account</h2>
        </div>

        {result === "connected" ? (
          <p className="ad-note ad-ok">Connected. New Google Meet meetings will be created on this calendar.</p>
        ) : result === "denied" ? (
          <p className="ad-note ad-missing">Google was not given permission, so nothing was connected.</p>
        ) : result === "badstate" ? (
          <p className="ad-note ad-missing">That sign-in did not start here, so it was refused. Try again from this page.</p>
        ) : result === "unconfigured" ? (
          <p className="ad-note ad-missing">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.</p>
        ) : result === "failed" || result === "nocode" ? (
          <p className="ad-note ad-missing">{one("detail") || "Google would not complete the connection."}</p>
        ) : null}

        {!google.configured ? (
          <p className="ad-note">
            Not configured yet. Create an OAuth client in Google Cloud, add the two
            variables above, then come back and connect the account.
          </p>
        ) : google.connected ? (
          <>
            <p className="ad-note">
              Connected as <code>{google.account ?? "unknown account"}</code>, writing to
              calendar <code>{google.calendarId}</code>.
              {google.lastError ? ` Last error: ${google.lastError}` : ""}
            </p>
            <form action={disconnectGoogleAction}>
              <button type="submit" className="ad-btn">Disconnect Google</button>
            </form>
          </>
        ) : (
          <>
            <p className="ad-note">
              The credentials are set but no account is connected, so Google Meet cannot
              be chosen when scheduling. Connecting asks only for permission to manage
              calendar events.
            </p>
            <Link href="/api/google/oauth/start" className="ad-btn">Connect Google Calendar</Link>
          </>
        )}
      </section>

      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Adding another admin</h2>
        </div>
        <p className="ad-note">
          Create the user in Supabase → Authentication → Users, then insert a
          row in <code>admin_users</code> with that user&rsquo;s id. Signing in
          without that row grants nothing — row-level security returns an empty
          result for every table.
        </p>
      </section>
    </>
  );
}
