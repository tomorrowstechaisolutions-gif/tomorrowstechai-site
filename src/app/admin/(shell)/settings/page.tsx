import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { TERM_LABELS } from "@/lib/invoices/config";
import {
  ADMIN_ROLES, DEFAULTABLE_TERMS, LIMITS, ROLE_LABELS, accessChangeAllowed, changedKeys,
  describeHours, isAdminRole, type DefaultKey,
} from "@/lib/settings/defaults";
import { baseDefaults, loadBusinessDefaults } from "@/lib/settings/store";
import { BUILT_IN_PROFILE, FIXED_IDENTITY, PROFILE_LIMITS, changedProfileKeys, type ProfileKey } from "@/lib/settings/profile";
import { loadBusinessProfile } from "@/lib/settings/profile-store";
import { BUSINESS_TZ } from "@/lib/time/chicago";
import {
  changePasswordAction, removeAdminAction, resetBusinessDefaultsAction, resetBusinessProfileAction,
  saveBusinessDefaultsAction, saveBusinessProfileAction, setAdminRoleAction, updateMyNameAction,
} from "@/app/admin/settings-actions";
import { Panel, ErrorState } from "@/components/admin/cc/Panel";
import PendingButton from "@/components/admin/cc/PendingButton";
import { IconFile, IconServer, IconSettings, IconUsers } from "@/components/admin/cc/Icons";
import styles from "@/components/admin/cc/settings/settings.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

/**
 * Settings: the values this business runs on that are not a connection.
 *
 * Connections, keys and tokens live on Integrations; what the site emails
 * the owner lives on Notifications; email wording on System emails; contract
 * text on Agreements. This page links to those instead of repeating them,
 * and never shows a secret.
 */

type TeamRow = { id: string; user_id: string; email: string; full_name: string | null; role: string; created_at: string };

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: BUSINESS_TZ, month: "short", day: "numeric", year: "numeric" }) : null;
const moment = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: BUSINESS_TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

