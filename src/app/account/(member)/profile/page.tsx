import type { Metadata } from "next";
import Link from "next/link";
import { getPortalViewer } from "@/lib/portal/session";
import { memberProfile } from "@/lib/portal/data";
import { ProfileForm } from "../MemberForms";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const member = (await getPortalViewer())!;
  const profile = await memberProfile(member.customerId);
  return (
    <>
      <section className="acct-section">
        <h2>Your details</h2>
        <ProfileForm profile={profile} />
      </section>
      <section className="acct-section">
        <h2>Sign-in</h2>
        <p className="acct-faint">
          Your username is <strong>{member.email}</strong>. To use a different email, <Link href="/account/help">send us a request</Link> and we&rsquo;ll switch it.
        </p>
        <p><Link href="/account/set-password" className="acct-link-btn">Change password</Link></p>
      </section>
    </>
  );
}
