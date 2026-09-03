import Link from "next/link";
import type { Metadata } from "next";
import { getRequestByToken, markOpened } from "@/lib/requests/service";
import { ActionChecklist } from "@/components/requests/ActionChecklist";

export const dynamic = "force-dynamic";

// A tokenised page is not for search engines.
export const metadata: Metadata = {
  title: "Something we need from you",
  robots: { index: false, follow: false },
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="itk-page">
      <div className="itk-shell itk-shell--narrow">
        <div className="itk-brandline">Tomorrow&rsquo;s Tech AI</div>
        <h1 className="itk-h1">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export default async function ClientActionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await getRequestByToken(token);

  if (loaded === "not_found" || loaded === "unknown_template") {
    return (
      <Shell title="We can’t find that link">
        <p className="itk-lead">
          The link may have been mistyped, or it may belong to a request that
          has since been cancelled. Check the most recent email we sent you, or
          get in touch and we&rsquo;ll send a fresh one.
        </p>
        <Link href="/contact" className="itk-btn itk-btn--primary">
          Contact us &rarr;
        </Link>
      </Shell>
    );
  }

  if (loaded === "canceled") {
    return (
      <Shell title="Nothing needed here anymore">
        <p className="itk-lead">
          We asked for this at one point and then it stopped being necessary.
          Nothing is waiting on you. If that doesn&rsquo;t sound right, give us
          a shout and we&rsquo;ll sort it out.
        </p>
        <Link href="/contact" className="itk-btn itk-btn--primary">
          Contact us &rarr;
        </Link>
      </Shell>
    );
  }

  if (loaded === "expired") {
    return (
      <Shell title="That link has expired">
        <p className="itk-lead">
          These links stay open for 60 days. Nothing you entered is lost — ask
          us for a new one and you&rsquo;ll pick up exactly where you left off.
        </p>
        <Link href="/contact" className="itk-btn itk-btn--primary">
          Ask for a new link &rarr;
        </Link>
      </Shell>
    );
  }

  // Opening the page IS the read receipt. It is the only signal that separates
  // "they haven't seen it" from "they've seen it and haven't done it", and
  // those two need completely different follow-ups.
  const request = await markOpened(loaded.request);

  return (
    <ActionChecklist token={token} request={request} template={loaded.template} />
  );
}