/** The team, with each person's last sign-in. One failed lookup hides one date, not the list. */
async function loadTeam(): Promise<{ rows: TeamRow[]; lastSignIn: Map<string, string | null>; error: string | null }> {
  const lastSignIn = new Map<string, string | null>();
  if (!supabaseConfigured()) return { rows: [], lastSignIn, error: "The database is not configured." };
  const db = supabaseAdmin();
  const { data, error } = await db.from("admin_users").select("id, user_id, email, full_name, role, created_at").order("created_at", { ascending: true });
  if (error) return { rows: [], lastSignIn, error: error.message };
  const rows = (data ?? []) as TeamRow[];
  await Promise.all(rows.map(async (r) => {
    try {
      const { data: u } = await db.auth.admin.getUserById(r.user_id);
      if (u?.user) lastSignIn.set(r.id, u.user.last_sign_in_at ?? null);
    } catch {
      /* date shows as "not known" */
    }
  }));
  return { rows, lastSignIn, error: null };
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const notice = one("notice");
  const error = one("error");
  const at = one("at");
  const flash = (section: string) =>
    at === section && (notice || error)
      ? <div className={`cc-flash ${error ? "is-warn" : "is-ok"}`} role="status">{error ?? notice}</div>
      : null;

  const [stored, team, profile] = await Promise.all([loadBusinessDefaults(), loadTeam(), loadBusinessProfile()]);
  const p = profile.value;
  const profileChanged = new Set<ProfileKey>(changedProfileKeys(p));
  const pmark = (key: ProfileKey) =>
    profileChanged.has(key)
      ? <span className={styles.hint}><span className={styles.changed}>Changed.</span> Built-in: {BUILT_IN_PROFILE[key]}</span>
      : <span className={styles.hint}>Built-in value.</span>;
  const d = stored.value;
  const base = baseDefaults();
  const changed = new Set<DefaultKey>(changedKeys(d, base));
  const mark = (key: DefaultKey, builtIn: string) =>
    changed.has(key)
      ? <span className={styles.hint}><span className={styles.changed}>Changed.</span> Built-in: {builtIn}</span>
      : <span className={styles.hint}>Built-in value.</span>;

  const me = session.admin;
  const myRole = isAdminRole(me.role) ? me.role : null;
  const canEdit = me.role === "owner" || me.role === "admin";
  const isOwner = me.role === "owner";
  const followupsOn = Boolean(process.env.CRON_SECRET);
  const notifyTo = process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Settings</h1>
          <p>Who the business is, how it runs by default, who can sign in, and your own account. Connections and keys are on Integrations.</p>
        </div>
      </div>
      {/* A message with no section (an old link) still shows, at the top. */}
      {!at && (notice || error) ? <div className={`cc-flash ${error ? "is-warn" : "is-ok"}`} role="status">{error ?? notice}</div> : null}

      <div className="cc-board">
        {/* ── Business profile ──────────────────────────────────────── */}
        <section className="cc-panel cc-s12" id="profile">
          <div className="cc-panel-head">
            <IconFile size={15} />
            <h2>Business profile</h2>
            <span className="cc-sub">{profileChanged.size ? `${profileChanged.size} changed from built-in` : "all built-in values"}</span>
          </div>
          <div className="cc-panel-body">
            {flash("profile")}
            {profile.readError ? (
              <div className="cc-flash is-warn">
                The saved profile could not be read ({profile.readError}), so the built-in values are in use and shown below.
              </div>
            ) : null}
            <p className={styles.groupSub}>
              The contact details the business shows the public. Saving changes them in system emails, invoice and proposal pages,
              the site footer, the sales and contact pages, the member portal, Privacy and Terms, and the data search engines read.
            </p>

            <form action={saveBusinessProfileAction}>
              <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <div className={styles.trio}>
                  <label className="cc-field">
                    <span className="cc-label">Phone</span>
                    <input className="cc-input" type="tel" name="phone" defaultValue={p.phone} required />
                    {pmark("phone")}
                  </label>
                  <label className="cc-field">
                    <span className="cc-label">Contact email</span>
                    <input className="cc-input" type="email" name="email" defaultValue={p.email} maxLength={PROFILE_LIMITS.email} required />
                    {pmark("email")}
                  </label>
                  <label className="cc-field">
                    <span className="cc-label">Legal business name</span>
                    <input className="cc-input" name="legalName" defaultValue={p.legalName} maxLength={PROFILE_LIMITS.legalName} required />
                    {pmark("legalName")}
                  </label>
                  <label className="cc-field">
                    <span className="cc-label">Emails are signed</span>
                    <input className="cc-input" name="signerName" defaultValue={p.signerName} maxLength={PROFILE_LIMITS.signerName} required />
                    {pmark("signerName")}
                  </label>
                  <label className="cc-field">
                    <span className="cc-label">Line under the signature</span>
                    <input className="cc-input" name="signerRole" defaultValue={p.signerRole} maxLength={PROFILE_LIMITS.signerRole} required />
                    {pmark("signerRole")}
                  </label>
                  <div className={styles.cityState}>
                    <label className="cc-field">
                      <span className="cc-label">City</span>
                      <input className="cc-input" name="city" defaultValue={p.city} maxLength={PROFILE_LIMITS.city} required />
                      {pmark("city")}
                    </label>
                    <label className="cc-field">
                      <span className="cc-label">State</span>
                      <input className="cc-input" name="region" defaultValue={p.region} maxLength={2} required />
                    </label>
                  </div>
                </div>
              </fieldset>

              <div className={styles.bar}>
                {canEdit ? <PendingButton className="cc-btn primary" busy="Saving…">Save profile</PendingButton> : null}
                <span className={styles.state}>
                  {!canEdit ? "Your role can look at these but not change them."
                    : profile.saved ? `Last saved ${moment(profile.updatedAt) ?? "at an unknown time"}${profile.updatedBy ? ` by ${profile.updatedBy}` : ""}`
                    : "Nothing saved yet. The site is using its built-in values."}
                </span>
              </div>
            </form>
            {canEdit && profile.saved ? (
              <form action={resetBusinessProfileAction} style={{ marginTop: 10 }}>
                <PendingButton className="cc-btn ghost" busy="Resetting…">Reset profile to built-in</PendingButton>
              </form>
            ) : null}

            <p className="cc-note">
              <b>Not controlled here:</b> the company name ({FIXED_IDENTITY.name}) and website address ({FIXED_IDENTITY.siteLabel}) are fixed, because the name runs through the wording of the whole site.
              No street address is published anywhere, only the city and state. The city here shows in the footer and in search data; a few sentences of marketing copy that mention the city (About, Careers, Job Catcher) are written by hand and do not follow it.
              The legal wording of Terms and Privacy, the invoice footer line (in Business defaults below), the address notifications are sent to,
              and the account clients are asked to invite to their Stripe or domain are separate from this profile.
              Emails already sent, and a one-to-one lead email you have already started writing, are not changed.
            </p>
          </div>
        </section>

        {/* ── Business defaults ─────────────────────────────────────── */}
        <section className="cc-panel cc-s8" id="defaults">
          <div className="cc-panel-head">
            <IconSettings size={15} />
            <h2>Business defaults</h2>
            <span className="cc-sub">{changed.size ? `${changed.size} changed from built-in` : "all built-in values"}</span>
          </div>
          <div className="cc-panel-body">
            {flash("defaults")}
            {stored.readError ? (
              <div className="cc-flash is-warn">
                Saved settings could not be read ({stored.readError}), so the built-in values are in use and shown below.
              </div>
            ) : null}

            <form action={saveBusinessDefaultsAction}>
              <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <div className={styles.group}>
                  <h3 className={styles.groupHead}>Invoices</h3>
                  <p className={styles.groupSub}>What a new invoice starts with. You can still change any of it on the invoice itself; invoices already raised are not touched.</p>
                  <label className="cc-field">
                    <span className="cc-label">Payment terms</span>
                    <select className="cc-select" name="invoiceTerm" defaultValue={d.invoiceTerm}>
                      {DEFAULTABLE_TERMS.map((t) => <option key={t} value={t}>{TERM_LABELS[t]}</option>)}
                    </select>
                    {mark("invoiceTerm", TERM_LABELS[base.invoiceTerm])}
                  </label>
                  <label className="cc-field">
                    <span className="cc-label">Terms wording</span>
                    <textarea className="cc-textarea" name="invoiceTermsText" rows={4} maxLength={LIMITS.invoiceTermsText} defaultValue={d.invoiceTermsText} required />
                    <span className={styles.hint}>
                      {changed.has("invoiceTermsText") ? <><span className={styles.changed}>Changed.</span> </> : "Built-in wording. "}
                      Keep this in step with the payment clause in your <Link href="/admin/settings/agreements" className="cc-link">agreement</Link>, so a client never holds two different sentences about when money is due.
                    </span>
                  </label>
                  <label className="cc-field">
                    <span className="cc-label">Footer line</span>
                    <textarea className="cc-textarea" name="invoiceFooter" rows={2} maxLength={LIMITS.invoiceFooter} defaultValue={d.invoiceFooter} required style={{ minHeight: 56 }} />
                    <span className={styles.hint}>{changed.has("invoiceFooter") ? <span className={styles.changed}>Changed.</span> : "Built-in wording."}</span>
                  </label>
                </div>

                <div className={styles.group}>
                  <h3 className={styles.groupHead}>Proposals</h3>
                  <p className={styles.groupSub}>How long a new proposal stays open before it expires. The date can be changed on each proposal.</p>
                  <label className="cc-field" style={{ maxWidth: 220 }}>
                    <span className="cc-label">Valid for (days)</span>
                    <input className="cc-input" type="number" name="proposalValidDays" min={LIMITS.proposalValidDays.min} max={LIMITS.proposalValidDays.max} step={1} defaultValue={d.proposalValidDays} required />
                    {mark("proposalValidDays", `${base.proposalValidDays} days`)}
                  </label>
                </div>

                <div className={styles.group}>
                  <h3 className={styles.groupHead}>Google reviews</h3>
                  <p className={styles.groupSub}>Where &ldquo;leave a review&rdquo; sends a client (the review email and the member portal), and how soon the same client can be asked again.</p>
                  <label className="cc-field">
                    <span className="cc-label">Review link</span>
                    <input className="cc-input" type="url" name="reviewUrl" defaultValue={d.reviewUrl} placeholder="https://g.page/r/…/review" required />
                    {mark("reviewUrl", base.reviewUrl)}
                  </label>
                  <label className="cc-field" style={{ maxWidth: 220 }}>
                    <span className="cc-label">Days between asks</span>
                    <input className="cc-input" type="number" name="reviewGapDays" min={LIMITS.reviewGapDays.min} max={LIMITS.reviewGapDays.max} step={1} defaultValue={d.reviewGapDays} required />
                    {mark("reviewGapDays", `${base.reviewGapDays} days`)}
                  </label>
                </div>

                <div className={styles.group}>
                  <h3 className={styles.groupHead}>Lead follow-up emails</h3>
                  <p className={styles.groupSub}>
                    The two automatic emails a new lead gets if they have not replied, booked or bought. Counted in hours from when the lead arrives.
                    A change applies to leads that come in from now on; leads already waiting keep the timing they were given.{" "}
                    {followupsOn
                      ? <>The sequence is <b>switched on</b>.</>
                      : <>The sequence is <b>switched off</b> until its key is set (see <Link href="/admin/system/integrations" className="cc-link">Integrations</Link>), so nothing sends whatever these say.</>}
                  </p>
                  <div className={styles.pair}>
                    <label className="cc-field">
                      <span className="cc-label">First follow-up (hours)</span>
                      <input className="cc-input" type="number" name="followupFirstHours" min={LIMITS.followupHours.min} max={LIMITS.followupHours.max} step={1} defaultValue={d.followupFirstHours} required />
                      <span className={styles.hint}>
                        {changed.has("followupFirstHours") ? <><span className={styles.changed}>Changed.</span> Built-in: {describeHours(base.followupFirstHours)}. </> : null}
                        Now: {describeHours(d.followupFirstHours)} after the lead.
                      </span>
                    </label>
                    <label className="cc-field">
                      <span className="cc-label">Second follow-up (hours)</span>
                      <input className="cc-input" type="number" name="followupSecondHours" min={LIMITS.followupHours.min} max={LIMITS.followupHours.max} step={1} defaultValue={d.followupSecondHours} required />
                      <span className={styles.hint}>
                        {changed.has("followupSecondHours") ? <><span className={styles.changed}>Changed.</span> Built-in: {describeHours(base.followupSecondHours)}. </> : null}
                        Now: {describeHours(d.followupSecondHours)} after the lead.
                      </span>
                    </label>
                  </div>
                </div>
              </fieldset>

              <div className={styles.bar}>
                {canEdit ? <PendingButton className="cc-btn primary" busy="Saving…">Save defaults</PendingButton> : null}
                <span className={styles.state}>
                  {!canEdit ? "Your role can look at these but not change them."
                    : stored.saved ? `Last saved ${moment(stored.updatedAt) ?? "at an unknown time"}${stored.updatedBy ? ` by ${stored.updatedBy}` : ""}`
                    : "Nothing saved yet. The site is using its built-in values."}
                </span>
              </div>
            </form>
            {canEdit && stored.saved ? (
              <form action={resetBusinessDefaultsAction} style={{ marginTop: 10 }}>
                <PendingButton className="cc-btn ghost" busy="Resetting…">Reset everything to built-in</PendingButton>
              </form>
            ) : null}
          </div>
        </section>

        {/* ── Your account ──────────────────────────────────────────── */}
        <section className="cc-panel cc-s4" id="account">
          <div className="cc-panel-head">
            <IconUsers size={15} />
            <h2>Your account</h2>
          </div>
          <div className="cc-panel-body">
            {flash("account")}
            <dl className="cc-kv" style={{ margin: "0 0 14px" }}>
              <dt>Signed in as</dt><dd>{me.email}</dd>
              <dt>Role</dt><dd>{myRole ? ROLE_LABELS[myRole].label : me.role}</dd>
              <dt>Two-step sign-in</dt><dd>Not set up. The admin signs in with a password only.</dd>
            </dl>

            <form action={updateMyNameAction}>
              <label className="cc-field">
                <span className="cc-label">Your name</span>
                <input className="cc-input" name="full_name" defaultValue={me.full_name ?? ""} placeholder="Not set" maxLength={80} required />
                <span className={styles.hint}>Shown in the sidebar and wherever the admin records who did something.</span>
              </label>
              <PendingButton className="cc-btn" busy="Saving…">Save name</PendingButton>
            </form>

            <hr className={styles.sep} />

            <h3 className={styles.sub}>Change password</h3>
            <form action={changePasswordAction} autoComplete="off">
              <label className="cc-field">
                <span className="cc-label">Current password</span>
                <input className="cc-input" type="password" name="current_password" autoComplete="current-password" required />
              </label>
              <label className="cc-field">
                <span className="cc-label">New password</span>
                <input className="cc-input" type="password" name="new_password" autoComplete="new-password" minLength={10} required />
                <span className={styles.hint}>At least 10 characters.</span>
              </label>
              <label className="cc-field">
                <span className="cc-label">New password again</span>
                <input className="cc-input" type="password" name="confirm_password" autoComplete="new-password" minLength={10} required />
              </label>
              <PendingButton className="cc-btn" busy="Changing…">Change password</PendingButton>
            </form>
          </div>
        </section>

        {/* ── Team & access ─────────────────────────────────────────── */}
        <section className="cc-panel cc-s8" id="team">
          <div className="cc-panel-head">
            <IconUsers size={15} />
            <h2>Team &amp; access</h2>
            <span className="cc-sub">{team.error ? "could not load" : `${team.rows.length} ${team.rows.length === 1 ? "person" : "people"} can sign in`}</span>
          </div>
          <div className="cc-panel-body">
            {flash("team")}
            {team.error ? <ErrorState message={team.error} /> : (
              <div className="cc-scroll">
                <table className="cc-table dense">
                  <thead><tr><th>Person</th><th>Role</th><th>Added</th><th>Last sign-in</th><th /></tr></thead>
                  <tbody>
                    {team.rows.map((r) => {
                      const self = r.id === me.id;
                      const actor = { id: me.id, role: me.role };
                      const mayRemove = accessChangeAllowed(actor, r, null, team.rows).ok;
                      const seen = team.lastSignIn.has(r.id) ? (moment(team.lastSignIn.get(r.id) ?? null) ?? "Never") : "Not known";
                      return (
                        <tr key={r.id}>
                          <td>
                            <b>{r.full_name || "Name not set"}</b>{self ? <span className={styles.you}>you</span> : null}
                            <div className="cc-dim">{r.email}</div>
                          </td>
                          <td>
                            {isOwner ? (
                              <form action={setAdminRoleAction} className={styles.roleForm}>
                                <input type="hidden" name="id" value={r.id} />
                                <select className="cc-select" name="role" defaultValue={r.role} aria-label={`Role for ${r.email}`}>
                                  {ADMIN_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role].label}</option>)}
                                </select>
                                <PendingButton className="cc-btn" busy="Saving…">Set</PendingButton>
                              </form>
                            ) : (isAdminRole(r.role) ? ROLE_LABELS[r.role].label : r.role)}
                          </td>
                          <td className="cc-dim">{day(r.created_at) ?? "Not known"}</td>
                          <td className="cc-dim">{seen}</td>
                          <td>
                            {mayRemove ? (
                              <details className={styles.remove}>
                                <summary>Remove…</summary>
                                <form action={removeAdminAction}>
                                  <input type="hidden" name="id" value={r.id} />
                                  <PendingButton className="cc-btn is-danger" busy="Removing…">Yes, remove access</PendingButton>
                                </form>
                              </details>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="cc-note">
              <b>Owner</b>: {ROLE_LABELS.owner.can} <b>Admin</b>: {ROLE_LABELS.admin.can} <b>Viewer</b>: {ROLE_LABELS.viewer.can}
              {isOwner ? " The last owner can't be demoted or removed, and you can't remove yourself." : " Only an owner can change roles or remove someone."}
              <br />
              Removing someone takes away their admin access straight away; their sign-in is left in Supabase but opens nothing.
              Inviting a new person is not built into this page yet: it is still done in Supabase (Authentication → Users, then a row in admin_users).
            </p>
          </div>
        </section>

        {/* ── Everything that is set somewhere else ─────────────────── */}
        <div className="cc-s4" style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Panel title="Set elsewhere" icon={<IconServer size={15} />}>
            <ul className={styles.links}>
              <li><Link href="/admin/system/integrations"><b>Integrations →</b><small>Every connected service, its keys and whether it is working. Connect or disconnect Google here.</small></Link></li>
              <li><Link href="/admin/system/notifications"><b>Notifications →</b><small>Which emails the site sends you, with a switch for each.</small></Link></li>
              <li><Link href="/admin/system/emails"><b>System emails →</b><small>The wording of every automatic email to leads and clients.</small></Link></li>
              <li><Link href="/admin/settings/agreements"><b>Agreements →</b><small>The contract text proposals are signed under.</small></Link></li>
              <li><Link href="/admin/conference-center/settings"><b>Conference Center settings →</b><small>Meeting length, buffers and Zoom options.</small></Link></li>
              <li><Link href="/admin/marketing/brand"><b>Brand Assets →</b><small>Logos, colours and voice for content.</small></Link></li>
            </ul>
          </Panel>

          <Panel title="Fixed for now" icon={<IconFile size={15} />}>
            <dl className="cc-kv" style={{ margin: 0 }}>
              <dt>Time zone</dt><dd>Central Time ({BUSINESS_TZ}). Every date and time in the admin uses it.</dd>
              <dt>Your alerts go to</dt><dd>{notifyTo}</dd>
              <dt>Invoice numbers</dt><dd>INV-year-0001, counted up automatically.</dd>
              <dt>Currency</dt><dd>US dollars.</dd>
            </dl>
            <p className="cc-note">These are not editable here. The alert address is a deployment key (CONTACT_TO_EMAIL); the rest are built into the site.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
