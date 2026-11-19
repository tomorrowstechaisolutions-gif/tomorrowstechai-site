import { redirect } from "next/navigation";
import { getPortalViewer } from "@/lib/portal/session";
import { exitViewAsClientAction } from "@/app/admin/portal-actions";
import { portalSignOutAction } from "../actions";
import { MemberNav } from "./MemberNav";

/** Signed-in member pages share this frame: who you are, the tabs, sign out. */
export const dynamic = "force-dynamic";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const member = await getPortalViewer();
  if (!member) redirect("/account/login?denied=1");

  // An admin viewing as this client sees the same pages the client does.
  // A disabled fieldset switches off every button and field inside it in the
  // browser; links still work, so the tabs and invoice links can be followed.
  // The actions behind those buttons would refuse anyway (see session.ts).
  if (member.preview) {
    return (
      <main className="acct-main">
        <div className="acct-preview" role="status">
          <div>
            <strong>Viewing as {member.businessName}</strong>
            <span>
              This is their member portal as they see it. View only: buttons and forms are switched
              off, and nothing here can be changed.
            </span>
          </div>
          <form action={exitViewAsClientAction}>
            <input type="hidden" name="customer_id" value={member.customerId} />
            <button className="acct-link-btn">Exit view</button>
          </form>
        </div>
        <div className="acct-head">
          <div>
            <p className="acct-eyebrow">Member account</p>
            <h1 className="acct-hello">{member.businessName}</h1>
            <p className="acct-lede">Signed in as {member.email}</p>
          </div>
          <button className="acct-link-btn" disabled>Sign out</button>
        </div>
        <MemberNav />
        <fieldset disabled className="acct-viewonly">{children}</fieldset>
      </main>
    );
  }

  return (
    <main className="acct-main">
      <div className="acct-head">
        <div>
          <p className="acct-eyebrow">Member account</p>
          <h1 className="acct-hello">{member.businessName}</h1>
          <p className="acct-lede">Signed in as {member.email}</p>
        </div>
        <form action={portalSignOutAction}>
          <button className="acct-link-btn">Sign out</button>
        </form>
      </div>
      <MemberNav />
      {children}
    </main>
  );
}
