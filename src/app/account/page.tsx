import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalMember } from "@/lib/portal/session";
import { portalSignOutAction } from "./actions";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

/**
 * Member home. Phase 1: who you're signed in as. Services, invoices,
 * billing and more services arrive in Phases 2 to 4.
 */
export default async function AccountHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const member = await getPortalMember();
  if (!member) redirect("/account/login?denied=1");
  const { welcome } = await searchParams;
  return (
    <main className="acct-main">
      {welcome ? <p className="acct-msg ok">Your password is set. You&rsquo;re signed in.</p> : null}
      <h1 className="acct-hello">{member.businessName}</h1>
      <p className="acct-lede">Signed in as {member.email}</p>
      <div className="acct-grid">
        <div className="acct-tile">
          <h2>Your services and invoices</h2>
          <p>Your active services, invoices and billing will show here. We&rsquo;re adding them now.</p>
        </div>
        <div className="acct-tile">
          <h2>Need something?</h2>
          <p>
            Email <a href="mailto:info@tomorrowstechai.com">info@tomorrowstechai.com</a> or call (254) 563-2130 and
            we&rsquo;ll take care of it.
          </p>
        </div>
      </div>
      <form action={portalSignOutAction} style={{ marginTop: 28 }}>
        <button className="acct-link-btn">Sign out</button>
      </form>
    </main>
  );
}
