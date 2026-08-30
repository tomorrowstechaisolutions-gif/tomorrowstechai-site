import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOB_STAGES, STAGE_BLURB, type JobStage } from "@/lib/jobs/config";
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

  const done = tasks.filter((t) => t.done).length;
  const stageTasks = tasks.filter((t) => t.stage === job.stage);
  const overdue = isOverdue(job.due_at);

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
          {STAGE_BLURB[job.stage]} · {done} of {tasks.length} steps done
          {job.due_at && (
            <>
              {" · "}
              <span className={overdue ? "ad-tag s-late" : "ad-muted"}>
                due {new Date(job.due_at).toLocaleDateString()}
              </span>
            </>
          )}
        </p>
      </header>

      <div className="ad-grid-2">
        <div>
          <section className="ad-panel">
            <h2 className="ad-panel-title">Stage</h2>
            <form action={updateJobStage} className="ad-inline-form">
              <input type="hidden" name="job_id" value={job.id} />
              <select name="stage" defaultValue={job.stage} className="ad-input">
                {JOB_STAGES.map((s: JobStage) => (
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
