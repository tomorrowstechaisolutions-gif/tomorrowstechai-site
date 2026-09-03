import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { providerStatuses } from "@/lib/meetings/providers";
import { meetingsForRecord, resolveContact } from "@/lib/meetings/queries";
import { scheduleMeetingAction } from "@/app/admin/meeting-actions";
import ScheduleMeetingButton from "@/components/admin/cc/meetings/ScheduleMeetingButton";
import MeetingsPanel from "@/components/admin/cc/meetings/MeetingsPanel";
import { BUSINESS_TIMEZONE, BUSINESS_TIMEZONE_LABEL } from "@/lib/calendar/config";
import { chicagoDate } from "@/lib/time/chicago";

import { JOB_STAGES, STAGE_BLURB, type JobStage } from "@/lib/jobs/config";
import {
  STARTER_PACKAGE,
  STARTER_STAGES,
  STARTER_STAGE_BLURB,
} from "@/lib/intake/config";
import type { IntakeRecord } from "@/lib/intake/config";
import { openIntakeForJob } from "@/app/admin/actions";
import { fmtMoney } from "@/lib/campaign/metrics";
import { HOSTING_TRIAL_DAYS } from "@/lib/campaign/config";
import type {
  Job,
  JobTask,
  JobEvent,
  Customer,
  Invoice,
  CatalogItem,
} from "@/lib/supabase/types";
import { SellUpsellButton } from "@/components/admin/SellUpsellButton";
import {
  addJobNote,
  toggleJobTask,
  updateJobFields,
  updateJobStage,
} from "../../../actions";

export const dynamic = "force-dynamic";

/** Module scope: see the note in the jobs board. */
function isOverdue(due: string | null): boolean {
  return due ? new Date(due).getTime() < Date.now() : false;
}

