import type { Metadata } from "next";
import { getPortalViewer } from "@/lib/portal/session";
import { memberRequests, shortDate } from "@/lib/portal/data";
import { HelpForm } from "../MemberForms";
import { businessProfile } from "@/lib/settings/profile-store";

export const metadata: Metadata = { title: "Get help" };

const CAT: Record<string, string> = { question: "Question", change: "Change", problem: "Problem", billing: "Billing", cancel: "Cancellation", new_service: "New service" };

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ about?: string; category?: string }> }) {
  const member = (await getPortalViewer())!;
  const profile = await businessProfile();
  const [{ about, category }, requests] = await Promise.all([searchParams, memberRequests(member.customerId)]);
  return (
    <>
      <section className="acct-section">
        <h2>Send us a request</h2>
        <p className="acct-faint">Questions, changes, problems, billing or cancellations. It comes straight to us, and we reply by email, usually within one business day. For anything urgent, call {profile.phone}.</p>
        <HelpForm about={about?.slice(0, 120)} category={category} />
      </section>
      {requests.length ? (
        <section className="acct-section">
          <h2>Your requests</h2>
          <ul className="acct-list">
            {requests.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.subject}</strong>
                  <span className="acct-faint">{CAT[r.category] ?? r.category} · {shortDate(r.createdAt)}</span>
                </div>
                <span className={`acct-chip ${r.status === "open" ? "info" : "muted"}`}>{r.status === "open" ? "Open" : "Closed"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
