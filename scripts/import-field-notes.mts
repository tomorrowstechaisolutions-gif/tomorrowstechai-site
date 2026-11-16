/**
 * One-time import: copy the articles in src/content/posts.ts into
 * public.field_notes_articles so they can be managed from the Admin Center.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/import-field-notes.mts           (dry run)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/import-field-notes.mts --apply   (writes)
 *
 * Only ever inserts. An article whose slug already exists in the database is
 * skipped, so re-running can never overwrite edits made in the admin. Each
 * imported article also gets a first revision ("Imported from code").
 */
import { createClient } from "@supabase/supabase-js";
import { fileArticles } from "../src/content/posts";
import { ARTICLES_TABLE, REVISIONS_TABLE, recordToRow } from "../src/lib/blog/db-articles";
import { validateArticles } from "../src/lib/blog/validate";

const apply = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const errors = validateArticles(fileArticles.map((a) => ({ ...a, origin: "file" as const }))).filter((i) => i.level === "error");
if (errors.length) {
  console.error("File articles have editorial errors; fix them first:", errors);
  process.exit(1);
}

const { data: existing, error: readErr } = await db.from(ARTICLES_TABLE).select("slug");
if (readErr) {
  console.error(`Cannot read ${ARTICLES_TABLE}: ${readErr.message}. Has the migration been applied?`);
  process.exit(1);
}
const have = new Set((existing ?? []).map((r: { slug: string }) => r.slug));

let added = 0;
for (const a of fileArticles) {
  if (have.has(a.slug)) {
    console.log(`skip   ${a.slug} (already in the database)`);
    continue;
  }
  const row = { ...recordToRow({ ...a, origin: "database" }), created_by: "import", updated_by: "import" };
  if (!apply) {
    console.log(`would  ${a.slug} [${a.status}]`);
    continue;
  }
  const { data, error } = await db.from(ARTICLES_TABLE).insert(row).select("id").single();
  if (error) {
    console.error(`FAILED ${a.slug}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }
  await db.from(REVISIONS_TABLE).insert({ article_id: data.id, snapshot: row, note: "Imported from code", actor: "import" });
  console.log(`added  ${a.slug} [${a.status}]`);
  added++;
}
console.log(apply ? `\nImported ${added} article(s).` : "\nDry run. Re-run with --apply to write.");
