/**
 * An in-memory stand-in for the Supabase query builder, for tests.
 *
 * It implements the calls the server code under test actually makes: select,
 * insert, update, upsert (with onConflict / ignoreDuplicates), delete and the
 * filters eq, neq, is, in, lte, gt, gte, lt, ilike, plus order, limit,
 * maybeSingle and single. Rows live in plain arrays so a test can read them back.
 *
 * `failNext(table, op)` makes the next matching call return a database error
 * once, which is how a test plays out "the write failed, then the retry ran".
 *
 * It is not Postgres: no constraints, no triggers, no joins. A test that
 * needs one of those is testing the database, not this code.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
type Op = "select" | "insert" | "update" | "upsert" | "delete";

/** Numbers compare as numbers; anything else (ISO timestamps, dates) as text. */
function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a ?? "");
  const y = String(b ?? "");
  return x < y ? -1 : x > y ? 1 : 0;
}

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
    const sorts: { col: string; asc: boolean }[] = [];
    let cap: number | null = null;

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

      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "delete") {
        for (const r of matched) rows.splice(rows.indexOf(r), 1);
        return { data: matched, error: null, count: null };
      }
      if (sorts.length) {
        matched = [...matched].sort((a, b) => {
          for (const srt of sorts) {
            const d = cmp(a[srt.col], b[srt.col]);
            if (d !== 0) return srt.asc ? d : -d;
          }
          return 0;
        });
      }
      const total = matched.length;
      if (cap !== null && op === "select") matched = matched.slice(0, cap);
      if (op === "update") {
        for (const r of matched) Object.assign(r, values as Row);
      }
      return { data: head ? null : matched, error: null, count: wantCount ? total : null };
    };

    const q = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) head = true;
        if (opts?.count) wantCount = true;
        return q;
      },
      insert(v: Row | Row[]) { op = "insert"; values = v; return q; },
      update(v: Row) { op = "update"; values = v; return q; },
      delete() { op = "delete"; return q; },
      upsert(v: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = "upsert"; values = v; upsertOpts = opts; return q;
      },
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return q; },
      neq(col: string, val: unknown) { filters.push((r) => r[col] !== val); return q; },
      is(col: string, val: unknown) { filters.push((r) => (r[col] ?? null) === val); return q; },
      in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return q; },
      lte(col: string, val: number | string) { filters.push((r) => cmp(r[col] ?? (typeof val === "number" ? 0 : ""), val) <= 0); return q; },
      lt(col: string, val: number | string) { filters.push((r) => cmp(r[col] ?? (typeof val === "number" ? 0 : ""), val) < 0); return q; },
      gte(col: string, val: number | string) { filters.push((r) => cmp(r[col] ?? (typeof val === "number" ? 0 : ""), val) >= 0); return q; },
      gt(col: string, val: number | string) { filters.push((r) => cmp(r[col] ?? (typeof val === "number" ? 0 : ""), val) > 0); return q; },
      ilike(col: string, val: string) {
        const want = val.replace(/\\(.)/g, "$1").toLowerCase();
        filters.push((r) => String(r[col] ?? "").toLowerCase() === want);
        return q;
      },
      order(col: string, opts: { ascending?: boolean } = {}) { sorts.push({ col, asc: opts.ascending !== false }); return q; },
      limit(n: number) { cap = n; return q; },
      async maybeSingle() { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      async single() { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then<T>(resolve: (v: ReturnType<typeof run>) => T) { return Promise.resolve(run()).then(resolve); },
    };
    return q;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stands in for SupabaseClient in tests
  return { db: { from } as any, tables, failNext };
}
