"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  quickAddClient,
  quickAddExpense,
  quickAddLead,
  quickAddProject,
  quickAddSocialPost,
  quickAddTask,
} from "@/app/admin/dashboard-actions";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  EXPENSE_CATEGORIES,
} from "@/lib/supabase/types";
import {
  IconBriefcase,
  IconCart,
  IconCheckSquare,
  IconDollar,
  IconFile,
  IconFunnel,
  IconMegaphone,
  IconPlus,
  IconShare,
  IconUsers,
  IconX,
} from "./Icons";

/**
 * Quick Add.
 *
 * Only offers what there is somewhere real to put. Invoices and campaigns are
 * links rather than forms because both already have a careful flow — a
 * checkout link is created from the lead it belongs to, where the amount is
 * typed per job, and an ad is created in Ad Studio where the character limits
 * are enforced. Rebuilding either here would mean two ways to do one thing,
 * and one of them worse.
 */

type Kind =
  | "task"
  | "lead"
  | "client"
  | "project"
  | "post"
  | "expense";

const FORMS: { key: Kind; label: string; hint: string; icon: typeof IconPlus }[] = [
  { key: "task", label: "Task", hint: "Something to do", icon: IconCheckSquare },
  { key: "lead", label: "Lead", hint: "Someone who enquired", icon: IconFunnel },
  { key: "client", label: "Client", hint: "A paying customer", icon: IconUsers },
  { key: "project", label: "Project", hint: "Website, app, AI system…", icon: IconBriefcase },
  { key: "post", label: "Social post", hint: "Draft or schedule", icon: IconShare },
  { key: "expense", label: "Expense", hint: "Money going out", icon: IconCart },
];

const LINKS = [
  { href: "/admin/leads", label: "Invoice / checkout link", hint: "From the lead it belongs to", icon: IconDollar },
  { href: "/admin/marketing/ads/new", label: "Campaign ad", hint: "In Ad Studio", icon: IconMegaphone },
  { href: "/admin/leads", label: "Note on a lead", hint: "On the lead's timeline", icon: IconFile },
];

