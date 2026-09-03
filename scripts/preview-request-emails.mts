/**
 * Renders every client action request email to .preview/requests/ so the
 * templates can be looked at instead of being reviewed by sending real mail
 * to a real client.
 *
 * Sample data is the Stripe request as it would actually go to Cory — the
 * first one of these ever sent — plus the same request in the three other
 * states it can be in.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { REQUEST_TEMPLATES, getTemplate } from "./_libs/requests/config.ts";
import {
  buildRequestEmail, buildReminderEmail, buildRequestCompletedEmail,
  buildRequestAdminEmail,
} from "./_libs/requests/email-content.ts";

const OUT = ".preview/requests";
mkdirSync(OUT, { recursive: true });

const url = "https://tomorrowstechai.com/action/8fmQgKOINflqFgThVcr9gWMZ6jTUvFOVjSN9y1bVU28";

const base = {
  id: "3a1f0b7e-2c4d-4f8a-9e11-77c0a9d5b201",
  customer_id: "09ed4d35-736c-4031-9fe6-de4c1aff0768",
  lead_id: null,
  job_id: null,
  proposal_id: null,
  template_key: "stripe_account",
  title: "Set up your Stripe account",
  summary: null,
  token: "8fmQgKOINflqFgThVcr9gWMZ6jTUvFOVjSN9y1bVU28",
  token_expires_at: "2026-11-02T12:00:00.000Z",
  status: "sent",
  to_email: "corywiththekeys@gmail.com",
  to_name: "Cory Simek",
  note: null,
  due_at: "2026-09-10T12:00:00.000Z",
  delivered: true,
  sent_at: "2026-09-03T15:00:00.000Z",
  first_opened_at: null,
  last_opened_at: null,
  completed_at: null,
  canceled_at: null,
  reminder_count: 0,
  last_reminded_at: null,
  steps_done: [] as string[],
  payload: {} as Record<string, string>,
  created_at: "2026-09-03T15:00:00.000Z",
  updated_at: "2026-09-03T15:00:00.000Z",
} as unknown as Parameters<typeof buildRequestEmail>[0];

const stripe = getTemplate("stripe_account")!;
const domain = getTemplate("domain_access")!;
const content = getTemplate("content_photos")!;

const withNote = {
  ...base,
  note:
    "Cory — this is the Stripe bit we talked through on the phone. Twenty minutes and " +
    "then the deposit page can go live. Call me if anything on it looks odd.",
} as typeof base;

const started = {
  ...base,
  status: "started",
  steps_done: ["create", "bank"],
  first_opened_at: "2026-09-04T18:20:00.000Z",
  last_opened_at: "2026-09-04T18:41:00.000Z",
  updated_at: "2026-09-04T18:41:00.000Z",
} as typeof base;

const finished = {
  ...started,
  status: "completed",
  steps_done: ["create", "bank", "invite", "verify"],
  completed_at: "2026-09-05T14:02:00.000Z",
  payload: {
    account_email: "corywiththekeys@gmail.com",
    legal_business_name: "The Key Konnect LLC",
    statement_descriptor: "KEY KONNECT",
    activation_state: "Fully set up and verified",
    confirm_invited: "yes",
    confirm_no_secrets: "yes",
  },
} as typeof base;

const cases = [
  ["01-stripe", buildRequestEmail(base, stripe, url)],
  ["02-stripe-with-note", buildRequestEmail(withNote, stripe, url)],
  ["03-domain", buildRequestEmail(base, domain, url)],
  ["04-content", buildRequestEmail(base, content, url)],
  ["05-reminder-cold", buildReminderEmail(base, stripe, url)],
  ["06-reminder-started", buildReminderEmail(started, stripe, url)],
  ["07-receipt", buildRequestCompletedEmail(finished, stripe, url)],
  ["08-admin-completed", buildRequestAdminEmail("completed", finished, stripe)],
  ["09-admin-opened", buildRequestAdminEmail("opened", started, stripe)],
] as const;

for (const [name, built] of cases) {
  writeFileSync(`${OUT}/${name}.html`, built.html, "utf-8");
  writeFileSync(`${OUT}/${name}.txt`, `Subject: ${built.subject}\n\n${built.text}`, "utf-8");
  const bytes = Buffer.byteLength(built.html, "utf-8");
  const clipped = bytes > 102_000 ? "  ** OVER GMAIL'S 102 KB CLIP LIMIT **" : "";
  console.log(`${name.padEnd(22)} ${String(bytes).padStart(6)} bytes html${clipped}`);
  console.log(`${"".padEnd(22)} subject: ${built.subject}`);
}

/**
 * The double-quote trap, checked rather than remembered. A double quote inside
 * an inline style closes the attribute early and every declaration after it is
 * silently dropped — the message still renders, it just renders unstyled.
 */
function styleAttributesAreIntact(html: string): boolean {
  const re = /style="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const next = html[m.index + m[0].length];
    if (next !== undefined && !/[\s>/]/.test(next)) return false;
  }
  return true;
}

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

console.log("");
for (const [name, built] of cases) {
  const isAdmin = name.startsWith("08") || name.startsWith("09");
  check(`${name}: has a subject`, built.subject.length > 10);
  check(`${name}: has a text alternative`, built.text.trim().length > 100);
  check(
    `${name}: no unescaped template holes`,
    !built.html.includes("undefined") && !built.html.includes("[object")
  );
  check(`${name}: never links to /admin`, !built.html.includes("/admin"));
  if (!isAdmin) check(`${name}: carries the client's link`, built.html.includes(url));
  check(`${name}: no style attribute closes early`, styleAttributesAreIntact(built.html));
}

/**
 * The rule the whole feature rests on: we never ask a client for a secret.
 * config.ts refuses to build such a template at module load, and this asserts
 * the guard is actually wired to every template rather than trusting that it
 * threw for the ones that happen to be previewed here.
 */
const SECRET = /pass(word|phrase)|api[\s_-]?key|routing[\s_-]?number|\bcvv\b/i;
for (const t of REQUEST_TEMPLATES) {
  // Fields only, exactly like the guard in config.ts. The confirmation boxes
  // are checked against nothing on purpose: Stripe's says "I understand you
  // will never ask for my password", which is the anti-phishing line and the
  // one place the word is supposed to appear.
  const asked = t.fields.map((f) => `${f.key} ${f.label}`);
  check(
    `${t.key}: asks for no credentials`,
    !asked.some((a) => SECRET.test(a))
  );
}

console.log(fails === 0 ? "\nAll structural checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
