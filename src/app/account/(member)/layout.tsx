import { redirect } from "next/navigation";
import { getPortalMember } from "@/lib/portal/session";
import { portalSignOutAction } from "../actions";
import { MemberNav } from "./MemberNav";

/** Signed-in member pages share this frame: who you are, the tabs, sign out. */
export const dynamic = "force-dynamic";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const member = await getPortalMember();
  if (!member) redirect("/account/login?denied=1");
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
