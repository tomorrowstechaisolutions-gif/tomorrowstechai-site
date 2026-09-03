import { Panel } from "../Panel";
import { IconSend } from "../Icons";
import { ago, shortDate } from "../format";
import { REQUEST_TEMPLATES, STATUS_LABELS, STATUS_TONE } from "@/lib/requests/config";
import type { ClientRequestBoard, RequestRow } from "@/lib/requests/queries";
import {
  cancelClientRequest,
  completeRequestForClient,
  remindClientRequest,
  resendClientRequest,
  sendClientRequest,
} from "@/app/admin/request-actions";

/**
 * "Waiting on them" — the panel that answers who is holding the ball.
 *
 * Every build has a handful of things only the client can do: open the Stripe
 * account, unlock the domain, send the logo. Before this they lived in John's
 * head and got chased by text message. The panel exists so the answer to
 * "what is this project actually stuck on" is on the client's own page.
 *
 * A server component with plain form actions and a <details> for the ask
 * form. No client bundle: a picker that could have been a <select> is the
 * cheapest way to ship a boundary bug, and this page has 500'd from one
 * before.
 */

function statusLine(row: RequestRow): string {
  const r = row.request;

  switch (r.status) {
    case "draft":
      return "Not sent yet";
    case "sent":
      return r.sent_at
        ? `Sent ${ago(r.sent_at)} · not opened yet`
        : "Sent";
    case "opened":
      return `Opened ${ago(r.last_opened_at)} · nothing filled in`;
    case "started":
      return `Started ${ago(r.updated_at)} · ${row.stepsDone} of ${row.stepsTotal} steps`;
    case "completed":
      return `Done ${ago(r.completed_at)}`;
    case "canceled":
      return `Cancelled ${ago(r.canceled_at)}`;
    default:
      return "";
  }
}

function Answers({ row }: { row: RequestRow }) {
  const template = row.template;
  if (!template) return null;

  const answered = template.fields
    .map((f) => ({ label: f.label, value: row.request.payload[f.key] }))
    .filter((a): a is { label: string; value: string } => Boolean(a.value));

  const confirmed = template.confirm.filter(
    (c) => row.request.payload[`confirm_${c.key}`] === "yes"
  );

  if (!answered.length && !confirmed.length) return null;

  return (
    <details className="cc-req-answers">
      <summary>What they sent back</summary>
      <dl>
        {answered.map((a) => (
          <div key={a.label}>
            <dt>{a.label}</dt>
            <dd>{a.value}</dd>
          </div>
        ))}
      </dl>
      {confirmed.length ? (
        <p className="cc-faint">
          Confirmed: {confirmed.map((c) => c.label).join(" · ")}
        </p>
      ) : null}
    </details>
  );
}

export default function RequestsPanel({
  customerId,
  email,
  name,
  board,
}: {
  customerId: string;
  email: string;
  name: string | null;
  board: ClientRequestBoard;
}) {
  return (
    <Panel
      title="Waiting on them"
      icon={<IconSend size={15} />}
      sub={board.headline}
      className="cc-s12"
      bodyClass="tight"
    >
      {board.rows.length === 0 ? (
        <p className="cc-note" style={{ marginTop: 0 }}>
          Nothing has been asked of this client yet. When a build stalls on
          something only they can do — a Stripe account, the domain, their
          logo — send it from here and it becomes something with a status
          instead of something you have to remember.
        </p>
      ) : (
        <ul className="cc-req-list">
          {board.rows.map((row) => {
            const r = row.request;
            const open = ["sent", "opened", "started"].includes(r.status);

            return (
              <li key={r.id} className="cc-req" data-open={open}>
                <div className="cc-req-head">
                  <span className="cc-req-title">
                    {row.template?.pickerLabel ?? r.title}
                  </span>
                  <span className={`cc-chip ${STATUS_TONE[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  {row.overdue ? <span className="cc-chip t-risk">Overdue</span> : null}
                </div>

                <div className="cc-req-meta">
                  <span>{statusLine(row)}</span>
                  {r.due_at && open ? <span>Asked for by {shortDate(r.due_at)}</span> : null}
                  {r.reminder_count > 0 ? (
                    <span>
                      {r.reminder_count} nudge{r.reminder_count === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {!r.delivered && r.status !== "draft" ? (
                    <span className="cc-req-warn">Email did not send</span>
                  ) : null}
                </div>

                <Answers row={row} />

                {open ? (
                  <div className="cc-req-actions">
                    {row.nudgeable ? (
                      <form action={remindClientRequest}>
                        <input type="hidden" name="request_id" value={r.id} />
                        <button type="submit" className="cc-btn">
                          Nudge
                        </button>
                      </form>
                    ) : null}

                    <form action={resendClientRequest}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <button type="submit" className="cc-btn">
                        Resend
                      </button>
                    </form>

                    <form action={completeRequestForClient}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <input
                        type="hidden"
                        name="how"
                        value="Handled with John outside the link"
                      />
                      <button type="submit" className="cc-btn">
                        Mark done
                      </button>
                    </form>

                    <form action={cancelClientRequest}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <button type="submit" className="cc-btn">
                        Cancel
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <details className="cc-req-ask">
        <summary>Ask them for something</summary>

        <form action={sendClientRequest}>
          <input type="hidden" name="customer_id" value={customerId} />

          <div className="cc-field">
            <label className="cc-label" htmlFor="req-template">
              What do you need from them?
            </label>
            <select
              id="req-template"
              name="template_key"
              className="cc-select"
              defaultValue={REQUEST_TEMPLATES[0]?.key}
              required
            >
              {REQUEST_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.pickerLabel}
                </option>
              ))}
            </select>
          </div>

          <ul className="cc-req-legend">
            {REQUEST_TEMPLATES.map((t) => (
              <li key={t.key}>
                <b>{t.pickerLabel}</b> {t.pickerHint}
              </li>
            ))}
          </ul>

          <div className="cc-field row2">
            <div className="cc-field">
              <label className="cc-label" htmlFor="req-email">
                Send to
              </label>
              <input
                id="req-email"
                name="to_email"
                type="email"
                className="cc-input"
                defaultValue={email}
                required
              />
            </div>

            <div className="cc-field">
              <label className="cc-label" htmlFor="req-due">
                Ask for it by
              </label>
              <select id="req-due" name="due_days" className="cc-select" defaultValue="7">
                <option value="3">In 3 days</option>
                <option value="7">In a week</option>
                <option value="14">In two weeks</option>
                <option value="0">No date</option>
              </select>
            </div>
          </div>

          <input type="hidden" name="to_name" value={name ?? ""} />

          <div className="cc-field">
            <label className="cc-label" htmlFor="req-note">
              A line from you (optional)
            </label>
            <textarea
              id="req-note"
              name="note"
              className="cc-textarea"
              style={{ minHeight: 62 }}
              placeholder="Good talking today — this is the Stripe part we went over."
            />
          </div>

          <button type="submit" className="cc-btn primary">
            Send it
          </button>
          <p className="cc-faint" style={{ fontSize: "0.72rem", marginTop: 8 }}>
            They get a branded email and their own page with the steps. You get
            told when they open it and when they finish.
          </p>
        </form>
      </details>
    </Panel>
  );
}
