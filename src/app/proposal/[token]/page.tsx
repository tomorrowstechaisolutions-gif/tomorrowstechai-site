import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BrandMark } from "@/components/BrandMark";
import ProposalDocument from "@/components/proposal/ProposalDocument";
import AcceptForm from "@/components/proposal/AcceptForm";
import { getProposalByToken, recordProposalView } from "@/lib/proposals/service";
import { clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The client's copy.
 *
 * Never indexed and never cached: the URL is a credential, and a proposal
 * that changed status two minutes ago must not render from a stale copy.
 *
 * There is no payment step. Signing records agreement to the scope and the
 * price; the invoice that follows the work is what asks for money.
 * Nothing on this page requires an account — the token is the whole of the
 * client's access, and it only ever reaches the service role through
 * src/lib/proposals/service.ts.
 */
export const metadata: Metadata = {
  title: "Your proposal · Tomorrow's Tech AI",
  robots: { index: false, follow: false, nocache: true },
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pr-doc">
      <header className="pr-nav">
        <a href="https://tomorrowstechai.com" className="pr-brand">
          <BrandMark size={34} />
          <span>TOMORROW&rsquo;S <b>TECH AI</b></span>
        </a>
      </header>
      <main className="pr-main">
        <section className="pr-block pr-message">
          <h1>{title}</h1>
          {children}
        </section>
      </main>
    </div>
  );
}

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await getProposalByToken(token);

  if (loaded === "not_found") notFound();

  if (loaded === "expired") {
    return (
      <Shell title="This proposal has expired">
        <p>
          The date this proposal was open until has passed, so the pricing on
          it is no longer current. Email{" "}
          <a href="mailto:john@tomorrowstechai.com">john@tomorrowstechai.com</a>{" "}
          and we will send you a fresh copy straight away.
        </p>
      </Shell>
    );
  }

  if (loaded === "not_available") {
    return (
      <Shell title="This proposal is not available">
        <p>
          This link is not open for viewing at the moment. If you were expecting
          to see a proposal here, email{" "}
          <a href="mailto:john@tomorrowstechai.com">john@tomorrowstechai.com</a>{" "}
          and we will sort it out.
        </p>
      </Shell>
    );
  }

  // Telemetry, after the page is known to render. Awaited so the status is
  // right on this very render, but it can never throw the page away.
  const headerList = await headers();
  await recordProposalView(
    loaded,
    clientIp(new Request("https://x/", { headers: headerList })),
    headerList.get("user-agent")
  );

  const p = loaded.proposal;

  const acceptance = loaded.signature ? null : (
    <AcceptForm
      token={p.public_token}
      defaultName={p.client_contact_name ?? ""}
      defaultEmail={p.client_email ?? ""}
      defaultTitle={p.client_title ?? ""}
    />
  );

  return (
    <ProposalDocument full={loaded} mode="public" acceptance={acceptance} />
  );
}
