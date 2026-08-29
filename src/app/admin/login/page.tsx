import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div className="ad-login">
      <div className="ad-login-card">
        <div className="ad-login-brand">Tomorrow&rsquo;s Tech AI</div>
        <h1 className="ad-login-title">Admin Center</h1>
        <p className="ad-login-sub">
          Signing in is not enough on its own — your account also has to be in
          the admin list.
        </p>
        {/* LoginForm reads ?next= via useSearchParams, so it needs a
            boundary or the whole page bails out of prerendering. */}
        <Suspense fallback={<p className="ad-empty">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
