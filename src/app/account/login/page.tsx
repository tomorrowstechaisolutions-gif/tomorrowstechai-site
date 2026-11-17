import type { Metadata } from "next";
import { LoginForm } from "../AuthForms";
import type { FormState } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

const BANNERS: Record<string, FormState> = {
  expired: { error: "That link has expired or was already used. Sign in, or use \"Forgot password\" for a new one." },
  invalid: { error: "That link isn't valid. Sign in, or use \"Forgot password\" for a new one." },
  signedout: { notice: "You're signed out." },
  denied: { error: "That login doesn't have a member account. Sign in with the email we invited." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const banner = q.link ? BANNERS[q.link] : q.signedout ? BANNERS.signedout : q.denied ? BANNERS.denied : undefined;
  const next = q.next && q.next.startsWith("/account") ? q.next : "/account";
  return (
    <main className="acct-main">
      <section className="acct-card">
        <h1>Sign in</h1>
        <p className="acct-sub">Your services, invoices and billing with Tomorrow&rsquo;s Tech AI.</p>
        <LoginForm next={next} banner={banner} />
        <p className="acct-help">
          Member accounts are by invitation. If you&rsquo;re a client and don&rsquo;t have one yet, email{" "}
          <a href="mailto:info@tomorrowstechai.com">info@tomorrowstechai.com</a>.
        </p>
      </section>
    </main>
  );
}
