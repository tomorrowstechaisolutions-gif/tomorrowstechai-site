/**
 * Catches function props crossing from a server component into a client one.
 *
 * `next build` does not catch this. The page compiles, deploys, and then
 * answers 500 on every request with "Functions cannot be passed directly to
 * Client Components" — which is exactly how /admin/calendar shipped broken:
 * CalendarBoard (server) handed its `itemHref` closure to TimeGrid
 * ("use client"). The two sibling grids render on the server, so the same
 * prop was harmless on them, which is what made it easy to miss.
 *
 * Server actions are exempt: a function from a "use server" module is
 * exactly what React knows how to send across.
 *
 *   node scripts/verify-boundaries.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
})("src");

const isClientFile = (source) => /^\s*["']use client["'];?/m.test(source.slice(0, 200));

/** Component name → file, for every "use client" module. */
const clientComponents = new Map();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (isClientFile(source)) clientComponents.set(basename(file).replace(/\.tsx?$/, ""), file);
}

/** Everything exported from a "use server" module may cross freely. */
const serverActions = new Set();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (!/^\s*["']use server["'];?/m.test(source.slice(0, 120))) continue;
  for (const match of source.matchAll(/export async function (\w+)/g)) serverActions.add(match[1]);
}

let problems = 0;
for (const file of files) {
  if (!file.endsWith(".tsx")) continue;
  const source = readFileSync(file, "utf8");
  if (isClientFile(source)) continue; // client → client is fine

  const declared = new Set([
    ...[...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/g)].map((m) => m[1]),
    ...[...source.matchAll(/^\s*function\s+(\w+)/gm)].map((m) => m[1]),
  ]);

  for (const name of clientComponents.keys()) {
    const usage = new RegExp(`<${name}\\b([\\s\\S]{0,900}?)/?>`, "g");
    for (const match of source.matchAll(usage)) {
      for (const prop of match[1].matchAll(/(\w+)=\{(\w+)\}/g)) {
        const [, propName, value] = prop;
        if (declared.has(value) && !serverActions.has(value)) {
          console.log(`FAIL  ${file}\n      <${name} ${propName}={${value}}> — ${value} is a function and ${name} is a client component.`);
          problems++;
        }
      }
    }
  }
}

console.log(
  problems === 0
    ? "PASS  No function props cross a server → client boundary."
    : `\n${problems} problem(s). Pass the data the client needs instead, and let it build the value itself.`
);
process.exit(problems === 0 ? 0 : 1);
