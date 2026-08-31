import Link from "next/link";
import type { Metadata } from "next";
import { getIntakeByToken } from "@/lib/intake/service";
import { IntakeWizard } from "@/components/intake/IntakeWizard";
import { IntakeComplete } from "@/components/intake/IntakeComplete";

export const dynamic = "force-dynamic";

// A tokenised page is not for search engines.
export const metadata: Metadata = {
  title: "Website intake",
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

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await getIntakeByToken(token);

  if (loaded === "not_found") {
    return (
      <Shell title="We can’t find that link">
        <p className="itk-lead">
          The link may have been mistyped, or it may belong to an intake that
          was cancelled. Check the most recent email we sent you, or get in
          touch and we&rsquo;ll send a fresh one.
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
          Intake links stay open for 30 days. Nothing you entered is lost —
          ask us for a new link and you&rsquo;ll pick up where you left off.
        </p>
        <Link href="/contact" className="itk-btn itk-btn--primary">
          Ask for a new link &rarr;
        </Link>
      </Shell>
    );
  }

  if (loaded.intake.status === "submitted") {
    return <IntakeComplete intake={loaded.intake} fileCount={loaded.files.length} />;
  }

  return <IntakeWizard token={token} initialIntake={loaded.intake} initialFiles={loaded.files} />;
}
