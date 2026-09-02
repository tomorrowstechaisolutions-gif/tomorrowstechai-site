"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CALENDAR_FILTERS } from "@/lib/calendar/config";

/**
 * The CALENDARS and TEAM MEMBERS panel.
 *
 * Both lists live in the URL as comma-separated keys, and an ABSENT parameter
 * means everything is on. That way the default view needs no query string at
 * all, and unticking something produces a link that still says what it shows.
 */
export default function CalendarFilters({
  people,
  viewer,
}: {
  people: string[];
  viewer: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const allCalendarKeys = CALENDAR_FILTERS.map((filter) => filter.key);
  const allPeopleKeys = [...people, "__unassigned__"];

  const selected = (key: string, all: string[]): string[] => {
    const raw = params.get(key);
    if (raw === null) return all;
    if (raw === "") return [];
    return raw.split(",").filter((value) => all.includes(value));
  };

  const calendars = selected("cal", allCalendarKeys);
  const owners = selected("who", allPeopleKeys);

  const write = (key: string, values: string[], all: string[]) => {
    const search = new URLSearchParams(params.toString());
    if (values.length === all.length) search.delete(key);
    else search.set(key, values.join(","));
    search.delete("item");
    startTransition(() =>
      router.replace(`${pathname}?${search.toString()}`, { scroll: false })
    );
  };

  const toggle = (key: string, value: string, current: string[], all: string[]) => {
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    write(key, next, all);
  };

  const label = (person: string) =>
    person === "__unassigned__"
      ? "Unassigned"
      : person === viewer
        ? `${person.split("@")[0].replace(/[._-]+/g, " ")} (you)`
        : person.split("@")[0].replace(/[._-]+/g, " ");

  return (
    <aside className="cal-side" data-pending={pending ? "1" : undefined}>
      <div className="cal-side-head">
        <span>Calendars</span>
        <button
          type="button"
          onClick={() => write("cal", allCalendarKeys, allCalendarKeys)}
          disabled={calendars.length === allCalendarKeys.length}
        >
          All
        </button>
      </div>

      <ul className="cal-checks">
        {CALENDAR_FILTERS.map((filter) => (
          <li key={filter.key}>
            <label>
              <input
                type="checkbox"
                checked={calendars.includes(filter.key)}
                onChange={() => toggle("cal", filter.key, calendars, allCalendarKeys)}
              />
              <span className={`cal-swatch ${filter.tone}`} aria-hidden="true" />
              {filter.label}
            </label>
          </li>
        ))}
      </ul>

      <div className="cal-side-head">
        <span>Team members</span>
        <button
          type="button"
          onClick={() => write("who", allPeopleKeys, allPeopleKeys)}
          disabled={owners.length === allPeopleKeys.length}
        >
          All
        </button>
      </div>

      {people.length === 0 ? (
        <p className="cc-note" style={{ margin: "6px 2px 0" }}>
          Nobody has anything assigned yet. Names appear here as work is
          assigned — they are read from the schedule, not typed in.
        </p>
      ) : (
        <ul className="cal-checks">
          {allPeopleKeys.map((person) => (
            <li key={person}>
              <label>
                <input
                  type="checkbox"
                  checked={owners.includes(person)}
                  onChange={() => toggle("who", person, owners, allPeopleKeys)}
                />
                <span className="cal-person" aria-hidden="true" />
                {label(person)}
              </label>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
