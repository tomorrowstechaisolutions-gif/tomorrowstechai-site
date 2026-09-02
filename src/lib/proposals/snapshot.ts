import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney } from "./pricing";
import { OWNERSHIP_SUMMARY, ACCEPTANCE_CHECKS } from "./config";
import type { FullProposal, ProposalSignature } from "./types";

/**
 * The signed document snapshot.
 *
 * When a proposal is signed, the exact document the signer saw is frozen into
 * a single self-contained HTML file, hashed with SHA-256, and written once to
 * a private bucket. Nothing about it is ever rewritten: the database trigger
 * in 0016 refuses to change the path or the hash, and the bucket has no
 * update policy.
 *
 * Deliberately NOT a React render of the public page. That page will keep
 * changing; this file has to keep saying what it said on the day. It is also
 * why this is plain HTML with inline styles rather than a link to a
 * stylesheet that could be edited afterwards.
 *
 * The file prints cleanly to PDF from any browser, which is what "download
 * the signed copy" gives you. The audit record that actually matters is the
 * proposal_signatures row; this is the human-readable companion to it.
 */

const BUCKET = "proposal-documents";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Preserves the paragraph breaks a textarea produced. */
function paragraphs(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }) + " (US Central)";
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Renders the frozen document. Pure — same inputs, same bytes, which is what
 * makes the hash worth recording.
 */
