/**
 * An in-memory stand-in for the Supabase query builder, for tests.
 *
 * It implements the calls the server code under test actually makes: select,
 * insert, update, upsert (with onConflict / ignoreDuplicates) and the filters
 * eq, neq, is, in, lte, gt, gte, lt, ilike, plus order, limit, maybeSingle
 * and single. Rows live in plain arrays so a test can read them back.
 *
 * `failNext(table, op)` makes the next matching call return a database error
 * once, which is how a test plays out "the write failed, then the retry ran".
 *
 * It is not Postgres: no constraints, no triggers, no joins. A test that
 * needs one of those is testing the database, not this code.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
type Op = "select" | "insert" | "update" | "upsert";

export function fakeSupabase(initial: Tables = {}) {
  const tables: Tables = initial;
  const failures: { table: string; op: Op; message: string }[] = [];
  let nextId = 1;

  function failNext(table: string, op: Op, message = "simulated database error") {
    failures.push({ table, op, message });
  }

  function takeFailure(table: string, op: Op) {
    const i = failures.findIndex((f) => f.table === table && f.op === op);
    return i === -1 ? null : failures.splice(i, 1)[0];
  }

  function from(table: string) {
    const rows = (tables[table] ??= []);
    let op: Op = "select";
    let values: Row | Row[] = {};
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let head = false;
    let wantCount = false;
    const filters: ((r: Row) => boolean)[] = [];

    const run = (): { data: Row[] | null; error: { message: string; code?: string } | null; count: number | null } => {
      const failure = takeFailure(table, op);
      if (failure) return { data: null, error: { message: failure.message, code: "XX000" }, count: null };

      if (op === "insert") {
        const list = (Array.isArray(values) ? values : [values]).map((v) => ({ id: `${table}-${nextId++}`, ...v }));
        rows.push(...list);
        return { data: list, error: null, count: null };
      }

      if (op === "upsert") {
        const written: Row[] = [];
        for (const v of Array.isArray(values) ? values : [values]) {
          const key = upsertOpts.onConflict;
          const existing = key ? rows.find((r) => r[key] === v[key]) : undefined;
          if (existing) {
            if (!upsertOpts.ignoreDuplicates) {
              Object.assign(existing, v);
              written.push(existing);
            }
          } else {
            const row = { id: `${table}-${nextId++}`, ...v };
            rows.push(row);
            written.push(row);
          }
        }
        return { data: written, error: null, count: null };
      }

      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, values as Row);
      }
      return { data: head ? null : matched, error: null, count: wantCount ? matched.length : null };
    };

    const q = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) head = true;
        if (opts?.count) wantCount = true;
        return q;
      },
      insert(v: Row | Row[]) { op = "insert"; values = v; return q; },
      update(v: Row) { op = "update"; values = v; return q; },
      upsert(v: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = "upsert"; values = v; upsertOpts = opts; return q;
      },
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return q; },
      neq(col: string, val: unknown) { filters.push((r) => r[col] !== val); return q; },
      is(col: string, val: unknown) { filters.push((r) => (r[col] ?? null) === val); return q; },
      in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return q; },
      lte(col: string, val: number) { filters.push((r) => Number(r[col] ?? 0) <= val); return q; },
      lt(col: string, val: number) { filters.push((r) => Number(r[col] ?? 0) < val); return q; },
      gte(col: string, val: number) { filters.push((r) => Number(r[col] ?? 0) >= val); return q; },
      gt(col: string, val: number) { filters.push((r) => Number(r[col] ?? 0) > val); return q; },
      ilike(col: string, val: string) {
        const want = val.replace(/\\(.)/g, "$1").toLowerCase();
        filters.push((r) => String(r[col] ?? "").toLowerCase() === want);
        return q;
      },
      order() { return q; },
      limit() { return q; },
      async maybeSingle() { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      async single() { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then<T>(resolve: (v: ReturnType<typeof run>) => T) { return Promise.resolve(run()).then(resolve); },
    };
    return q;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stands in for SupabaseClient in tests
  return { db: { from } as any, tables, failNext };
}
