import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalMember, PASSWORD_MIN } from "@/lib/portal/session";
import { SetPasswordForm } from "../AuthForms";

export const metadata: Metadata = { title: "Choose your password" };
export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const member = await getPortalMember();
  if (!member) redirect("/account/login?link=expired");
  const first = member.status === "invited";
  return (
    <main className="acct-main">
      <section className="acct-card">
        <h1>{first ? "Choose your password" : "Choose a new password"}</h1>
        <p className="acct-sub">
          {first ? (
            <>Welcome, {member.businessName}. Your username is <strong>{member.email}</strong>.</>
          ) : (
            <>Signing in as <strong>{member.email}</strong>.</>
          )}
        </p>
        <SetPasswordForm email={member.email} min={PASSWORD_MIN} />
      </section>
    </main>
  );
}
