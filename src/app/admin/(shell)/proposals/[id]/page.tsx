import type { Metadata } from "next";
import { providerStatuses } from "@/lib/meetings/providers";
import { meetingsForRecord, resolveContact } from "@/lib/meetings/queries";
import { scheduleMeetingAction } from "@/app/admin/meeting-actions";
import ScheduleMeetingButton from "@/components/admin/cc/meetings/ScheduleMeetingButton";
import MeetingsPanel from "@/components/admin/cc/meetings/MeetingsPanel";
import { BUSINESS_TIMEZONE, BUSINESS_TIMEZONE_LABEL } from "@/lib/calendar/config";
import { chicagoDate } from "@/lib/time/chicago";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getProposalById, proposalUrl, isExpired } from "@/lib/proposals/service";
import { loadProposalTimeline } from "@/lib/proposals/queries";
import {
  PAYMENT_MODE_LABELS, STATUS_LABELS, STATUS_TONE, amountDueAtSignature,
} from "@/lib/proposals/config";
import { formatMoney } from "@/lib/proposals/pricing";
import {
  convertProposalToProjectAction, duplicateProposalAction, markProposalSentAction,
  sendProposalAction, setProposalStatusAction,
} from "@/app/admin/proposal-actions";
import { createInvoiceFromProposalAction } from "@/app/admin/invoice-actions";
import { invoicesForProposal } from "@/lib/invoices/queries";
import {
  STATUS_LABELS as INVOICE_STATUS_LABELS,
  STATUS_TONE as INVOICE_STATUS_TONE,
} from "@/lib/invoices/config";
import CopyLink from "@/components/admin/cc/CopyLink";
import { DASH, ago } from "@/components/admin/cc/format";
import {
  IconAlert, IconCheck, IconDollar, IconFile, IconLayers,
  IconPen, IconPulse, IconSend, IconUsers,
} from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposal" };

const EVENT_TONE: Record<string, string> = {
  signed: "s-ok", paid: "s-ok", converted_to_project: "s-ok",
  accepted: "s-ok", declined: "s-error", expired: "s-error",
  cancelled: "s-warning", viewed: "s-info", sent: "s-info", resent: "s-info",
};

