/**
 * SEO audit checks.
 *
 *   bash scripts/verify-seo.sh
 *
 * The audit is the half of the SEO screen that works with no external
 * connection, which makes it the half worth testing: a rule has to fire on
 * the case it was written for and stay quiet on the case it was not. Every
 * fixture below is fixed HTML — no network, no database, no Google.
 */

import { parsePage } from "./_libs/seo/parse.ts";
import { evaluate, type AuditPage } from "./_libs/seo/evaluate.ts";
import { healthScore, healthBand } from "./_libs/seo/rules.ts";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : `\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`}`);
};

// ── A realistic Next.js page: real head, an RSC payload in a script, an
//    inline SVG, and a comment — all of which must be excluded from the text.
const GOOD = `<!DOCTYPE html><html lang="en"><head>
<title>Custom Website Design · Tomorrow&#039;s Tech AI</title>
<meta name="description" content="We build the complete digital foundation of a modern business — brand, website, ecommerce, CRM and automation in one connected system."/>
<link rel='canonical' href="https://tomorrowstechai.com/services"/>
<meta property="og:image" content="https://tomorrowstechai.com/og.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X"},{"@type":["Service","Product"],"name":"Y"}]}</script>
<script>self.__next_f.push([1,"lots of payload words here ${"x ".repeat(50)}"])</script>
<style>.a{color:red}</style>
</head><body>
<!-- a comment with words in it -->
<svg><title>icon</title><path d="M0 0"/></svg>
<h1>Custom website design</h1>
<p>${"word ".repeat(320)}</p>
<a href="/about">About</a><a href="https://tomorrowstechai.com/work">Work</a>
<a href="https://google.com">External</a><a href="#top">Anchor</a><a href="mailto:a@b.c">Mail</a>
</body></html>`;

const g = parsePage(GOOD, "https://tomorrowstechai.com/services");
console.log("\n── parse: a well-formed page ──");
eq("title decoded and read", g.title, "Custom Website Design · Tomorrow's Tech AI");
eq("description read", g.description?.slice(0, 24), "We build the complete di");
eq("canonical read through single quotes", g.canonical, "https://tomorrowstechai.com/services");
eq("og:image read", g.ogImage, "https://tomorrowstechai.com/og.png");
eq("h1 read", g.h1, "Custom website design");
eq("h1 counted once", g.h1Count, 1);
eq("@graph types collected, array type flattened", g.jsonldTypes, ["Organization","Product","Service"]);
eq("noindex false when absent", g.noindex, false);
eq("internal links counted, external/anchor/mailto excluded", g.internalLinks, 2);
// 320 words + the h1 (3) + link text (3) = 326-ish; the point is the script
// payload (100+ words) and the SVG title are NOT in it.
eq("script payload and svg excluded from word count", g.wordCount < 340 && g.wordCount > 300, true);

console.log("\n── parse: an empty page ──");
const e = parsePage(`<html><head></head><body></body></html>`, "https://x.com/y");
eq("no title", e.title, null);
eq("no description", e.description, null);
eq("no canonical", e.canonical, null);
eq("no h1", e.h1Count, 0);
eq("no schema", e.jsonldTypes, []);
eq("no words", e.wordCount, 0);

console.log("\n── parse: noindex and malformed schema ──");
const n = parsePage(
  `<html><head><meta name="ROBOTS" content="noindex, nofollow">
   <script type="application/ld+json">{ not json }</script></head>
   <body><h1>A</h1><h1>B</h1></body></html>`, "https://x.com/y");
eq("noindex detected case-insensitively", n.noindex, true);
eq("unparseable JSON-LD counts as absent", n.jsonldTypes, []);
eq("two h1s counted", n.h1Count, 2);

// ── evaluate ──
const page = (over: Partial<AuditPage>): AuditPage => ({
  path: "/p", url: "https://tomorrowstechai.com/p", statusCode: 200, responseMs: 200,
  title: "A perfectly reasonable page title here", description: "x".repeat(120),
  canonical: "https://tomorrowstechai.com/p", ogImage: "/og.png", h1: "H", h1Count: 1,
  wordCount: 900, jsonldTypes: ["Service"], noindex: false, internalLinks: 5, ...over,
});
const codes = (p: Partial<AuditPage>[]) => evaluate(p.map(page)).map(i => `${i.path}:${i.code}`).sort();

console.log("\n── evaluate: a clean page raises nothing ──");
eq("no issues", codes([{}]), []);

console.log("\n── evaluate: each rule fires on its own case ──");
eq("missing title", codes([{ title: null }]), ["/p:missing_title"]);
eq("title too long", codes([{ title: "x".repeat(80) }]), ["/p:title_too_long"]);
eq("title too short", codes([{ title: "Short" }]), ["/p:title_too_short"]);
eq("missing description", codes([{ description: null }]), ["/p:missing_description"]);
eq("description too long", codes([{ description: "x".repeat(200) }]), ["/p:description_too_long"]);
eq("missing canonical", codes([{ canonical: null }]), ["/p:missing_canonical"]);
eq("canonical elsewhere", codes([{ canonical: "https://tomorrowstechai.com/other" }]), ["/p:canonical_mismatch"]);
eq("missing og image", codes([{ ogImage: null }]), ["/p:missing_og_image"]);
eq("missing h1", codes([{ h1Count: 0 }]), ["/p:missing_h1"]);
eq("multiple h1", codes([{ h1Count: 3 }]), ["/p:multiple_h1"]);
eq("thin content", codes([{ wordCount: 120 }]), ["/p:thin_content"]);
eq("no schema", codes([{ jsonldTypes: [] }]), ["/p:no_schema"]);
eq("slow response", codes([{ responseMs: 3000 }]), ["/p:slow_response"]);
eq("noindex on a sitemap page", codes([{ noindex: true }]), ["/p:noindex"]);

console.log("\n── evaluate: canonical comparison is forgiving ──");
eq("www is ignored", codes([{ canonical: "https://www.tomorrowstechai.com/p" }]), []);
eq("trailing slash is ignored", codes([{ canonical: "https://tomorrowstechai.com/p/" }]), []);
eq("protocol is ignored", codes([{ canonical: "http://tomorrowstechai.com/p" }]), []);

console.log("\n── evaluate: a dead page is not also judged on its metadata ──");
eq("only unreachable", codes([{ statusCode: 500, title: null, canonical: null, h1Count: 0 }]), ["/p:unreachable"]);
eq("no response at all", codes([{ statusCode: null }]), ["/p:unreachable"]);

console.log("\n── evaluate: duplicates are a property of the set ──");
const a = (over: Partial<AuditPage>) => ({ path: "/a", url: "https://tomorrowstechai.com/a",
  canonical: "https://tomorrowstechai.com/a", description: "a".repeat(120), ...over });
const bb = (over: Partial<AuditPage>) => ({ path: "/b", url: "https://tomorrowstechai.com/b",
  canonical: "https://tomorrowstechai.com/b", description: "b".repeat(120), ...over });

eq("same title on two pages flags both", codes([
  a({ title: "Identical title used twice here" }),
  bb({ title: "Identical title used twice here" }),
]), ["/a:duplicate_title", "/b:duplicate_title"]);
eq("distinct titles flag neither", codes([
  a({ title: "The first page has this title" }),
  bb({ title: "The second page has another" }),
]), []);
eq("same description on two pages flags both", codes([
  a({ title: "The first page has this title", description: "s".repeat(120) }),
  bb({ title: "The second page has another", description: "s".repeat(120) }),
]), ["/a:duplicate_description", "/b:duplicate_description"]);

console.log("\n── health score ──");
eq("clean site scores 100", healthScore([]), 100);
eq("one critical costs 25", healthScore([{ severity: "critical" }]), 75);
eq("score floors at 0", healthScore(Array(20).fill({ severity: "critical" })), 0);
eq("band boundaries", [healthBand(100).band, healthBand(90).band, healthBand(75).band, healthBand(49).band],
   ["excellent", "excellent", "good", "poor"]);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
