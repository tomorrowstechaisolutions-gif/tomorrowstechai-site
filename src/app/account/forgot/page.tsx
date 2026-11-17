import type { Metadata } from "next";
import { ForgotForm } from "../AuthForms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <main className="acct-main">
      <section className="acct-card">
        <h1>Reset your password</h1>
        <p className="acct-sub">Enter the email you sign in with and we&rsquo;ll send a link to choose a new password.</p>
        <ForgotForm />
      </section>
    </main>
  );
}