function stamp(iso: string | null): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const full = await getProposalById(supabase, id);
  if (!full) notFound();

  const timeline = await loadProposalTimeline(supabase, id);
  const invoices = await invoicesForProposal(supabase, id);
  const { proposal: p, items, agreement, signature } = full;
  const { data: linkedJob } = p.job_id
    ? await supabase.from("jobs").select("engagement_status").eq("id", p.job_id).maybeSingle()
    : { data: null };

  const money = (cents: number) => formatMoney(cents, p.currency);
  const dueNow = amountDueAtSignature(p);
  const outstanding = Math.max(0, dueNow - p.amount_paid_cents);
  const publicLink = proposalUrl(p.public_token);

  // Schedule Proposal Review — the type, the title and the linked proposal
  // are all decided here, so the form opens already filled in.
  const [meetings, meetingContact, providers] = await Promise.all([
    meetingsForRecord(supabase, "proposal_id", p.id),
    resolveContact(supabase, { proposalId: p.id }),
    providerStatuses(),
  ]);

  const scheduleButton = meetingContact ? (
    <ScheduleMeetingButton
      contact={meetingContact}
      providers={providers}
      action={scheduleMeetingAction}
      defaultDate={chicagoDate(new Date(Date.now() + 86_400_000))}
      defaultType="proposal_review"
      defaultTitle={`Proposal Review — ${p.client_business_name || p.client_contact_name || p.proposal_number}`}
      proposalId={p.id}
      returnTo={`/admin/proposals/${p.id}`}
      label="Schedule Proposal Review"
      timezone={BUSINESS_TIMEZONE}
      timezoneLabel={BUSINESS_TIMEZONE_LABEL}
    />
  ) : null;
  const of = (type: string) => items.filter((item) => item.item_type === type);

  const readyToConvert =
    Boolean(p.signed_at) &&
    (!p.job_id || linkedJob?.engagement_status === "pre_contract") &&
    (dueNow === 0 || p.amount_paid_cents >= dueNow);

  const facts: { label: string; value: string }[] = [
    { label: "Client", value: p.client_business_name || DASH },
    { label: "Contact", value: p.client_contact_name || DASH },
    { label: "Email", value: p.client_email || DASH },
    { label: "Phone", value: p.client_phone || DASH },
    { label: "Package", value: p.package_name || DASH },
    { label: "Owner", value: p.owner || DASH },
    { label: "Payment terms", value: PAYMENT_MODE_LABELS[p.payment_mode] },
    { label: "Turnaround", value: p.turnaround_note || DASH },
    {
      label: "Revisions",
      value: p.revision_limit === null ? DASH : `${p.revision_limit} round${p.revision_limit === 1 ? "" : "s"}`,
    },
    { label: "Open until", value: p.valid_until ? stamp(`${p.valid_until}T12:00:00Z`) : DASH },
    { label: "Created", value: stamp(p.created_at) },
    { label: "Sent", value: stamp(p.sent_at) },
    { label: "First viewed", value: stamp(p.first_viewed_at) },
    { label: "Views", value: String(p.view_count) },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>
            {p.proposal_number}
            {" "}
            <span className={`cc-chip ${STATUS_TONE[p.status]}`}>{STATUS_LABELS[p.status]}</span>
            {isExpired(p) ? <span className="cc-chip t-risk"> Past its date</span> : null}
          </h1>
          <p>
            {p.title} · {p.client_business_name || p.client_contact_name || "no client recorded"} ·{" "}
            {money(p.total_cents)} one-time
            {p.recurring_price_cents > 0
              ? ` · ${money(p.recurring_price_cents)}/${p.recurring_interval}`
              : ""}
          </p>
        </div>
        <Link href="/admin/proposals" className="cc-btn">All proposals</Link>
      </div>

      {/* ── Actions ───────────────────────────────────────────────── */}
      <div className="cc-board">
        <section className="cc-panel cc-s12">
          <div className="cc-panel-body pr-actions">
            <Link href={`/admin/proposals/${p.id}/preview`} className="cc-btn">Preview</Link>
            {p.locked_at ? null : (
              <Link href={`/admin/proposals/${p.id}/edit`} className="cc-btn">Edit</Link>
            )}
            <CopyLink url={publicLink} label="Copy client link" />
            {scheduleButton}
            <a href={publicLink} target="_blank" rel="noreferrer" className="cc-btn">Open client view</a>

            <form action={sendProposalAction} className="pr-sendform">
              <input type="hidden" name="proposal_id" value={p.id} />
              <input
                className="cc-input" name="note" maxLength={2000}
                placeholder="Optional note to include in the email"
              />
              <button type="submit" className="cc-btn primary">
                <IconSend size={13} /> {p.sent_at ? "Send again" : "Send to client"}
              </button>
            </form>

            {/* The other way a document goes out. Messenger, a text, in
                person — all real channels for this business, and all of them
                have to leave the proposal saying Sent rather than Draft. */}
            <form action={markProposalSentAction} className="pr-sendform">
              <input type="hidden" name="proposal_id" value={p.id} />
              <input
                className="cc-input" name="how" maxLength={200}
                placeholder="How you sent it — Messenger, text, in person"
              />
              <button type="submit" className="cc-btn">
                Mark as sent — I&rsquo;ll send the link myself
              </button>
            </form>

            <form action={duplicateProposalAction}>
              <input type="hidden" name="proposal_id" value={p.id} />
              <button type="submit" className="cc-btn">Duplicate</button>
            </form>

            {p.locked_at ? (
              <>
                <form action={duplicateProposalAction}>
                  <input type="hidden" name="proposal_id" value={p.id} />
                  <input type="hidden" name="as_revision" value="1" />
                  <button type="submit" className="cc-btn">Revise</button>
                </form>
                <form action={duplicateProposalAction}>
                  <input type="hidden" name="proposal_id" value={p.id} />
                  <input type="hidden" name="as_change_order" value="1" />
                  <button type="submit" className="cc-btn">Change order</button>
                </form>
              </>
            ) : null}

            {p.signed_document_path ? (
              <a href={`/admin/proposals/${p.id}/document`} className="cc-btn" target="_blank" rel="noreferrer">
                Download signed copy
              </a>
            ) : null}

            {readyToConvert ? (
              <form action={convertProposalToProjectAction}>
                <input type="hidden" name="proposal_id" value={p.id} />
                <button type="submit" className="cc-btn primary">
                  {p.job_id ? "Promote signed project" : "Create project"}
                </button>
              </form>
            ) : null}

            {p.job_id ? (
              <Link href={`/admin/jobs/${p.job_id}`} className="cc-btn">Open project</Link>
            ) : null}

            {["draft", "sent", "viewed", "accepted"].includes(p.status) ? (
              <form action={setProposalStatusAction}>
                <input type="hidden" name="proposal_id" value={p.id} />
                <input type="hidden" name="status" value="cancelled" />
                <button type="submit" className="cc-btn">Cancel</button>
              </form>
            ) : null}

            {p.status === "payment_pending" ? (
              <form action={setProposalStatusAction}>
                <input type="hidden" name="proposal_id" value={p.id} />
                <input type="hidden" name="status" value="paid" />
                <button type="submit" className="cc-btn" title="Records payment on the proposal only — revenue stays Stripe-sourced">
                  Mark paid by hand
                </button>
              </form>
            ) : null}
          </div>
        </section>

        {/* ── Overview ────────────────────────────────────────────── */}
        <section className="cc-panel cc-s6">
          <div className="cc-panel-head"><IconUsers size={15} /><h2>Overview</h2></div>
          <div className="cc-panel-body">
            <dl className="pr-facts-list">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            {p.summary ? <p className="cc-note">{p.summary}</p> : null}
            {p.notes_internal ? (
              <>
                <h3 className="cc-label" style={{ marginTop: 14 }}>Internal notes</h3>
                <p className="cc-note" style={{ marginTop: 4 }}>{p.notes_internal}</p>
              </>
            ) : null}
            <div className="cc-rowacts" style={{ marginTop: 12 }}>
              {p.lead_id ? <Link href={`/admin/leads/${p.lead_id}`} className="cc-btn">Lead record</Link> : null}
              {p.deal_id ? <Link href="/admin/pipeline" className="cc-btn">Pipeline</Link> : null}
              {p.customer_id ? <Link href={`/admin/clients/${p.customer_id}`} className="cc-btn">Client record</Link> : null}
            </div>
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────────── */}
        <section className="cc-panel cc-s6">
          <div className="cc-panel-head"><IconDollar size={15} /><h2>Pricing</h2></div>
          <div className="cc-panel-body">
            <ul className="pr-paylines">
              <li><span>Subtotal</span><b>{money(p.subtotal_cents)}</b></li>
              {p.discount_amount_cents > 0 ? (
                <li><span>Discount</span><b>−{money(p.discount_amount_cents)}</b></li>
              ) : null}
              <li className="is-strong"><span>One-time total</span><b>{money(p.total_cents)}</b></li>
              <li>
                <span>Hosting</span>
                <b>{p.recurring_price_cents > 0 ? `${money(p.recurring_price_cents)}/${p.recurring_interval}` : DASH}</b>
              </li>
              <li><span>Due at signature</span><b>{dueNow > 0 ? money(dueNow) : "Nothing"}</b></li>
              <li><span>Collected</span><b>{money(p.amount_paid_cents)}</b></li>
              {outstanding > 0 ? (
                <li className="is-strong"><span>Outstanding now</span><b>{money(outstanding)}</b></li>
              ) : null}
            </ul>
            {p.invoice_id ? (
              <p className="cc-note">
                Invoice {p.invoice_id.slice(0, 8)} raised against this proposal.
                {p.stripe_session_id ? " A Stripe checkout session is attached." : ""}
              </p>
            ) : (
              <p className="cc-note">
                No invoice yet. One is raised automatically the moment the client
                signs, if anything is due at signature.
              </p>
            )}
          </div>
        </section>

        {/* ── Scope ───────────────────────────────────────────────── */}
        <section className="cc-panel cc-s6">
          <div className="cc-panel-head"><IconLayers size={15} /><h2>Scope</h2></div>
          <div className="cc-panel-body">
            {items.length === 0 ? (
              <p className="cc-note" style={{ marginTop: 0 }}>No lines on this proposal yet.</p>
            ) : (
              [
                ["Scope of work", of("scope")],
                ["Deliverables", of("deliverable")],
                ["Pages", of("page")],
                ["Integrations", of("integration")],
                ["Add-ons", of("addon")],
                ["Not included", of("exclusion")],
                ["Client provides", of("client_responsibility")],
                ["We provide", of("provider_responsibility")],
              ].map(([label, rows]) => {
                const list = rows as typeof items;
                if (list.length === 0) return null;
                return (
                  <div key={label as string} style={{ marginBottom: 12 }}>
                    <h3 className="cc-label">{label as string}</h3>
                    <ul className="pr-adminlist">
                      {list.map((row) => (
                        <li key={row.id}>
                          {row.title}
                          {row.is_billable && row.total_price_cents > 0 ? (
                            <b> {money(row.total_price_cents)}{row.is_optional ? " (optional)" : ""}</b>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ── Agreement & signature ───────────────────────────────── */}
        <section className="cc-panel cc-s6">
          <div className="cc-panel-head"><IconPen size={15} /><h2>Agreement &amp; signature</h2></div>
          <div className="cc-panel-body">
            <dl className="pr-facts-list">
              <div>
                <dt>Agreement version</dt>
                <dd>{agreement ? `v${agreement.version} — ${agreement.title}` : "None attached"}</dd>
              </div>
              {signature ? (
                <>
                  <div><dt>Signed by</dt><dd>{signature.signer_name}</dd></div>
                  <div><dt>Email</dt><dd>{signature.signer_email}</dd></div>
                  <div><dt>Title</dt><dd>{signature.signer_title || DASH}</dd></div>
                  <div><dt>Signed at</dt><dd>{stamp(signature.signed_at)}</dd></div>
                  <div><dt>Signed under</dt><dd>v{signature.agreement_version}</dd></div>
                  <div><dt>Method</dt><dd>{signature.signature_type === "drawn" ? "Drawn" : "Typed"}</dd></div>
                  <div><dt>IP address</dt><dd>{signature.ip_address || "not recorded"}</dd></div>
                  <div>
                    <dt>Document digest</dt>
                    <dd className="pr-hash">{signature.document_hash || "not recorded"}</dd>
                  </div>
                </>
              ) : null}
            </dl>

            {signature ? (
              <>
                <p className="cc-note">
                  All four confirmations were ticked
                  {" "}
                  {[
                    signature.accepted_scope, signature.accepted_pricing,
                    signature.accepted_ownership, signature.accepted_agreement,
                  ].every(Boolean) ? "and recorded." : "— CHECK THIS RECORD."}
                  {" "}
                  The document is frozen and cannot be edited.
                </p>
                <Link href="/admin/settings/agreements" className="cc-btn">Manage agreement wording</Link>
              </>
            ) : (
              <p className="cc-note" style={{ marginTop: 0 }}>
                Not signed yet. The client signs on their own link; nobody can
                sign on their behalf from here.
              </p>
            )}
          </div>
        </section>

        {/* ── Invoicing ───────────────────────────────────────────── */}
        <section className="cc-panel cc-s12">
          <div className="cc-panel-head">
            <IconDollar size={15} />
            <h2>Invoicing</h2>
            <span className="cc-sub">
              {invoices.length === 0
                ? "Nothing raised for this proposal yet"
                : `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="cc-panel-body">
            <p className="cc-note" style={{ marginTop: 0 }}>
              The proposal is what both parties agreed. The invoice is the bill
              for having done it, and it comes last — usually after the work,
              sometimes up front, occasionally both. Raising it here copies the
              client, the price and the hosting line across, and records
              anything already collected at signature so nobody is asked for
              the same money twice.
            </p>

            {invoices.length === 0 ? (
              <form action={createInvoiceFromProposalAction} className="pr-actions">
                <input type="hidden" name="proposal_id" value={p.id} />
                <button type="submit" className="cc-btn primary">
                  <IconDollar size={13} /> Raise the invoice for this proposal
                </button>
              </form>
            ) : (
              <div className="cc-scroll">
                <table className="cc-table dense">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Outstanding</th>
                      <th>Status</th>
                      <th>Due</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/admin/invoices/${row.id}`} className="cc-strong">
                            {row.number}
                          </Link>
                        </td>
                        <td className="num">{formatMoney(row.totalCents, row.currency)}</td>
                        <td className="num">{formatMoney(row.paidCents, row.currency)}</td>
                        <td className="num">{formatMoney(row.outstandingCents, row.currency)}</td>
                        <td>
                          <span className={`cc-chip ${INVOICE_STATUS_TONE[row.status]}`}>
                            {INVOICE_STATUS_LABELS[row.status]}
                          </span>
                          {row.overdue ? (
                            <>
                              {" "}
                              <span className="cc-chip t-risk">{row.daysLate}d late</span>
                            </>
                          ) : null}
                        </td>
                        <td>{row.dueDate ? stamp(`${row.dueDate}T12:00:00Z`) : DASH}</td>
                        <td>
                          <Link href={`/admin/invoices/${row.id}`} className="cc-btn">Open</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Activity ────────────────────────────────────────────── */}
        <section className="cc-panel cc-s12">
          <div className="cc-panel-head">
            <IconPulse size={15} />
            <h2>Activity</h2>
            <span className="cc-sub">{timeline.length} recorded events</span>
          </div>
          <div className="cc-panel-body">
            {timeline.length === 0 ? (
              <p className="cc-note" style={{ marginTop: 0 }}>Nothing recorded yet.</p>
            ) : (
              <ol className="pr-timeline">
                {timeline.map((event) => (
                  <li key={event.id}>
                    <span className={`cc-dot ${EVENT_TONE[event.event_type] ?? "s-info"}`} />
                    <div>
                      <b>{event.event_type.replace(/_/g, " ")}</b>
                      {event.body ? <span>{event.body}</span> : null}
                      <i>
                        {stamp(event.created_at)} · {ago(event.created_at)}
                        {event.actor ? ` · ${event.actor}` : ""}
                        {event.ip_address ? ` · ${event.ip_address}` : ""}
                      </i>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
        <div className="cc-s12">
          <MeetingsPanel
            data={meetings}
            heading="Meetings about this proposal"
            scheduleButton={scheduleButton}
            emptyText="No review booked. Scheduling one from here links the meeting to this proposal, so the notes end up in the right place."
          />
        </div>

      </div>

      {!agreement ? (
        <div className="cc-error">
          <IconAlert size={15} />
          <span>
            This proposal has no agreement version attached, so it cannot be
            signed. Publish one under Settings → Agreements and save the
            proposal again.
          </span>
        </div>
      ) : null}

      {p.job_id ? (
        <p className="cc-note">
          <IconCheck size={13} /> Converted into a project on {stamp(p.converted_at)}.
        </p>
      ) : null}

      {items.length === 0 && p.status === "draft" ? (
        <p className="cc-note">
          <IconFile size={13} /> This draft has no scope lines yet — open Edit
          and load a package template.
        </p>
      ) : null}
    </>
  );
}
