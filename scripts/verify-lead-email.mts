import { SIGNATURE, activityBody, checkDraft, emailBlock, leadEmailTemplates } from "./_libs/direct-email.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(52)} got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`);
};

const lead = { first_name: "alex", business_name: null, email: "alex@example.com", do_not_contact: false, unsubscribed_at: null };

// Templates
const t = leadEmailTemplates(lead);
eq("four templates", t.length, 4);
eq("greeting capitalises the typed name", t[1].body.startsWith("Hi Alex,"), true);
eq("every template carries the visible signature", t.every((x) => x.body.includes(SIGNATURE)), true);
eq("no business name -> no 'for null'", t.some((x) => x.body.includes("null")), false);
eq("business name used when present", leadEmailTemplates({ ...lead, business_name: "Acme Roofing" })[1].body.includes("for Acme Roofing"), true);
eq("empty first name -> plain Hi,", leadEmailTemplates({ ...lead, first_name: "" })[0].body.startsWith("Hi,"), true);

// Who can be emailed
eq("normal lead is allowed", emailBlock(lead).blocked, false);
eq("do-not-contact is blocked", emailBlock({ ...lead, do_not_contact: true }).blocked, true);
eq("missing email is blocked", emailBlock({ ...lead, email: "" }).blocked, true);
eq("malformed email is blocked", emailBlock({ ...lead, email: "not-an-email" }).blocked, true);
const unsub = emailBlock({ ...lead, unsubscribed_at: "2026-11-01T00:00:00Z" });
eq("unsubscribed is allowed with a warning", !unsub.blocked && !!unsub.warning, true);

// Drafts
eq("empty subject rejected", checkDraft("  ", "Hello there").ok, false);
eq("empty body rejected", checkDraft("Hi", "   ").ok, false);
eq("untouched blank template rejected", checkDraft("Hello", t[0].body).ok, false);
eq("filled template accepted", checkDraft("Following up", t[1].body).ok, true);
const inj = checkDraft("Hi\r\nBcc: victim@example.com", "Real message");
eq("newlines in subject are flattened (no header injection)", inj.ok && !/[\r\n]/.test(inj.subject), true);
eq("subject over 160 chars rejected", checkDraft("x".repeat(161), "Body").ok, false);
eq("body over 10,000 chars rejected", checkDraft("Hi", "x".repeat(10_001)).ok, false);
eq("CRLF in body normalised", (checkDraft("Hi", "a\r\nb") as { body: string }).body, "a\nb");
eq("activity line includes subject and text", activityBody("S", "B"), "Subject: S\n\nB");

console.log(fails ? `\n${fails} FAILED` : "\nAll checks passed.");
process.exit(fails ? 1 : 0);
