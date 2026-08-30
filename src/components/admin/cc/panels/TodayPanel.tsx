import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadToday, type TodayItem } from "@/lib/dashboard/today";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import TaskCheck from "../TaskCheck";
import { clockTime, due, todayLabel } from "../format";
import {
  IconCalendar,
  IconCheckSquare,
  IconClock,
  IconDollar,
  IconImage,
  IconPhone,
  IconSpark,
  IconUsers,
} from "../Icons";

/** Section 4 — Today. Seven sources, one list, one place to start. */

const KIND_ICON = {
  task: IconCheckSquare,
  meeting: IconUsers,
  followup: IconClock,
  callback: IconPhone,
  deadline: IconCalendar,
  invoice: IconDollar,
  content: IconImage,
} as const;

export default async function TodayPanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("today", () => loadToday(supabase));

  return (
    <Panel
      title="Today"
      icon={<IconCalendar size={15} />}
      sub={todayLabel()}
      className={className}
      bodyClass="flush"
      footer={
        <>
          <Link
            href={`/admin?ask=${encodeURIComponent(
              "What should I focus on today, and in what order? Use the leads, projects and invoices you can see."
            )}#advisor`}
            className="cc-cta"
          >
            <IconSpark size={13} /> AI, prioritise my day
          </Link>
          {result.ok && result.data.doneToday > 0 ? (
            <span className="cc-faint" style={{ fontSize: "0.72rem", marginLeft: "auto" }}>
              {result.data.doneToday} done today
            </span>
          ) : null}
        </>
      }
    >
      {!result.ok ? (
        <ErrorState message={result.error} />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          title="Nothing is due"
          text="No meetings, callbacks, deadlines or unpaid invoices need you today. Anything you add through Quick Add appears here."
          icon={<IconCheckSquare size={17} />}
        />
      ) : (
        <div className="cc-today">
          {result.data.items.slice(0, 9).map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Row({ item }: { item: TodayItem }) {
  const Icon = KIND_ICON[item.kind] ?? IconCheckSquare;

  return (
    <div className="cc-today-item">
      {item.taskId ? (
        <TaskCheck taskId={item.taskId} label={item.title} />
      ) : (
        <span className="cc-today-dot" title="Closed by dealing with the record it belongs to">
          <Icon size={13} />
        </span>
      )}

      <div className="cc-today-main">
        <Link href={item.href} className="cc-today-title">
          {item.title}
        </Link>
        {item.subtitle ? <div className="cc-today-sub">{item.subtitle}</div> : null}
      </div>

      <span className={`cc-today-when ${item.overdue ? "is-overdue" : ""}`}>
        {item.at
          ? item.kind === "meeting" || item.kind === "callback"
            ? clockTime(item.at)
            : due(item.at)
          : "—"}
      </span>
    </div>
  );
}
