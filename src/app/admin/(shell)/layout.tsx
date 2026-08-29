import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase/server";
import { signOutAction } from "../actions";
import { supabaseConfigured } from "@/lib/supabase/admin";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/marketing/campaigns/business-launch", label: "$399 Business Launch" },
  { href: "/admin/marketing/ads", label: "Ad Studio" },
  { href: "/admin/marketing/spend", label: "Ad spend" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!supabaseConfigured()) {
    return (
      <div className="ad-login">
        <div className="ad-login-card">
          <h1 className="ad-login-title">Admin Center is not configured</h1>
          <p className="ad-login-sub">
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>, then redeploy.
          </p>
        </div>
      </div>
    );
  }

  const session = await getAdminUser();

  // Signed in but not on the admin list. RLS already returns nothing to this
  // account; this just says so out loud instead of showing empty screens.
  if (!session) redirect("/admin/login?denied=1");

  return (
    <div className="ad-shell">
      <aside className="ad-side">
        <div className="ad-side-brand">
          <Link href="/">Tomorrow&rsquo;s Tech AI</Link>
          <span>Admin Center</span>
        </div>
        <nav className="ad-nav">
          <span className="ad-nav-head">Pipeline</span>
          {NAV.slice(0, 2).map((n) => (
            <Link key={n.href} href={n.href} className="ad-nav-link">
              {n.label}
            </Link>
          ))}
          <span className="ad-nav-head">Marketing</span>
          {NAV.slice(2, 5).map((n) => (
            <Link key={n.href} href={n.href} className="ad-nav-link">
              {n.label}
            </Link>
          ))}
          <span className="ad-nav-head">System</span>
          {NAV.slice(5).map((n) => (
            <Link key={n.href} href={n.href} className="ad-nav-link">
              {n.label}
            </Link>
          ))}
        </nav>
        <form action={signOutAction} className="ad-side-foot">
          <span className="ad-side-user">{session.admin.email}</span>
          <button type="submit" className="ad-btn ghost sm">
            Sign out
          </button>
        </form>
      </aside>
      <main className="ad-main">{children}</main>
    </div>
  );
}
