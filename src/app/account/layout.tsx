import type { Metadata } from "next";
import Link from "next/link";
import "./account.css";
import { businessProfile } from "@/lib/settings/profile-store";

export const metadata: Metadata = {
  title: { default: "Member account", template: "%s · Member account" },
  robots: { index: false, follow: false },
};

/** The member portal shell. The site header/footer are hidden here (ChromeGate). */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const profile = await businessProfile();
  return (
    <div className="acct">
      <header className="acct-top">
        <Link href="/account" className="acct-brand">
          Tomorrow&rsquo;s Tech AI <small>Member account</small>
        </Link>
        <Link href="/" className="acct-link-btn">Main site</Link>
      </header>
      {children}
      <footer className="acct-foot">
        Questions? Email <a href={profile.emailHref}>{profile.email}</a> or call {profile.phone}.
      </footer>
    </div>
  );
}
