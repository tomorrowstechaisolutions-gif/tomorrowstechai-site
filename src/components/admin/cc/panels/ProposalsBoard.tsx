import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadProposalWorkspace, type ProposalRow } from "@/lib/proposals/queries";
import { saveProposalAction, syncKeyKonnectConversationAction } from "@/app/admin/proposal-actions";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import { DASH, money, shortDate } from "../format";
import {
  IconArrowRight,
  IconCheck,
  IconClock,
  IconDollar,
  IconFile,
  IconInbox,
  IconLink,
  IconSend,
  IconUsers,
} from "../Icons";

const STATUS_TONE: Record<string, string> = {
  draft: "t-muted", sent: "t-info", paid: "t-ok", expired: "t-warn",
  void: "t-risk", refunded: "t-warn", proposal: "t-info",
  negotiation: "t-warn", won: "t-ok", lost: "t-risk", on_hold: "t-muted",
};

function Kpis({ data }: { data: Awaited<ReturnType<typeof loadProposalWorkspace>> }) {
  const cards = [
    { label: "Active proposals", value: String(data.kpis.active), foot: "Still winnable", icon: IconFile },
    { label: "Drafts", value: String(data.kpis.drafts), foot: "Not sent yet", icon: IconInbox },
    { label: "Sent", value: String(data.kpis.sent), foot: "Waiting on a decision", icon: IconSend },
    { label: "Needs pricing", value: String(data.kpis.awaitingPrice), foot: "Scope before dollars", icon: IconClock },
    { label: "Proposal value", value: data.kpis.pipelineCents ? money(data.kpis.pipelineCents) : DASH, foot: "Recorded active value", icon: IconDollar },
    { label: "Won", value: String(data.kpis.won), foot: "Accepted or paid", icon: IconCheck },
  ];

  return (
    <div className="cc-kpis">
      {cards.map(({ label, value, foot, icon: Icon }) => (
        <div className="cc-kpi" key={label}>
          <div className="cc-kpi-top"><span className="cc-kpi-icon"><Icon size={14} /></span><span className="cc-kpi-label">{label}</span></div>
          <span className="cc-kpi-value">{value}</span>
          <div className="cc-kpi-foot"><span>{foot}</span></div>
        </div>
      ))}
    </div>
  );
}