function dateInput(value: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: jobRow } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!jobRow) notFound();
  const job = jobRow as Job;

  const [
    { data: taskRows },
    { data: eventRows },
    { data: customerRow },
    { data: invoiceRow },
    { data: catalogRows },
  ] = await Promise.all([
      supabase.from("job_tasks").select("*").eq("job_id", id).order("position"),
      supabase
        .from("job_events")
        .select("*")
        .eq("job_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      job.customer_id
        ? supabase.from("customers").select("*").eq("id", job.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
      job.invoice_id
        ? supabase.from("invoices").select("*").eq("id", job.invoice_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("catalog_items")
        .select("*")
        .eq("active", true)
        .order("position", { ascending: true }),
    ]);

  const tasks = (taskRows ?? []) as JobTask[];
  const events = (eventRows ?? []) as JobEvent[];
  const customer = customerRow as Customer | null;
  const invoice = invoiceRow as Invoice | null;

  // Which vocabulary this job speaks depends on what was sold.
  const isStarter = job.package === STARTER_PACKAGE;
  const stageOptions: readonly string[] = isStarter ? STARTER_STAGES : JOB_STAGES;
  const stageBlurb: Record<string, string> = isStarter
    ? STARTER_STAGE_BLURB
    : (STAGE_BLURB as Record<string, string>);

  // Starter jobs are gated on intake, so the job page has to say whether one
  // exists and where it has got to. A Classic job has no intake and skips this.
  const { data: intakeRow } = isStarter
    ? await supabase.from("client_intakes").select("*").eq("job_id", job.id).maybeSingle()
    : { data: null };
  const intake = intakeRow as IntakeRecord | null;

  const done = tasks.filter((t) => t.done).length;
  const stageTasks = tasks.filter((t) => t.stage === job.stage);
  const overdue = isOverdue(job.due_at);
  const priceGap = job.estimated_market_value_cents === null
    ? null
    : Math.max(0, job.estimated_market_value_cents - job.value_cents);

  // Kickoffs, progress reviews, training and final reviews all hang off the
  // project rather than the client, so they show here and on its timeline.
  const [meetings, meetingContact, providers] = await Promise.all([
    meetingsForRecord(supabase, "job_id", job.id),
    resolveContact(supabase, { jobId: job.id }),
    providerStatuses(),
  ]);

  const scheduleButton = meetingContact ? (
    <ScheduleMeetingButton
      contact={meetingContact}
      providers={providers}
      action={scheduleMeetingAction}
      defaultDate={chicagoDate(new Date(Date.now() + 86_400_000))}
      defaultType={job.completed_at ? "final_review" : "kickoff"}
      jobId={job.id}
      returnTo={`/admin/jobs/${job.id}`}
      timezone={BUSINESS_TIMEZONE}
      timezoneLabel={BUSINESS_TIMEZONE_LABEL}
    />
  ) : null;

  return (
    <>
      <header className="ad-head">
        <p className="ad-crumb">
          <Link href="/admin/jobs" className="ad-link">
            ← Jobs
          </Link>
        </p>
        <h1>{job.title}</h1>
        <p>
          {stageBlurb[job.stage] ?? ""} · {done} of {tasks.length} steps done
          {job.due_at && (
            <>
              {" · "}
              <span className={overdue ? "ad-tag s-late" : "ad-muted"}>
                due {new Date(job.due_at).toLocaleDateString()}
              </span>
            </>
          )}
        </p>
        {scheduleButton ? <div className="ad-headactions">{scheduleButton}</div> : null}
      </header>

      <MeetingsPanel
        data={meetings}
        variant="ad"
        heading="Project meetings"
        scheduleButton={scheduleButton}
        emptyText="No kickoff or review booked yet. Scheduling one from here links it to this project and puts it on the calendar."
      />

      <div className="ad-grid-2">
        <div>
          <section className="ad-panel">
            <h2 className="ad-panel-title">Commercial reality</h2>
            <dl className="ad-dl">
              <dt>Engagement</dt>
              <dd>
                <span className={`ad-tag s-${job.engagement_status === "paid" ? "live" : job.engagement_status === "pre_contract" ? "soon" : "muted"}`}>
                  {job.engagement_status.replaceAll("_", " ")}
                </span>
              </dd>
              <dt>Pricing model</dt>
              <dd>{job.pricing_model.replaceAll("_", " ")}</dd>
              <dt>Agreed build</dt>
              <dd>{fmtMoney(job.value_cents / 100)}</dd>
              <dt>Recurring</dt>
              <dd>{fmtMoney(job.recurring_value_cents / 100)}/mo</dd>
              <dt>Estimated market value</dt>
              <dd>{job.estimated_market_value_cents === null ? "—" : fmtMoney(job.estimated_market_value_cents / 100)}</dd>
              <dt>Pricing gap / investment</dt>
              <dd>{priceGap === null ? "—" : fmtMoney(priceGap / 100)}</dd>
              <dt>Hours</dt>
              <dd>{job.actual_hours ?? "—"} actual · {job.estimated_hours ?? "—"} estimated</dd>
            </dl>
            {job.pricing_note ? <p className="ad-hint">{job.pricing_note}</p> : null}
            <p className="ad-hint">
              Project economics only—not booked revenue. Revenue stays at zero until payment is recorded.
            </p>
          </section>

          <section className="ad-panel">
            <h2 className="ad-panel-title">Scope control</h2>
            <dl className="ad-dl">
              <dt>Original agreement</dt>
              <dd>{job.scope_baseline || "—"}</dd>
              <dt>Delivered / expanded</dt>
              <dd>{job.scope_expansion || "—"}</dd>
              <dt>Payment timing</dt>
              <dd>{job.payment_timing || "—"}</dd>
              <dt>Next milestone</dt>
              <dd>{job.next_milestone || "—"}</dd>
            </dl>
          </section>

          {isStarter ? (
            <section className="ad-panel">
              <h2 className="ad-panel-title">Client intake</h2>
              {intake ? (
                <>
                  <p className="ad-muted" style={{ fontSize: "0.8rem" }}>
                    {intake.status === "submitted"
                      ? `Submitted ${intake.submitted_at ? new Date(intake.submitted_at).toLocaleDateString() : ""}.`
                      : `Waiting on the client — step ${intake.current_step} of 5.`}
                  </p>
                  <p style={{ marginTop: "0.5rem" }}>
                    <Link href={`/admin/intakes/${intake.id}`} className="ad-link">
                      Open the intake →
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <p className="ad-muted" style={{ fontSize: "0.8rem" }}>
                    No intake yet. Issuing one moves this job to Intake Required
                    and gives the client a link to send their content.
                  </p>
                  <form action={openIntakeForJob} className="ad-inline-form" style={{ marginTop: "0.75rem" }}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <button type="submit" className="ad-btn">Issue an intake link</button>
                  </form>
                </>
              )}
            </section>
          ) : null}

          <section className="ad-panel">
            <h2 className="ad-panel-title">Stage</h2>
            <form action={updateJobStage} className="ad-inline-form">
              <input type="hidden" name="job_id" value={job.id} />
              <select name="stage" defaultValue={job.stage} className="ad-input">
                {stageOptions.map((s: string) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button type="submit" className="ad-btn primary sm">
                Move
              </button>
            </form>
          </section>

          <section className="ad-panel">
            <h2 className="ad-panel-title">
              This stage{stageTasks.length > 0 ? ` — ${job.stage}` : ""}
            </h2>
            {stageTasks.length === 0 ? (
              <p className="ad-empty">Nothing checklisted for this stage.</p>
            ) : (
              <ul className="ad-checklist">
                {stageTasks.map((task) => (
                  <li key={task.id} className={task.done ? "is-done" : ""}>
                    <form action={toggleJobTask}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="task_id" value={task.id} />
                      <button type="submit" className="ad-check">
                        {task.done ? "✓" : ""}
                      </button>
                    </form>
                    <span>{task.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ad-panel">
            <h2 className="ad-panel-title">Everything else</h2>
            <ul className="ad-checklist muted">
              {tasks
                .filter((t) => t.stage !== job.stage)
                .map((task) => (
                  <li key={task.id} className={task.done ? "is-done" : ""}>
                    <form action={toggleJobTask}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="task_id" value={task.id} />
                      <button type="submit" className="ad-check">
                        {task.done ? "✓" : ""}
                      </button>
                    </form>
                    <span>
                      <em>{task.stage}</em> — {task.label}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        </div>

        <div>
          <section className="ad-panel">
            <h2 className="ad-panel-title">Customer</h2>
            {customer ? (
              <dl className="ad-dl">
                <dt>Name</dt>
                <dd>{customer.name || "—"}</dd>
                <dt>Business</dt>
                <dd>{customer.business_name || "—"}</dd>
                <dt>Email</dt>
                <dd>{customer.email}</dd>
                <dt>Phone</dt>
                <dd>{customer.phone || "—"}</dd>
                <dt>Hosting</dt>
                <dd>
                  {fmtMoney(customer.mrr_cents / 100)}/mo ·{" "}
                  <span className={`ad-tag s-${customer.status === "active" ? "live" : "muted"}`}>
                    {customer.status}
                  </span>
                </dd>
              </dl>
            ) : (
              <p className="ad-empty">No customer record linked.</p>
            )}
            {job.lead_id && (
              <p>
                <Link href={`/admin/leads/${job.lead_id}`} className="ad-link">
                  Open the original lead →
                </Link>
              </p>
            )}
          </section>

          {invoice && (
            <section className="ad-panel">
              <h2 className="ad-panel-title">Payment</h2>
              <dl className="ad-dl">
                <dt>Charged</dt>
                <dd>{fmtMoney(invoice.launch_cents / 100)}</dd>
                <dt>Then monthly</dt>
                <dd>
                  {fmtMoney(invoice.hosting_cents / 100)}
                  {invoice.paid_at && (
                    <>
                      {" "}
                      <span className="ad-muted">
                        from{" "}
                        {new Date(
                          new Date(invoice.paid_at).getTime() +
                            HOSTING_TRIAL_DAYS * 86_400_000
                        ).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </dd>
                <dt>Status</dt>
                <dd>
                  <span className={`ad-tag s-${invoice.status === "paid" ? "live" : "muted"}`}>
                    {invoice.status}
                  </span>
                </dd>
                <dt>Paid</dt>
                <dd>
                  {invoice.paid_at
                    ? new Date(invoice.paid_at).toLocaleString()
                    : "—"}
                </dd>
              </dl>
            </section>
          )}

          <section className="ad-panel">
            <h2 className="ad-panel-title">Sell more</h2>
            <p className="ad-hint">
              Mid-job is when they trust you most. Anything sold here is billed
              to the same customer and lands on this job&rsquo;s revenue.
            </p>
            <SellUpsellButton
              items={(catalogRows ?? []) as CatalogItem[]}
              customerId={job.customer_id}
              leadId={job.lead_id}
            />
          </section>

          <section className="ad-panel">
            <h2 className="ad-panel-title">Details</h2>
            <form action={updateJobFields} className="ad-form">
              <input type="hidden" name="job_id" value={job.id} />
              <label className="ad-field">
                <span>Live site URL</span>
                <input
                  name="site_url"
                  defaultValue={job.site_url ?? ""}
                  className="ad-input"
                  placeholder="https://"
                />
              </label>
              <label className="ad-field">
                <span>Due date</span>
                <input
                  type="date"
                  name="due_at"
                  defaultValue={dateInput(job.due_at)}
                  className="ad-input"
                />
              </label>
              <label className="ad-field">
                <span>Engagement status</span>
                <select name="engagement_status" defaultValue={job.engagement_status} className="ad-input">
                  <option value="pre_contract">Pre-contract</option>
                  <option value="contracted">Contracted</option>
                  <option value="awaiting_payment">Awaiting payment</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label className="ad-field">
                <span>Pricing model</span>
                <select name="pricing_model" defaultValue={job.pricing_model} className="ad-input">
                  <option value="standard">Standard</option>
                  <option value="custom">Custom</option>
                  <option value="founding_client">Founding client</option>
                  <option value="portfolio">Portfolio</option>
                  <option value="discounted">Discounted</option>
                  <option value="pro_bono">Pro bono</option>
                </select>
              </label>
              <label className="ad-field">
                <span>Agreed build price</span>
                <input name="agreed_build" type="number" min="0" step="0.01" defaultValue={job.value_cents / 100} className="ad-input" />
              </label>
              <label className="ad-field">
                <span>Recurring monthly value</span>
                <input name="recurring_value" type="number" min="0" step="0.01" defaultValue={job.recurring_value_cents / 100} className="ad-input" />
              </label>
              <label className="ad-field">
                <span>Estimated market value</span>
                <input name="estimated_market_value" type="number" min="0" step="0.01" defaultValue={job.estimated_market_value_cents === null ? "" : job.estimated_market_value_cents / 100} className="ad-input" />
              </label>
              <label className="ad-field">
                <span>Estimated hours</span>
                <input name="estimated_hours" type="number" min="0" step="0.25" defaultValue={job.estimated_hours ?? ""} className="ad-input" />
              </label>
              <label className="ad-field">
                <span>Actual hours</span>
                <input name="actual_hours" type="number" min="0" step="0.25" defaultValue={job.actual_hours ?? ""} className="ad-input" />
              </label>
              <label className="ad-field">
                <span>Payment timing</span>
                <textarea name="payment_timing" defaultValue={job.payment_timing ?? ""} className="ad-input" rows={3} />
              </label>
              <label className="ad-field">
                <span>Pricing note</span>
                <textarea name="pricing_note" defaultValue={job.pricing_note ?? ""} className="ad-input" rows={3} />
              </label>
              <label className="ad-field">
                <span>Original scope</span>
                <textarea name="scope_baseline" defaultValue={job.scope_baseline ?? ""} className="ad-input" rows={3} />
              </label>
              <label className="ad-field">
                <span>Expanded / delivered scope</span>
                <textarea name="scope_expansion" defaultValue={job.scope_expansion ?? ""} className="ad-input" rows={4} />
              </label>
              <label className="ad-field">
                <span>Next milestone</span>
                <textarea name="next_milestone" defaultValue={job.next_milestone ?? ""} className="ad-input" rows={2} />
              </label>
              <label className="ad-field">
                <span>Notes</span>
                <textarea
                  name="notes"
                  defaultValue={job.notes ?? ""}
                  className="ad-input"
                  rows={4}
                />
              </label>
              <button type="submit" className="ad-btn primary sm">
                Save
              </button>
            </form>
          </section>

          <section className="ad-panel">
            <h2 className="ad-panel-title">History</h2>
            <form action={addJobNote} className="ad-inline-form">
              <input type="hidden" name="job_id" value={job.id} />
              <input
                name="body"
                className="ad-input"
                placeholder="Add a note…"
                required
              />
              <button type="submit" className="ad-btn sm">
                Add
              </button>
            </form>
            <ul className="ad-timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <time>{new Date(e.created_at).toLocaleString()}</time>
                  <span className="ad-tag s-muted">{e.kind}</span>
                  <p>{e.body}</p>
                  <small>{e.actor}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
