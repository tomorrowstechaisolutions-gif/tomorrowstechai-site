/**
 * Renders every proposal email to .preview/emails/ so the templates can be
 * looked at instead of being reviewed by sending real mail to a real client.
 *
 * Sample data is the live Key Konnect draft, so what comes out is what Cory
 * would actually receive.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildProposalEmail, buildSignedEmail, buildPaymentEmail, buildAdminEmail,
} from "./_libs/email-content.ts";

const OUT = ".preview/emails";
mkdirSync(OUT, { recursive: true });

const url = "https://tomorrowstechai.com/proposal/8fmQgKOINflqFgThVcr9gWMZ6jTUvFOVjSN9y1bVU28";

const proposal = {
  id: "09ed4d35-736c-4031-9fe6-de4c1aff0768",
  proposal_number: "TT-2026-0001",
  title: "The Key Konnect website launch",
  package_name: "Classic Business Website",
  client_business_name: "The Key Konnect",
  client_contact_name: "Cory Simek",
  client_email: "corywiththekeys@gmail.com",
  currency: "USD",
  total_cents: 39900,
  recurring_price_cents: 2900,
  recurring_interval: "month",
  deposit_amount_cents: 0,
  payment_mode: "full",
  amount_paid_cents: 0,
  valid_until: "2026-09-16",
} as unknown as Parameters<typeof buildProposalEmail>[0];

const signature = {
  signer_name: "Cory Simek",
  signer_email: "corywiththekeys@gmail.com",
  agreement_version: "1.0",
  signed_at: "2026-09-03T16:24:00.000Z",
} as unknown as Parameters<typeof buildSignedEmail>[1];

const note =
  "Cory — everything we went through on Messenger is in here, including the bit about the partner lots being out of scope for now. Shout if anything reads wrong.";

const cases = [
  ["01-proposal", buildProposalEmail(proposal, url, note)],
  ["02-proposal-no-note", buildProposalEmail(proposal, url)],
  ["03-signed", buildSignedEmail(proposal, signature, url)],
  ["04-paid", buildPaymentEmail(proposal, 39900, url, "https://pay.stripe.com/receipts/example")],
  ["05-admin-signed", buildAdminEmail("signed", proposal, "Signed from 172.58.x.x on a phone.")],
  ["06-admin-viewed", buildAdminEmail("viewed", proposal)],
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
 * Catches a whole class of silent breakage: a double quote inside an inline
 * style closes the attribute early, and every declaration after it is parsed
 * as stray attributes and dropped. It cost a full round of screenshots to
 * find once — a font stack written with "Segoe UI" instead of 'Segoe UI' —
 * so it is checked rather than remembered.
 *
 * After a style attribute's closing quote the next character must be `>`,
 * whitespace, or `/`. A letter there means the quote was not the real end.
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

// Cheap structural checks. Not a rendering test — those need a real client —
// but enough to catch a template that lost its link or its text alternative.
let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

console.log("");
for (const [name, built] of cases) {
  const isAdmin = name.startsWith("05") || name.startsWith("06");
  check(`${name}: has a subject`, built.subject.length > 10);
  check(`${name}: has a text alternative`, built.text.trim().length > 100);
  check(`${name}: no unescaped template holes`, !built.html.includes("undefined") && !built.html.includes("[object"));
  check(`${name}: never links to /admin`, !built.html.includes("/admin"));
  if (!isAdmin) check(`${name}: carries the client's link`, built.html.includes(url));
  check(`${name}: no style attribute closes early`, styleAttributesAreIntact(built.html));
}
console.log(fails === 0 ? "\nAll structural checks passed." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