function Progress({ proposal }: { proposal: ProposalRow }) {
  const done = proposal.steps.filter((step) => step.state === "done").length;
  const percentage = Math.round((done / proposal.steps.length) * 100);
  return (
    <div className="proposal-progress">
      <div className="proposal-progress-head">
        <div><span className="proposal-eyebrow">Close plan</span><strong>{percentage}% through the proposal workflow</strong></div>
        <span className="cc-chip t-info">{done} of {proposal.steps.length} verified</span>
      </div>
      <div className="proposal-meter" aria-label={`${percentage}% complete`}><span style={{ width: `${percentage}%` }} /></div>
      <ol className="proposal-steps">
        {proposal.steps.map((step, index) => (
          <li className={`is-${step.state}`} key={step.label}>
            <span className="proposal-step-mark">{step.state === "done" ? <IconCheck size={13} /> : index + 1}</span>
            <div><strong>{step.label}</strong><p>{step.detail}</p></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function KeyKonnectBrief({ proposal }: { proposal: ProposalRow }) {
  return (
    <section className="proposal-spotlight">
      <div className="proposal-spotlight-top">
        <div>
          <span className="proposal-eyebrow">First live opportunity · Facebook</span>
          <h2>The Key Konnect</h2>
          <p>Cory Simek · Owner &amp; visionary · Killeen, Texas</p>
        </div>
        <div className="proposal-spotlight-status">
          <span className={`cc-chip ${STATUS_TONE[proposal.invoiceStatus ?? proposal.stage] ?? "t-muted"}`}>
            {proposal.invoiceStatus === "paid" ? "Paid" : "Proposal in progress"}
          </span>
          <span className="proposal-value">{proposal.valueCents ? money(proposal.valueCents) : "Price not set"}</span>
        </div>
      </div>

      <div className="proposal-facts">
        <div><span>Need</span><strong>Custom website + CRM</strong><p>A modern brand site with a music-led experience and the business tools behind it.</p></div>
        <div><span>Creative direction</span><strong>“13 Years Old”</strong><p>Cory selected the song and confirmed he has the MP3.</p></div>
        <div><span>Waiting on</span><strong>MP3, logo, feedback</strong><p>Those assets unlock final scope, pricing, and the formal proposal.</p></div>
      </div>

      <div className="proposal-actions-row">
        {proposal.previewUrl ? (
          <a className="cc-btn primary" href={proposal.previewUrl} target="_blank" rel="noreferrer"><IconLink size={13} /> Open working preview</a>
        ) : null}
        {proposal.leadId ? <Link className="cc-btn" href={`/admin/leads/${proposal.leadId}`}><IconUsers size={13} /> Open Cory’s CRM record</Link> : null}
        {proposal.leadId ? (
          <form action={syncKeyKonnectConversationAction}>
            <input type="hidden" name="deal_id" value={proposal.dealId} />
            <input type="hidden" name="lead_id" value={proposal.leadId} />
            <button className="cc-btn" type="submit"><IconCheck size={13} /> Save supplied conversation to CRM</button>
          </form>
        ) : null}
      </div>
      <p className="proposal-truth-note">“First customer” is treated here as your first serious live customer opportunity. It becomes Won only when Cory accepts or pays.</p>
    </section>
  );
}

function ProposalEditor({ proposal }: { proposal: ProposalRow }) {
  return (
    <Panel title="Proposal brief" sub="Scope, value, and next move" icon={<IconFile size={15} />} className="cc-s7">
      <form action={saveProposalAction} className="proposal-form">
        <input type="hidden" name="deal_id" value={proposal.dealId} />
        <label className="cc-field"><span>Proposal title</span><input className="cc-input" name="title" defaultValue={proposal.title} required /></label>
        <div className="proposal-form-row">
          <label className="cc-field"><span>Price</span><input className="cc-input" name="amount" inputMode="decimal" placeholder="Leave open until agreed" defaultValue={proposal.valueCents ? (proposal.valueCents / 100).toFixed(2) : ""} /></label>
          <label className="cc-field"><span>Billing</span><select className="cc-select" name="billing" defaultValue={proposal.billing}><option value="one_time">One time</option><option value="monthly">Monthly</option></select></label>
          <label className="cc-field"><span>Expected close</span><input className="cc-input" name="expected_close" type="date" defaultValue={proposal.expectedClose ?? ""} /></label>
        </div>
        <label className="cc-field"><span>Scope and working notes</span><textarea className="cc-textarea proposal-scope" name="scope" defaultValue={proposal.notes ?? ""} placeholder="What is included, what is excluded, and what the client still owes you." /></label>
        <div className="proposal-form-row two">
          <label className="cc-field"><span>Next action</span><input className="cc-input" name="next_action" defaultValue={proposal.nextAction ?? ""} placeholder="One concrete move" /></label>
          <label className="cc-field"><span>Due</span><input className="cc-input" name="next_action_at" type="datetime-local" defaultValue={proposal.nextActionAt?.slice(0, 16) ?? ""} /></label>
        </div>
        <div className="proposal-submit"><button className="cc-btn primary" type="submit">Save proposal brief <IconArrowRight size={13} /></button><span>Saving creates or updates a draft invoice. It does not claim payment.</span></div>
      </form>
    </Panel>
  );
}

function ProposalList({ proposals, current }: { proposals: ProposalRow[]; current: ProposalRow }) {
  return (
    <Panel title="Proposal register" sub={`${proposals.length} total`} icon={<IconInbox size={15} />} className="cc-s5 cc-stretch">
      <div className="proposal-list">
        {proposals.map((proposal) => (
          <article className={proposal.id === current.id ? "is-current" : ""} key={proposal.id}>
            <div className="proposal-list-top"><strong>{proposal.companyName}</strong><span className={`cc-chip ${STATUS_TONE[proposal.invoiceStatus ?? proposal.stage] ?? "t-muted"}`}>{proposal.invoiceStatus ?? proposal.stage}</span></div>
            <p>{proposal.title}</p>
            <div><span>{proposal.contactName}</span><span>{proposal.valueCents ? money(proposal.valueCents) : "Price open"}</span></div>
            <div><span>{proposal.nextAction ?? "Set next action"}</span><span>{proposal.updatedAt ? shortDate(proposal.updatedAt) : DASH}</span></div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

export default async function ProposalsBoard() {
  const supabase = await createSupabaseServerClient();
  const data = await loadProposalWorkspace(supabase);
  const current = data.proposals.find((proposal) => proposal.isKeyKonnect) ?? data.proposals[0];

  return (
    <>
      <div className="cc-greet">
        <div><h1>Proposals</h1><p>Turn active conversations into clear scope, a price, a decision, and then real delivery.</p></div>
        <div className="cc-greet-meta"><span className="cc-chip t-info">Truth-first pipeline</span></div>
      </div>
      <Kpis data={data} />
      {!current ? (
        <div className="cc-board"><Panel title="No proposals yet" icon={<IconFile size={15} />} className="cc-s12"><EmptyState title="Move a qualified deal into Proposal" text="This page reads proposal-stage deals and their draft or sent invoices. Add the opportunity in CRM, then move it forward in Pipeline." cta={{ href: "/admin/crm?tab=deals", label: "Open CRM" }} /></Panel></div>
      ) : (
        <>
          {current.isKeyKonnect ? <KeyKonnectBrief proposal={current} /> : null}
          <div className="cc-board proposal-board">
            <Panel title="Workflow progress" sub={current.companyName} icon={<IconCheck size={15} />} className="cc-s12"><Progress proposal={current} /></Panel>
            <ProposalEditor proposal={current} />
            <ProposalList proposals={data.proposals} current={current} />
          </div>
        </>
      )}
    </>
  );
}

export function ProposalsBoardSkeleton() {
  return <><div className="cc-greet"><div><h1>Proposals</h1><p>Loading proposal workspace…</p></div></div><div className="cc-board"><div className="cc-s12"><PanelSkeleton title="Proposals" /></div></div></>;
}