export default function QuickAdd() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<Kind | null>(null);
  const [pending, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!form) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setForm(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [form]);

  const run = (action: (fd: FormData) => Promise<void>) => (fd: FormData) => {
    startTransition(async () => {
      await action(fd);
      setForm(null);
    });
  };

  const active = FORMS.find((f) => f.key === form);

  return (
    <div className="cc-menu-wrap" ref={wrap}>
      <button
        type="button"
        className="cc-add-btn"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <IconPlus size={15} />
        <span>Quick add</span>
      </button>

      {menuOpen ? (
        <div className="cc-pop" role="menu">
          <div className="cc-pop-head">Create</div>
          {FORMS.map((f) => (
            <button
              key={f.key}
              type="button"
              className="cc-pop-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setForm(f.key);
              }}
            >
              <f.icon size={15} />
              <span>
                {f.label}
                <br />
                <span className="cc-faint" style={{ fontSize: "0.7rem" }}>{f.hint}</span>
              </span>
            </button>
          ))}
          <div className="cc-pop-sep" />
          <div className="cc-pop-head">Where these already live</div>
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="cc-pop-item"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              <l.icon size={15} />
              <span>
                {l.label}
                <br />
                <span className="cc-faint" style={{ fontSize: "0.7rem" }}>{l.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {form && active ? (
        <div
          className="cc-sheet-back"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setForm(null);
          }}
        >
          <div className="cc-sheet" role="dialog" aria-modal="true" aria-label={`New ${active.label}`}>
            <div className="cc-sheet-head">
              <active.icon size={17} />
              <h3>New {active.label.toLowerCase()}</h3>
              <button
                type="button"
                className="cc-icon-btn"
                style={{ marginLeft: "auto", width: 28, height: 28 }}
                onClick={() => setForm(null)}
                aria-label="Close"
              >
                <IconX size={14} />
              </button>
            </div>
            <div className="cc-sheet-body">
              {form === "task" ? <TaskForm run={run(quickAddTask)} pending={pending} /> : null}
              {form === "lead" ? <LeadForm run={run(quickAddLead)} pending={pending} /> : null}
              {form === "client" ? <ClientForm run={run(quickAddClient)} pending={pending} /> : null}
              {form === "project" ? <ProjectForm run={run(quickAddProject)} pending={pending} /> : null}
              {form === "post" ? <PostForm run={run(quickAddSocialPost)} pending={pending} /> : null}
              {form === "expense" ? <ExpenseForm run={run(quickAddExpense)} pending={pending} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type FormProps = { run: (fd: FormData) => void; pending: boolean };

function Foot({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="cc-sheet-foot">
      <button type="submit" className="cc-btn primary" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}

function TaskForm({ run, pending }: FormProps) {
  return (
    <form action={run}>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-task-title">What needs doing</label>
        <input id="qa-task-title" name="title" className="cc-input" required autoFocus placeholder="Call Blue Water Pools back" />
      </div>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-task-kind">Type</label>
          <select id="qa-task-kind" name="kind" className="cc-select" defaultValue="task">
            <option value="task">Task</option>
            <option value="callback">Callback</option>
            <option value="followup">Follow-up</option>
            <option value="meeting">Meeting</option>
            <option value="deadline">Deadline</option>
            <option value="invoice">Invoice</option>
            <option value="content">Content</option>
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-task-pri">Priority</label>
          <select id="qa-task-pri" name="priority" className="cc-select" defaultValue="medium">
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-task-due">Due (optional)</label>
        <input id="qa-task-due" name="due_at" type="datetime-local" className="cc-input" />
      </div>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-task-notes">Notes (optional)</label>
        <textarea id="qa-task-notes" name="notes" className="cc-textarea" style={{ minHeight: 60 }} />
      </div>
      <Foot pending={pending} label="Add task" />
    </form>
  );
}

function LeadForm({ run, pending }: FormProps) {
  return (
    <form action={run}>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-lead-first">First name</label>
          <input id="qa-lead-first" name="first_name" className="cc-input" required autoFocus />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-lead-last">Last name</label>
          <input id="qa-lead-last" name="last_name" className="cc-input" />
        </div>
      </div>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-lead-email">Email</label>
        <input id="qa-lead-email" name="email" type="email" className="cc-input" required />
      </div>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-lead-phone">Phone</label>
          <input id="qa-lead-phone" name="phone" className="cc-input" />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-lead-biz">Business</label>
          <input id="qa-lead-biz" name="business_name" className="cc-input" />
        </div>
      </div>
      <p className="cc-note">
        Recorded with source <b>manual</b> and no marketing consent, because
        neither was collected through a form. Both matter later — attribution
        and the unsubscribe rules depend on them.
      </p>
      <Foot pending={pending} label="Add lead" />
    </form>
  );
}

function ClientForm({ run, pending }: FormProps) {
  return (
    <form action={run}>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-cl-biz">Business name</label>
        <input id="qa-cl-biz" name="business_name" className="cc-input" autoFocus />
      </div>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-cl-name">Contact name</label>
          <input id="qa-cl-name" name="name" className="cc-input" />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-cl-phone">Phone</label>
          <input id="qa-cl-phone" name="phone" className="cc-input" />
        </div>
      </div>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-cl-email">Email</label>
          <input id="qa-cl-email" name="email" type="email" className="cc-input" required />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-cl-mrr">Monthly recurring ($)</label>
          <input id="qa-cl-mrr" name="mrr" className="cc-input" placeholder="29" inputMode="decimal" />
        </div>
      </div>
      <p className="cc-note">
        Monthly recurring feeds the MRR card directly. Leave it at zero for a
        one-off build with no hosting.
      </p>
      <Foot pending={pending} label="Add client" />
    </form>
  );
}

function ProjectForm({ run, pending }: FormProps) {
  return (
    <form action={run}>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-pr-title">Project</label>
        <input id="qa-pr-title" name="title" className="cc-input" required autoFocus placeholder="Smith Construction — website" />
      </div>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-pr-type">Type</label>
          <select id="qa-pr-type" name="project_type" className="cc-select" defaultValue="website">
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-pr-client">Client</label>
          <input id="qa-pr-client" name="business_name" className="cc-input" />
        </div>
      </div>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-pr-value">Value ($)</label>
          <input id="qa-pr-value" name="value" className="cc-input" placeholder="399" inputMode="decimal" />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-pr-due">Due</label>
          <input id="qa-pr-due" name="due_at" type="datetime-local" className="cc-input" />
        </div>
      </div>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-pr-next">Next milestone (optional)</label>
        <input id="qa-pr-next" name="next_milestone" className="cc-input" />
      </div>
      <p className="cc-note">
        Opens at the Intake stage with the standard delivery checklist attached,
        and defaults to the 14-day promise if you leave the date blank.
      </p>
      <Foot pending={pending} label="Open project" />
    </form>
  );
}

function PostForm({ run, pending }: FormProps) {
  return (
    <form action={run}>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-po-platform">Platform</label>
        <select id="qa-po-platform" name="platform" className="cc-select" defaultValue="facebook">
          {SOCIAL_PLATFORMS.map((p) => (
            <option key={p} value={p}>{SOCIAL_PLATFORM_LABELS[p]}</option>
          ))}
        </select>
      </div>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-po-body">Post</label>
        <textarea id="qa-po-body" name="body" className="cc-textarea" required autoFocus />
      </div>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-po-link">Link (optional)</label>
          <input id="qa-po-link" name="link_url" className="cc-input" placeholder="https://" />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-po-when">Schedule for</label>
          <input id="qa-po-when" name="scheduled_at" type="datetime-local" className="cc-input" />
        </div>
      </div>
      <p className="cc-note">
        Saved and scheduled here — <b>not published</b>. No platform is
        connected yet, so this is a reminder on the Today card, not a promise
        that something will go out on its own.
      </p>
      <Foot pending={pending} label="Save post" />
    </form>
  );
}

function ExpenseForm({ run, pending }: FormProps) {
  return (
    <form action={run}>
      <div className="cc-field row2">
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-ex-amount">Amount ($)</label>
          <input id="qa-ex-amount" name="amount" className="cc-input" required autoFocus inputMode="decimal" />
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="qa-ex-cat">Category</label>
          <select id="qa-ex-cat" name="category" className="cc-select" defaultValue="software">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-ex-vendor">Vendor</label>
        <input id="qa-ex-vendor" name="vendor" className="cc-input" />
      </div>
      <div className="cc-field">
        <label className="cc-label" htmlFor="qa-ex-desc">What for</label>
        <input id="qa-ex-desc" name="description" className="cc-input" />
      </div>
      <p className="cc-note">
        Ad spend is tracked separately in Ad spend and added on top — don&rsquo;t
        enter it here or it will be counted twice.
      </p>
      <Foot pending={pending} label="Add expense" />
    </form>
  );
}
