/**
 * Write a review document for a batch of daily social posts, with every card
 * image rendered beside it, so John can read the whole month in one place
 * before it is loaded.
 *
 *   npx tsx --require ./scripts/shims/allow-server-only.cjs scripts/social-batch-review.mts <slug>
 *
 * Output goes to "Claude outputs/social-batch-<slug>/". Notes for each post
 * (where its facts come from, anything John needs to confirm) are read from
 * src/content/social/<slug>.notes.json when that file exists.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getBatch, SOCIAL_BATCHES } from "../src/content/social/index";
import { postScheduledAt, validateBatch } from "../src/lib/social/batch";
import { renderCardJpeg } from "../src/lib/social/card";

type Note = { theme?: string; source?: string; confirm?: string };

const slug = process.argv[2];
const batch = slug ? getBatch(slug) : null;
if (!batch) {
  console.error(`Give a batch slug. Batches: ${Object.keys(SOCIAL_BATCHES).join(", ") || "none"}`);
  process.exit(1);
}

const problems = validateBatch(batch);
const notesPath = join("src", "content", "social", `${batch.slug}.notes.json`);
const notes: Record<string, Note> = existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, "utf8")) : {};

const out = join("Claude outputs", `social-batch-${batch.slug}`);
mkdirSync(join(out, "cards"), { recursive: true });

const day = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

const toConfirm = batch.posts.filter((p) => notes[p.id]?.confirm);
const lines: string[] = [
  `# ${batch.name}: daily social posts for review`,
  "",
  `${batch.posts.length} posts, ${day(batch.posts[0].date)} to ${day(batch.posts[batch.posts.length - 1].date)}, one a day at ${time(postScheduledAt(batch, batch.posts[0]))} Central, on LinkedIn, Facebook and Instagram.`,
  "",
  problems.length ? `**The batch has ${problems.length} problem(s) and cannot be loaded yet:**\n${problems.map((x) => `- ${x}`).join("\n")}` : "The batch passes every automatic check (length, no emoji, no exclamation marks, no duplicate days).",
  "",
  "## How to review",
  "",
  "Read each post. Tell Claude the id and what to change, cut or replace (for example: \"d12 cut\", \"d06 add that she told me to call Chris first\"). Nothing is scheduled until you approve.",
  "",
];
if (toConfirm.length) {
  lines.push("## Needs your answer before loading", "", "| Post | Day | What to confirm |", "|---|---|---|");
  for (const p of toConfirm) lines.push(`| ${p.id} | ${day(p.date)} | ${notes[p.id].confirm} |`);
  lines.push("");
}
lines.push("## The month at a glance", "", "| Post | Day | Theme | Card line | Link |", "|---|---|---|---|---|");
for (const p of batch.posts) lines.push(`| ${p.id} | ${day(p.date)} | ${notes[p.id]?.theme ?? ""} | ${p.cardLine} | ${p.link ? "yes" : ""} |`);
lines.push("", "## The posts", "");

for (const p of batch.posts) {
  const n = notes[p.id] ?? {};
  const file = `cards/${p.id}.jpg`;
  if (!p.image) writeFileSync(join(out, file), await renderCardJpeg(p.cardLine));
  lines.push(
    `### ${p.id} · ${day(p.date)}${n.theme ? ` · ${n.theme}` : ""}`,
    "",
    p.image ? `Image: ${p.image}` : `![${p.cardLine}](${file})`,
    "",
    ...p.text.split("\n").map((l) => `> ${l}`),
    "",
    p.link ? `Link (added at the end of the text): ${p.link.split("?")[0]}` : "No link.",
    "",
    `${p.text.length + (p.link ? p.link.length + 2 : 0)} characters.${n.source ? ` Facts from: ${n.source}` : ""}`,
    ...(n.confirm ? ["", `**Confirm:** ${n.confirm}`] : []),
    ""
  );
}

writeFileSync(join(out, "REVIEW.md"), lines.join("\n"));
console.log(`Wrote ${join(out, "REVIEW.md")} and ${batch.posts.filter((p) => !p.image).length} card image(s).${problems.length ? ` ${problems.length} problem(s) listed at the top.` : ""}`);
