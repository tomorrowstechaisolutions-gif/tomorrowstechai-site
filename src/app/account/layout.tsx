import type { Metadata } from "next";
import Link from "next/link";
import "./account.css";

export const metadata: Metadata = {
  title: { default: "Member account", template: "%s · Member account" },
  robots: { index: false, follow: false },
};

/** The member portal shell. The site header/footer are hidden here (ChromeGate). */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
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
        Questions? Email <a href="mailto:info@tomorrowstechai.com">info@tomorrowstechai.com</a> or call (254) 563-2130.
      </footer>
    </div>
  );
}
