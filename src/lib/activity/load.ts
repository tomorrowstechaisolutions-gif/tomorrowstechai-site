import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeEntries,
  resolveWindow,
  sourcesFor,
  toEntry,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityWindow,
  type Row,
  type SourceSpec,
} from "./core";

/**
 * Activity Center — the half that talks to the database.
 *
 * One small query per log, all at once. Each log is allowed to fail on its
 * own: a broken table costs the page that one log and a line saying so, never
 * the whole feed.
 */

export type SourceReport = {
  key: string;
  label: string;
  module: SourceSpec["module"];
  /** Rows this log contributed before the merge was trimmed. null = it failed. */
  rows: number | null;
};

export type ActivityResult = {
  items: ActivityEntry[];
  hasMore: boolean;
  window: ActivityWindow;
  sources: SourceReport[];
  /** Labels of the logs that could not be read this time. */
  failed: string[];
};

async function readSource(
  sb: SupabaseClient,
  spec: SourceSpec,
  window: ActivityWindow,
  limit: number
): Promise<ActivityEntry[]> {
  let query = sb
    .from(spec.table)
    .select(spec.select)
    // Postgres sorts nulls first when descending; a row with no time is not
    // an event that happened "most recently".
    .not(spec.timeCol, "is", null)
    .order(spec.timeCol, { ascending: false })
    .limit(limit);

  for (const [column, value] of spec.where ?? []) query = query.eq(column, value);
  if (window.fromIso) query = query.gte(spec.timeCol, window.fromIso);
  if (window.toIso) query = query.lt(spec.timeCol, window.toIso);

  const { data, error } = await query;
  if (error) throw new Error(`${spec.table}: ${error.message}`);

  const entries: ActivityEntry[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const entry = toEntry(spec, row);
    if (entry) entries.push(entry);
  }
  return entries;
}

export async function loadActivityCenter(
  sb: SupabaseClient,
  filters: ActivityFilters,
  now: Date = new Date()
): Promise<ActivityResult> {
  const window = resolveWindow(filters, now);
  const specs = sourcesFor(filters.module);

  const settled = await Promise.allSettled(
    specs.map((spec) => readSource(sb, spec, window, filters.limit))
  );

  const lists: ActivityEntry[][] = [];
  const sources: SourceReport[] = [];
  const failed: string[] = [];

  settled.forEach((outcome, index) => {
    const spec = specs[index];
    if (outcome.status === "fulfilled") {
      lists.push(outcome.value);
      sources.push({ key: spec.key, label: spec.label, module: spec.module, rows: outcome.value.length });
    } else {
      // The real error goes to the server log; the page gets the log's name.
      console.error(`[activity:${spec.key}]`, outcome.reason);
      failed.push(spec.label);
      sources.push({ key: spec.key, label: spec.label, module: spec.module, rows: null });
    }
  });

  return { ...mergeEntries(lists, filters.limit), window, sources, failed };
}
