import Link from "next/link";
import { disconnectGoogleAction } from "@/app/admin/meeting-actions";
import { Panel } from "@/components/admin/cc/Panel";
import PendingButton from "@/components/admin/cc/PendingButton";
import { IconMail } from "@/components/admin/cc/Icons";
import fin from "@/components/admin/cc/finance/finance.module.css";

/**
 * The Google account switch: connect, reconnect or disconnect the one Google
 * account behind Email, Calendar and Meet. It lives on Integrations because
 * it is a connection, not a setting. No token is ever shown.
 */

export type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  account?: string | null;
  calendarId?: string | null;
  gmail?: boolean;
  lastError?: string | null;
};

const START = "/api/google/oauth/start?next=/admin/system/integrations";

/** What the round trip to Google ended in, as a sentence. */
export function googleOutcome(result: string | undefined, detail: string | undefined): { ok: boolean; text: string } | null {
  switch (result) {
    case "connected": return { ok: true, text: "Connected. Email, Calendar and Google Meet now use this account." };
    case "disconnected": return { ok: true, text: "Google disconnected. The stored access was deleted." };
    case "denied": return { ok: false, text: "Google was not given permission, so nothing was connected." };
    case "badstate": return { ok: false, text: "That sign-in did not start here, so it was refused. Try again from this page." };
    case "unconfigured": return { ok: false, text: "The Google app keys are not set yet, so there is nothing to connect with." };
    case "failed":
    case "nocode": return { ok: false, text: detail || "Google would not complete the connection." };
    default: return null;
  }
}

export function GoogleAccountPanel({ google }: { google: GoogleStatus | null }) {
  return (
    <section id="google-account" className="cc-s12">
      <Panel title="Google account" sub="Gmail, Calendar and Meet" icon={<IconMail size={15} />}>
        {!google ? (
          <p className={fin.note} style={{ marginTop: 0 }}>The Google connection could not be read just now. Reload to try again.</p>
        ) : !google.configured ? (
          <p className={fin.note} style={{ marginTop: 0 }}>
            Not set up. The Google app keys (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) have to be added in Vercel first; then come back here to connect the account.
          </p>
        ) : google.connected ? (
          <>
            <p className={fin.note} style={{ marginTop: 0 }}>
              Connected as <b>{google.account ?? "an account Google did not name"}</b>, writing to calendar <b>{google.calendarId ?? "primary"}</b>.
              {google.lastError ? ` Last error: ${google.lastError}` : ""}
            </p>
            {!google.gmail ? (
              <p className={fin.note}>This connection has calendar access only, so the Inbox can&apos;t read mail. Reconnect to add Gmail.</p>
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <Link href={START} className="cc-btn">Reconnect Google</Link>
              <form action={disconnectGoogleAction} style={{ margin: 0 }}>
                <PendingButton className="cc-btn is-danger" busy="Disconnecting…">Disconnect Google</PendingButton>
              </form>
            </div>
            <p className={fin.note}>Disconnecting deletes the stored access. Inbox, Calendar sync and Meet links stop until you connect again.</p>
          </>
        ) : (
          <>
            <p className={fin.note} style={{ marginTop: 0 }}>
              Keys are set but no account is connected. Connecting asks Google for permission to manage calendar events and to read, send, label and archive Gmail (it cannot permanently delete mail).
            </p>
            <div style={{ marginTop: 12 }}><Link href={START} className="cc-btn primary">Connect Google</Link></div>
          </>
        )}
      </Panel>
    </section>
  );
}
