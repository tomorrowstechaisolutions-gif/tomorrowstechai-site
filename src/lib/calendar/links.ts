/**
 * Every URL the calendar builds, in one place.
 *
 * These used to be closures defined inside CalendarBoard and handed down as
 * props. That is fine for MonthGrid and AgendaList, which render on the
 * server — and it crashes the page for TimeGrid, which is a client
 * component. A function cannot cross the server/client boundary, and Next
 * only discovers it at request time: `next build` passes clean and
 * production answers 500 with "Functions cannot be passed directly to
 * Client Components".
 *
 * Plain functions over a query string serialise fine, so the grids now take
 * `query` and build their own links. Both sides call the same code, so a
 * link cannot drift between the server-rendered month view and the
 * client-rendered week view.
 *
 * No "server-only" here, deliberately — client components import it.
 */

/** The drawer link for one item. Keeps every other filter in the URL. */
export function itemHref(query: string, itemId: string): string {
  const params = new URLSearchParams(query);
  params.set("item", itemId);
  return `/admin/calendar?${params.toString()}`;
}

/** Jump to a single day. Drops any open drawer, because it is a new view. */
export function dayHref(query: string, day: string): string {
  const params = new URLSearchParams(query);
  params.set("view", "day");
  params.set("anchor", day);
  params.delete("item");
  return `/admin/calendar?${params.toString()}`;
}

/** The agenda, at whatever the current anchor is. */
export function agendaHref(query: string): string {
  const params = new URLSearchParams(query);
  params.set("view", "agenda");
  params.delete("item");
  return `/admin/calendar?${params.toString()}`;
}
