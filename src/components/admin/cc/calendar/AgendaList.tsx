import Link from "next/link";
import {
  BUSINESS_TIMEZONE, CATEGORY_LABELS, CATEGORY_TONE,
  EVENT_STATUS_LABELS, EVENT_STATUS_TONE,
} from "@/lib/calendar/config";
import type { CalendarItem } from "@/lib/calendar/types";
import { itemHref } from "@/lib/calendar/links";
import { EmptyState } from "../Panel";
import { IconCalendar } from "../Icons";

/**
 * The agenda.
 *
 * Grouped by how far away a thing is rather than by its date, because that is
 * how a week is actually read: today, tomorrow, the rest of this week, then
 * next week. Dates come back for anything further out, where "in eleven days"
 * stops being a useful way to say Thursday.
 */

function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE })
    .format(new Date(iso));
}

function clock(iso: string, allDay: boolean): string {
  if (allDay) return "All day";
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit",
  });
}

function longDay(day: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
}

function shortName(email: string | null): string {
  if (!email) return "—";
  const parts = email.split("@")[0].split(/[._-]+/).filter(Boolean);
  const first = parts[0]?.replace(/^./, (c) => c.toUpperCase()) ?? "—";
  return parts.length > 1 ? `${first} ${parts[1][0].toUpperCase()}.` : first;
}

export default function AgendaList({
  items,
  today,
  query,
}: {
  items: CalendarItem[];
  today: string;
  query: string;
}) {
  if (items.length === 0) {
    return (
      <section className="cc-panel">
        <div className="cc-panel-body">
          <EmptyState
            title="Nothing scheduled"
            text="No events, deadlines or launches in this stretch. Anything with a date on it anywhere in the Command Center shows up here automatically."
            icon={<IconCalendar size={17} />}
          />
        </div>
      </section>
    );
  }

  const at = (day: string, offset: number) => {
    const [y, m, d] = day.split("-").map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + offset));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  };

  const tomorrow = at(today, 1);
  const endOfWeek = at(today, 7);
  const endOfNextWeek = at(today, 14);

  const bucketFor = (day: string): string => {
    if (day === today) return "Today";
    if (day === tomorrow) return "Tomorrow";
    if (day < endOfWeek) return "This week";
    if (day < endOfNextWeek) return "Next week";
    return longDay(day);
  };

  const order: string[] = [];
  const buckets = new Map<string, CalendarItem[]>();
  for (const entry of items) {
    const key = bucketFor(dayOf(entry.start));
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(entry);
  }

  return (
    <section className="cc-panel cal-agenda">
      {order.map((bucket) => (
        <div key={bucket} className="cal-agenda-group">
          <h3>{bucket}<span>{buckets.get(bucket)!.length}</span></h3>

          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>What</th>
                  <th>Client / Project</th>
                  <th>Assigned</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {buckets.get(bucket)!.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cal-agenda-when">
                      {clock(entry.start, entry.allDay)}
                      {bucket.length > 9 ? null : (
                        <span>{longDay(dayOf(entry.start)).split(",")[0]}</span>
                      )}
                    </td>
                    <td>
                      <span className={`cal-chip ${CATEGORY_TONE[entry.category]}`}>
                        {CATEGORY_LABELS[entry.category]}
                      </span>
                    </td>
                    <td>
                      <Link href={itemHref(query, entry.id)} scroll={false} className="cc-strong">
                        {entry.title}
                      </Link>
                      {entry.subtitle ? (
                        <span className="cc-client-sub">{entry.subtitle}</span>
                      ) : null}
                    </td>
                    <td>
                      {entry.clientName ? (
                        <span className="cc-client-name">{entry.clientName}</span>
                      ) : null}
                      {entry.projectName ? (
                        <span className="cc-client-sub">{entry.projectName}</span>
                      ) : null}
                      {!entry.clientName && !entry.projectName ? (
                        <span className="cc-client-sub">—</span>
                      ) : null}
                    </td>
                    <td>{shortName(entry.assignedTo)}</td>
                    <td>
                      <span className={`tk-chip ${EVENT_STATUS_TONE[entry.status]}`}>
                        {EVENT_STATUS_LABELS[entry.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
