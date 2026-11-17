import { Panel } from "@/components/admin/cc/Panel";
import { IconUsers } from "@/components/admin/cc/Icons";
import { invitePortalMemberAction, setPortalMemberStatusAction } from "@/app/admin/portal-actions";

export type PortalMemberRow = {
  id: string;
  email: string;
  status: "invited" | "active" | "disabled";
  invited_at: string | null;
  invite_count: number;
  activated_at: string | null;
  last_login_at: string | null;
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never";

const CHIP = { invited: ["Invited", "t-info"], active: ["Active", "t-ok"], disabled: ["Access off", "t-muted"] } as const;

/** Member portal access for one client: invite, re-send, turn off. */
export function PortalPanel({
  customerId, email, member, notice, error,
}: {
  customerId: string;
  email: string | null;
  member: PortalMemberRow | null;
  notice?: string;
  error?: string;
}) {
  return (
    <Panel title="Member portal" icon={<IconUsers size={15} />} className="cc-s4 cc-m4" bodyClass="tight">
      {notice ? <p className="cc-note" style={{ marginTop: 0 }}>{notice}</p> : null}
      {error ? <p className="cc-note" style={{ marginTop: 0, color: "#fecaca" }}>{error}</p> : null}
      {member ? (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: "0.84rem", margin: "0 0 12px" }}>
          <span className="cc-faint">Status</span><span><span className={`cc-chip ${CHIP[member.status][1]}`}>{CHIP[member.status][0]}</span></span>
          <span className="cc-faint">Username</span><span>{member.email}</span>
          <span className="cc-faint">Invited</span><span>{when(member.invited_at)}{member.invite_count > 1 ? ` (${member.invite_count} times)` : ""}</span>
          <span className="cc-faint">Password set</span><span>{when(member.activated_at)}</span>
          <span className="cc-faint">Last sign-in</span><span>{when(member.last_login_at)}</span>
        </div>
      ) : (
        <p className="cc-faint" style={{ marginTop: 0 }}>
          {email
            ? <>No member account yet. Inviting emails <strong>{email}</strong> a link to choose a password; that email is their username.</>
            : "Add an email to this client first. It becomes their username."}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {email && member?.status !== "disabled" ? (
          <form action={invitePortalMemberAction}>
            <input type="hidden" name="customer_id" value={customerId} />
            <button className="cc-btn primary">{member ? (member.status === "active" ? "Send password reset" : "Resend invite") : "Invite to member portal"}</button>
          </form>
        ) : null}
        {member ? (
          <form action={setPortalMemberStatusAction}>
            <input type="hidden" name="customer_id" value={customerId} />
            <input type="hidden" name="member_id" value={member.id} />
            <input type="hidden" name="disable" value={member.status === "disabled" ? "0" : "1"} />
            <button className="cc-btn">{member.status === "disabled" ? "Turn access back on" : "Turn off access"}</button>
          </form>
        ) : null}
      </div>
    </Panel>
  );
}