export function renderSignedDocument(
  full: FullProposal,
  signature: ProposalSignature
): string {
  const { proposal: p, items, sections, agreement } = full;

  const byType = (type: string) => items.filter((i) => i.item_type === type);
  const money = (cents: number) => formatMoney(cents, p.currency);

  const list = (title: string, rows: typeof items) =>
    rows.length === 0
      ? ""
      : `<h2>${esc(title)}</h2><ul class="lines">${rows
          .map(
            (row) =>
              `<li><b>${esc(row.title)}</b>${
                row.description ? `<span>${esc(row.description)}</span>` : ""
              }${
                row.is_billable && row.total_price_cents > 0
                  ? `<em>${esc(money(row.total_price_cents))}</em>`
                  : ""
              }${row.is_optional ? `<i>Optional — not included in the total</i>` : ""}</li>`
          )
          .join("")}</ul>`;

  const ownershipBlock = (block: { heading: string; items: readonly string[] }) =>
    `<h3>${esc(block.heading)}</h3><ul class="lines">${block.items
      .map((line) => `<li><b>${esc(line)}</b></li>`)
      .join("")}</ul>`;

  const agreementBlock = agreement
    ? `
      <h2>${esc(agreement.title)} — version ${esc(agreement.version)}</h2>
      ${agreement.intro ? paragraphs(agreement.intro) : ""}
      ${agreement.sections
        .map(
          (section) => `
            <h3>${esc(section.n)}. ${esc(section.heading)}</h3>
            ${(section.paragraphs ?? []).map((t) => `<p>${esc(t)}</p>`).join("")}
            ${
              (section.bullets ?? []).length
                ? `<ul class="bullets">${section.bullets
                    .map((b) => `<li>${esc(b)}</li>`)
                    .join("")}</ul>`
                : ""
            }`
        )
        .join("")}
      ${
        agreement.ownership_rows.length
          ? `<h3>Exhibit B — Ownership at a glance</h3>
             <table><thead><tr><th>Asset / information</th><th>Who owns it</th><th>Typical treatment</th></tr></thead>
             <tbody>${agreement.ownership_rows
               .map(
                 (row) =>
                   `<tr><td>${esc(row.asset)}</td><td>${esc(row.owner)}</td><td>${esc(
                     row.treatment
                   )}</td></tr>`
               )
               .join("")}</tbody></table>`
          : ""
      }`
    : `<p class="warn">No agreement version was attached to this proposal.</p>`;

  const dueNow =
    p.payment_mode === "invoice_later"
      ? "Nothing due at signature — invoiced per the terms below."
      : p.payment_mode === "full"
        ? `${money(p.total_cents)} due at signature`
        : `${money(p.deposit_amount_cents)} deposit due at signature, ${money(
            Math.max(0, p.total_cents - p.deposit_amount_cents)
          )} balance to follow`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(p.proposal_number)} — signed agreement — ${esc(
    p.client_business_name || p.client_contact_name || "Client"
  )}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5f7; color: #16202e;
         font: 15px/1.65 ui-serif, Georgia, "Times New Roman", serif; }
  .sheet { max-width: 820px; margin: 0 auto; padding: 56px 60px 72px; background: #fff; }
  header { border-bottom: 2px solid #16202e; padding-bottom: 20px; margin-bottom: 32px; }
  .brand { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px;
           letter-spacing: .16em; text-transform: uppercase; color: #2563eb; font-weight: 700; }
  h1 { margin: 12px 0 6px; font-size: 27px; line-height: 1.2; }
  .meta { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12.5px; color: #55637a; }
  h2 { margin: 36px 0 10px; font-size: 18px; border-bottom: 1px solid #d7dce4; padding-bottom: 6px; }
  h3 { margin: 22px 0 6px; font-size: 15px; }
  p { margin: 0 0 11px; }
  ul.lines { list-style: none; margin: 0; padding: 0; }
  ul.lines li { padding: 9px 0; border-bottom: 1px solid #edeff3; }
  ul.lines b { display: block; }
  ul.lines span { display: block; color: #55637a; font-size: 14px; }
  ul.lines em { display: block; font-style: normal; font-weight: 700; }
  ul.lines i { display: block; font-style: normal; font-size: 12.5px; color: #8892a4; }
  ul.bullets { margin: 6px 0 12px 18px; padding: 0; }
  ul.bullets li { margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 13.5px; }
  th, td { border: 1px solid #d7dce4; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f0f2f6; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px;
       text-transform: uppercase; letter-spacing: .05em; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
  .card { border: 1px solid #d7dce4; border-radius: 8px; padding: 14px 16px; }
  .card span { display: block; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px;
               letter-spacing: .1em; text-transform: uppercase; color: #8892a4; }
  .card strong { display: block; margin-top: 4px; font-size: 20px; }
  .card small { display: block; color: #55637a; font-size: 12.5px; }
  .sig { margin-top: 14px; border: 2px solid #16202e; border-radius: 10px; padding: 20px 22px; }
  .sig .mark { font-family: "Segoe Script", "Brush Script MT", cursive; font-size: 30px; margin: 6px 0 2px; }
  .sig img { max-width: 320px; display: block; margin: 6px 0; }
  .checks { list-style: none; margin: 12px 0 0; padding: 0; font-size: 13.5px; }
  .checks li::before { content: "☑ "; }
  .audit { margin-top: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
           font-size: 11.5px; color: #55637a; word-break: break-all; }
  .warn { color: #b91c1c; font-weight: 700; }
  footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #d7dce4;
           font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11.5px; color: #8892a4; }
  @media print { body { background: #fff; } .sheet { padding: 0; max-width: none; } h2 { break-after: avoid; } }
  @media (max-width: 680px) { .sheet { padding: 28px 20px 40px; } .grid { grid-template-columns: 1fr; } }
</style></head>
<body><div class="sheet">
  <header>
    <div class="brand">Tomorrow&rsquo;s Tech AI</div>
    <h1>${esc(p.title)}</h1>
    <div class="meta">
      Proposal ${esc(p.proposal_number)}${p.package_name ? ` · ${esc(p.package_name)}` : ""}<br/>
      Prepared for ${esc(p.client_business_name || p.client_contact_name || "Client")}<br/>
      Signed ${esc(stamp(signature.signed_at))}
    </div>
  </header>

  <h2>Parties</h2>
  <table><tbody>
    <tr><th>Provider</th><td>Tomorrow&rsquo;s Tech AI</td></tr>
    <tr><th>Client</th><td>${esc(p.client_business_name || "—")}</td></tr>
    <tr><th>Contact</th><td>${esc(p.client_contact_name || "—")}${
      p.client_email ? ` · ${esc(p.client_email)}` : ""
    }${p.client_phone ? ` · ${esc(p.client_phone)}` : ""}</td></tr>
    ${p.client_billing_address ? `<tr><th>Billing address</th><td>${esc(p.client_billing_address)}</td></tr>` : ""}
  </tbody></table>

  ${p.summary ? `<h2>Executive summary</h2>${paragraphs(p.summary)}` : ""}

  ${sections
    .filter((s) => s.is_visible && s.content)
    .map((s) => `<h2>${esc(s.title)}</h2>${paragraphs(s.content)}`)
    .join("")}

  ${list("Scope of work", byType("scope"))}
  ${list("Deliverables", byType("deliverable"))}
  ${list("Pages", byType("page"))}
  ${list("Integrations", byType("integration"))}
  ${list("Add-ons", byType("addon"))}

  <h2>Investment</h2>
  <div class="grid">
    <div class="card"><span>One-time build</span><strong>${esc(money(p.total_cents))}</strong>
      <small>${
        p.discount_amount_cents > 0
          ? `${esc(money(p.subtotal_cents))} less ${esc(money(p.discount_amount_cents))} discount`
          : "Total for the work described above"
      }</small></div>
    <div class="card"><span>Hosting &amp; management</span><strong>${
      p.recurring_price_cents > 0 ? esc(money(p.recurring_price_cents)) : "—"
    }</strong><small>${
      p.recurring_price_cents > 0 ? `per ${esc(p.recurring_interval)}` : "No recurring service quoted"
    }</small></div>
  </div>
  <p><b>Payment:</b> ${esc(dueNow)}</p>
  ${p.hosting_note ? `<p>${esc(p.hosting_note)}</p>` : ""}
  ${p.turnaround_note ? `<p><b>Turnaround:</b> ${esc(p.turnaround_note)}</p>` : ""}
  ${
    p.revision_limit !== null
      ? `<p><b>Revisions:</b> ${esc(p.revision_limit)} review round${p.revision_limit === 1 ? "" : "s"} included.</p>`
      : ""
  }

  ${list("What we need from you", byType("client_responsibility"))}
  ${list("What Tomorrow's Tech AI does", byType("provider_responsibility"))}
  ${list("Not included in this scope", byType("exclusion"))}

  <h2>Ownership &amp; software license — at a glance</h2>
  <p>This summary is for convenience. The Agreement below controls if there is any conflict.</p>
  ${ownershipBlock(OWNERSHIP_SUMMARY.clientOwns)}
  ${ownershipBlock(OWNERSHIP_SUMMARY.providerRetains)}
  ${ownershipBlock(OWNERSHIP_SUMMARY.notIncluded)}
  <p>${esc(OWNERSHIP_SUMMARY.licenceNote)}</p>

  ${agreementBlock}

  <h2>Acceptance and signature</h2>
  <div class="sig">
    <div class="meta">Electronically signed by</div>
    ${
      signature.signature_type === "drawn" && signature.signature_data
        ? `<img alt="Signature" src="${esc(signature.signature_data)}"/>`
        : `<div class="mark">${esc(signature.signature_text || signature.signer_name)}</div>`
    }
    <div><b>${esc(signature.signer_name)}</b>${
      signature.signer_title ? ` — ${esc(signature.signer_title)}` : ""
    }<br/>${esc(signature.signer_email)}</div>
    <ul class="checks">
      ${ACCEPTANCE_CHECKS.map(
        (check) =>
          `<li>${esc(check.label)}${
            (signature as unknown as Record<string, boolean>)[check.key] ? "" : " — NOT CONFIRMED"
          }</li>`
      ).join("")}
    </ul>
    <div class="audit">
      Signed at: ${esc(stamp(signature.signed_at))}<br/>
      Agreement version: ${esc(signature.agreement_version)}<br/>
      Proposal: ${esc(p.proposal_number)}<br/>
      Record ID: ${esc(signature.id)}<br/>
      IP address: ${esc(signature.ip_address || "not recorded")}<br/>
      User agent: ${esc(signature.user_agent || "not recorded")}
    </div>
  </div>

  <footer>
    Tomorrow&rsquo;s Tech AI · This document is the frozen copy of proposal
    ${esc(p.proposal_number)} as accepted. It is stored unaltered and its
    SHA-256 digest is recorded against the signature record.
  </footer>
</div></body></html>`;
}

/**
 * Writes the snapshot once. `upsert: false` so a second attempt cannot
 * overwrite the original — belt and braces alongside the database trigger.
 */
export async function storeSignedDocument(
  db: SupabaseClient,
  full: FullProposal,
  signature: ProposalSignature
): Promise<{ path: string; hash: string; html: string }> {
  const html = renderSignedDocument(full, signature);
  const hash = sha256(html);
  const path = `${full.proposal.id}/${full.proposal.proposal_number}-signed.html`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, Buffer.from(html, "utf8"), {
      contentType: "text/html; charset=utf-8",
      upsert: false,
    });

  // An existing object means this proposal was already signed and stored.
  // That is not a failure: the first write is the one that counts.
  if (error && !/exists/i.test(error.message)) {
    throw new Error(`Could not store the signed document: ${error.message}`);
  }

  return { path, hash, html };
}

/** Short-lived signed URL. Admin viewing only; the bucket is never public. */
export async function signedDocumentUrl(
  db: SupabaseClient,
  path: string,
  seconds = 600
): Promise<string | null> {
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
