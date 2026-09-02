import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BrandMark } from "@/components/BrandMark";
import ProposalDocument from "@/components/proposal/ProposalDocument";
import AcceptForm from "@/components/proposal/AcceptForm";
import PaymentBlock from "@/components/proposal/PaymentBlock";
import { getProposalByToken, recordProposalView } from "@/lib/proposals/service";
import { amountDueAtSignature } from "@/lib/proposals/config";
import { formatMoney } from "@/lib/proposals/pricing";
import { clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The client's copy.
 *
 * Never indexed and never cached: the URL is a credential, and a proposal
 * that changed status two minutes ago must not render from a stale copy.
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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
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
  const dueNow = amountDueAtSignature(p);
  const outstanding = Math.max(0, dueNow - p.amount_paid_cents);
  const paymentFlag = typeof query.payment === "string" ? query.payment : null;

  const acceptance = loaded.signature ? null : (
    <AcceptForm
      token={p.public_token}
      defaultName={p.client_contact_name ?? ""}
      defaultEmail={p.client_email ?? ""}
      defaultTitle={p.client_title ?? ""}
      dueLabel={dueNow > 0 ? `${formatMoney(dueNow, p.currency)} due today` : ""}
    />
  );

  const payment =
    loaded.signature && dueNow > 0 ? (
      <PaymentBlock
        token={p.public_token}
        dueLabel={formatMoney(outstanding > 0 ? outstanding : dueNow, p.currency)}
        state={
          p.status === "paid" || p.status === "converted" || outstanding === 0
            ? "paid"
            : paymentFlag === "cancelled"
              ? "cancelled"
              : "due"
        }
        breakdown={[
          { label: "Website build", value: formatMoney(p.total_cents, p.currency) },
          ...(p.recurring_price_cents > 0
            ? [{
                label: "Hosting & management",
                value: `${formatMoney(p.recurring_price_cents, p.currency)}/${p.recurring_interval}`,
              }]
            : []),
          { label: "Due today", value: formatMoney(outstanding, p.currency), strong: true },
          ...(p.total_cents - dueNow > 0
            ? [{
                label: "Remaining balance",
                value: formatMoney(p.total_cents - dueNow, p.currency),
              }]
            : []),
        ]}
      />
    ) : null;

  return (
    <ProposalDocument
      full={loaded}
      mode="public"
      acceptance={acceptance}
      payment={payment}
    />
  );
}
