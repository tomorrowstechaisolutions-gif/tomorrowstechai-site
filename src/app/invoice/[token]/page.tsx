import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BrandMark } from "@/components/BrandMark";
import InvoiceDocument from "@/components/invoice/InvoiceDocument";
import InvoicePayBlock from "@/components/invoice/InvoicePayBlock";
import { getInvoiceByToken, recordInvoiceView } from "@/lib/invoices/service";
import {
  dueTodayCents, formatDate, formatMoney, invoiceSettled, outstandingCents, recurringStartsLater,
} from "@/lib/invoices/pricing";
import { clientIp } from "@/lib/rate-limit";
import { getAdminUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The client's copy.
 *
 * Never indexed and never cached: the URL is a credential, and an invoice
 * that was paid two minutes ago must not render from a stale copy still
 * asking for the money. Nothing here requires an account — the token is the
 * whole of the client's access, and it only ever reaches the service role
 * through src/lib/invoices/service.ts.
 */
export const metadata: Metadata = {
  title: "Your invoice · Tomorrow's Tech AI",
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

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const loaded = await getInvoiceByToken(token);

  if (loaded === "not_found") notFound();

  if (loaded === "not_available") {
    return (
      <Shell title="This invoice is not available">
        <p>
          This link is not open for viewing at the moment. If you were expecting
          to see an invoice here, email{" "}
          <a href="mailto:john@tomorrowstechai.com">john@tomorrowstechai.com</a>{" "}
          and we will sort it out.
        </p>
      </Shell>
    );
  }

  // Telemetry, after the page is known to render. Awaited so the view count is
  // right on this very render, but it can never throw the page away.
  // Not counted when the visitor is a signed-in admin: John checking the
  // client's view (or following an invoice link while viewing as a client)
  // would otherwise be logged as "opened by the client".
  if (!(await getAdminUser())) {
    const headerList = await headers();
    await recordInvoiceView(
      loaded,
      clientIp(new Request("https://x/", { headers: headerList })),
      headerList.get("user-agent")
    );
  }

  const inv = loaded.invoice;
  const outstanding = outstandingCents(inv);
  const paymentFlag = typeof query.payment === "string" ? query.payment : null;
  const money = (cents: number) => formatMoney(cents, inv.currency);

  // A monthly-only invoice has a one-time total of zero. It is still owed:
  // either the first month is charged today, or the card is saved now and the
  // first charge lands on the start date. Reading "nothing outstanding" as
  // "paid" here hid the pay button from a client who had not paid anything.
  const settled = invoiceSettled(inv);
  const dueToday = dueTodayCents(inv);
  const hasRecurring = inv.recurring_cents > 0;
  const startsLater = recurringStartsLater(inv);
  const firstPeriodToday = hasRecurring && !startsLater;
  const per = inv.recurring_interval;

  const canPay = outstanding > 0 || hasRecurring;

  const payment = canPay ? (
    <InvoicePayBlock
      token={inv.public_token}
      buttonLabel={dueToday > 0 ? `Pay ${money(dueToday)}` : `Set up ${per}ly payment`}
      state={settled ? "paid" : paymentFlag === "cancelled" ? "cancelled" : "due"}
      paidNote={
        hasRecurring && inv.total_cents <= 0
          ? `Your ${per}ly payment is set up — thank you. ${money(inv.recurring_cents)} is charged automatically each ${per}.`
          : undefined
      }
      breakdown={[
        ...(inv.total_cents > 0
          ? [{ label: "Invoice total", value: money(inv.total_cents) }]
          : []),
        ...(inv.amount_paid_cents > 0
          ? [{ label: "Already received", value: money(inv.amount_paid_cents) }]
          : []),
        ...(firstPeriodToday
          ? [{ label: `First ${per} of service`, value: money(inv.recurring_cents) }]
          : []),
        { label: "Due today", value: money(dueToday), strong: true },
        ...(hasRecurring
          ? [{
              label: startsLater
                ? `Then every ${per}, starting ${formatDate(inv.recurring_starts_on)}`
                : `Then every ${per}, charged automatically`,
              value: `${money(inv.recurring_cents)}/${per}`,
            }]
          : []),
      ]}
    />
  ) : null;

  return <InvoiceDocument full={loaded} mode="public" payment={payment} />;
}
