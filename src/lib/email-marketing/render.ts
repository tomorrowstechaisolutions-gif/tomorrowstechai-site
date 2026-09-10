import {
  BRAND,
  C,
  bullets,
  button,
  divider,
  esc,
  fineprint,
  heading,
  paragraph,
  quote,
  renderEmail,
  signoff,
} from "@/lib/email/brand";
import {
  PERSONALIZATION_TOKENS,
  findTokens,
  isEmail,
  safeUrl,
  unknownTokens,
  type EmailBlock,
  type EmailTone,
} from "./types";

/**
 * Blocks in, email-safe HTML out.
 *
 * This does NOT contain an email design system. lib/email/brand.ts already
 * has one — the table markup, the dark palette, the 4px tone strip, the
 * Outlook workarounds — and every proposal, invoice and follow-up this
 * business sends already goes through it. A marketing campaign is rendered
 * with the same builders so it looks like the same company, and so a fix to
 * the Outlook button hack fixes it everywhere at once.
 *
 * Two rules are enforced HERE rather than trusted to the composer:
 *
 *   1. THE UNSUBSCRIBE FOOTER IS ALWAYS APPENDED. It is not a block somebody
 *      can delete and not a checkbox somebody can miss. A marketing email
 *      that leaves this function has an unsubscribe link in it, full stop.
 *   2. Personalization tokens are resolved against an allowlist, and an
 *      unresolved token is a pre-send ERROR rather than a silent blank.
 */

/* ── Personalization ───────────────────────────────────────────────── */

export type Recipient = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
};

export type PersonalizationContext = {
  clientName?: string | null;
  salesRep?: string | null;
  serviceName?: string | null;
};

/**
 * Replaces every {{token}} that resolves, and leaves the rest alone so the
 * pre-send check can find them. Falls back per-token rather than to an empty
 * string: "Hi there," is a sentence, "Hi ," is a mistake somebody will see.
 */
export function personalize(
  text: string,
  recipient: Recipient,
  context: PersonalizationContext = {}
): string {
  const first = recipient.firstName?.trim() || "";
  const last = recipient.lastName?.trim() || "";

  const values: Record<string, string> = {
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(" "),
    company_name: recipient.company?.trim() || "",
    client_name: context.clientName?.trim() || "",
    sales_rep: context.salesRep?.trim() || "",
    service_name: context.serviceName?.trim() || "",
    email: recipient.email,
  };

  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (whole, rawName: string) => {
    const name = rawName.toLowerCase();
    const spec = PERSONALIZATION_TOKENS.find((t) => t.token === name);
    if (!spec) return whole; // Unknown — left visible on purpose.
    const value = values[name] ?? "";
    return value || spec.fallback;
  });
}

/** The preview values shown in the composer, so nobody tests against blanks. */
export const PREVIEW_RECIPIENT: Recipient = {
  email: "sample@example.com",
  firstName: "Alex",
  lastName: "Rivera",
  company: "Rivera Pool Service",
};

/* ── Blocks that lib/email/brand.ts does not already provide ──────── */

function imageBlock(src: string, alt: string, href?: string): string {
  const safe = safeUrl(src);
  if (!safe) return "";
  const img =
    `<img src="${esc(safe)}" alt="${esc(alt)}" width="536" ` +
    `style="display:block;width:100%;max-width:536px;height:auto;border-radius:10px;border:1px solid ${C.border};" />`;
  const link = href ? safeUrl(href) : null;
  const body = link ? `<a href="${esc(link)}" target="_blank">${img}</a>` : img;
  return `<tr><td class="ttai-pad" style="padding:6px 32px 18px 32px;">${body}</td></tr>`;
}

function spacerBlock(size = 16): string {
  const height = Math.max(4, Math.min(64, size));
  return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;
}

/* ── The unsubscribe footer ────────────────────────────────────────── */

/**
 * Appended to EVERY marketing email. §45.
 *
 * The physical address and the sender identity come from BRAND, which is the
 * same place the transactional footer reads them from, so the two can never
 * drift apart. The unsubscribe href is passed in because it is per-recipient
 * — an HMAC over their id — and it is never guessable or editable to
 * unsubscribe somebody else.
 */
function complianceFooter(unsubscribeUrl: string | null, reason: string): string {
  const link = unsubscribeUrl
    ? `<a href="${esc(unsubscribeUrl)}" style="color:${C.faint};text-decoration:underline;">Unsubscribe</a>`
    : `<span style="color:${C.faint};">Reply with "unsubscribe" and we will take you off the list by hand.</span>`;

  return `<tr><td class="ttai-pad" style="padding:6px 32px 26px 32px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td style="border-top:1px solid ${C.borderSoft};padding-top:14px;">
      <p style="margin:0 0 6px 0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${C.faint};">
        ${esc(reason)}
      </p>
      <p style="margin:0 0 6px 0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${C.faint};">
        ${esc(BRAND.name)} · ${esc(BRAND.siteLabel)} · ${esc(BRAND.phone)}
      </p>
      <p style="margin:0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${C.faint};">
        ${link}
      </p>
    </td></tr>
  </table>
</td></tr>`;
}

/* ── The renderer ──────────────────────────────────────────────────── */

export type RenderInput = {
  blocks: EmailBlock[];
  previewText: string;
  tone?: EmailTone;
  recipient: Recipient;
  context?: PersonalizationContext;
  unsubscribeUrl: string | null;
  /** Why this landed in their inbox. Printed above the unsubscribe link. */
  footerReason?: string;
  /** Custom HTML blocks only render for an admin-authored body. */
  allowCustomHtml?: boolean;
};

export function renderCampaignHtml(input: RenderInput): string {
  const p = (text: string) => personalize(text, input.recipient, input.context ?? {});

  const rendered = input.blocks
    .map((block): string => {
      switch (block.type) {
        case "heading":
          return heading(p(block.text));
        case "text":
          return paragraph(esc(p(block.text)).replace(/\n/g, "<br />"), { dim: block.dim });
        case "button": {
          const href = safeUrl(p(block.href));
          // A button with nowhere to go is dropped rather than rendered as
          // dead text — the pre-send check has already complained about it.
          return href ? button(p(block.label), href) : "";
        }
        case "image":
          return imageBlock(p(block.src), p(block.alt), block.href ? p(block.href) : undefined);
        case "divider":
          return divider();
        case "spacer":
          return spacerBlock(block.size);
        case "bullets":
          return bullets(block.items.map((item) => p(item)));
        case "quote":
          return quote(p(block.text));
        case "fineprint":
          return fineprint(p(block.text));
        case "signoff":
          return signoff();
        case "html":
          // Never rendered for anything a client or an import supplied.
          return input.allowCustomHtml ? block.html : "";
        default:
          return "";
      }
    })
    .filter(Boolean);

  rendered.push(
    complianceFooter(
      input.unsubscribeUrl,
      input.footerReason ??
        "You are receiving this because you enquired with us or opted in to updates."
    )
  );

  return renderEmail({
    preheader: p(input.previewText),
    blocks: rendered,
    tone: input.tone ?? "default",
  });
}

/** The same body as plain text, for the multipart alternative. */
export function renderCampaignText(input: RenderInput): string {
  const p = (text: string) => personalize(text, input.recipient, input.context ?? {});
  const lines: string[] = [];

  for (const block of input.blocks) {
    switch (block.type) {
      case "heading": lines.push(p(block.text).toUpperCase(), ""); break;
      case "text": lines.push(p(block.text), ""); break;
      case "button": {
        const href = safeUrl(p(block.href));
        if (href) lines.push(`${p(block.label)}: ${href}`, "");
        break;
      }
      case "bullets": lines.push(...block.items.map((i) => `  - ${p(i)}`), ""); break;
      case "quote": lines.push(`"${p(block.text)}"`, ""); break;
      case "fineprint": lines.push(p(block.text), ""); break;
      case "signoff": lines.push(`— ${BRAND.signer}, ${BRAND.signerRole}`, ""); break;
      case "divider": lines.push("—".repeat(40), ""); break;
      default: break;
    }
  }

  lines.push(
    "",
    `${BRAND.name} · ${BRAND.siteLabel} · ${BRAND.phone}`,
    input.unsubscribeUrl
      ? `Unsubscribe: ${input.unsubscribeUrl}`
      : 'Reply with "unsubscribe" and we will take you off the list by hand.'
  );

  return lines.join("\n");
}

/* ── Pre-send checks ───────────────────────────────────────────────── */

export type PreSendIssue = {
  severity: "error" | "warning";
  label: string;
  detail: string;
};

export type PreSendInput = {
  subject: string | null;
  previewText: string | null;
  fromEmail: string | null;
  fromName: string | null;
  blocks: EmailBlock[];
  audienceSize: number | null;
  domainAuthenticated: boolean;
  approvalSatisfied: boolean;
};

/**
 * Everything that must be true before a campaign may go out. §17.
 *
 * An ERROR blocks the send; a WARNING is shown and can be sent past. The
 * split matters: refusing to send because the preview text is empty would
 * teach people to ignore the panel, and then they would ignore the missing
 * unsubscribe link too.
 *
 * The unsubscribe link is deliberately NOT checked here — the renderer
 * always appends it, so there is nothing a person could get wrong. Checking
 * for something that cannot fail is how a checklist stops being read.
 */
export function preSendChecks(input: PreSendInput): PreSendIssue[] {
  const issues: PreSendIssue[] = [];
  const err = (label: string, detail: string) => issues.push({ severity: "error", label, detail });
  const warn = (label: string, detail: string) => issues.push({ severity: "warning", label, detail });

  if (!input.subject?.trim()) {
    err("No subject line", "A campaign cannot go out without one.");
  } else if (input.subject.trim().length > 90) {
    warn("Long subject line", `${input.subject.trim().length} characters — most inboxes cut off around 60.`);
  }

  if (!input.previewText?.trim()) {
    warn(
      "No preview text",
      "Inboxes will scrape the first words of the body instead, which rarely reads well."
    );
  }

  if (!input.fromEmail?.trim()) {
    err("No sender address", "Set a From address on the campaign or on the sending domain.");
  } else if (!isEmail(input.fromEmail)) {
    err("Sender address is not valid", `"${input.fromEmail}" is not a usable address.`);
  }

  if (!input.fromName?.trim()) {
    warn("No sender name", "The message will show only the address, which looks automated.");
  }

  if (input.blocks.length === 0) {
    err("The email is empty", "Add at least one content block.");
  }

  if (input.audienceSize === null) {
    err("No audience selected", "Choose who this campaign is going to.");
  } else if (input.audienceSize === 0) {
    err(
      "The audience is empty",
      "Nobody in this audience can be emailed right now — everyone is either suppressed or has no consent recorded."
    );
  }

  if (!input.domainAuthenticated) {
    warn(
      "Sending domain is not verified",
      "SPF and DKIM are not confirmed for this domain, so more of this send will land in spam. Check Sending Health."
    );
  }

  if (!input.approvalSatisfied) {
    err("Approval is outstanding", "This campaign requires approval before it can be scheduled or sent.");
  }

  // ── Content problems ────────────────────────────────────────────
  const allText = [
    input.subject ?? "",
    input.previewText ?? "",
    ...input.blocks.flatMap((block) => {
      switch (block.type) {
        case "heading": case "text": case "quote": case "fineprint": return [block.text];
        case "button": return [block.label, block.href];
        case "bullets": return block.items;
        case "image": return [block.alt, block.src];
        default: return [];
      }
    }),
  ].join("\n");

  const broken = unknownTokens(allText);
  if (broken.length > 0) {
    err(
      broken.length === 1 ? "A personalization token will not resolve" : "Personalization tokens will not resolve",
      `${broken.map((t) => `{{${t}}}`).join(", ")} — these would be sent to recipients exactly as written.`
    );
  }

  for (const block of input.blocks) {
    if (block.type === "button") {
      if (!safeUrl(block.href)) {
        err(`Button "${block.label || "untitled"}" has no working link`, `"${block.href}" is not a usable URL.`);
      }
    }
    if (block.type === "image" && !safeUrl(block.src)) {
      err("An image has no working source", `"${block.src}" is not a usable URL.`);
    }
    if (block.type === "image" && !block.alt.trim()) {
      warn("An image has no alt text", "Many clients block images by default; alt text is what those readers see.");
    }
  }

  const hasCta = input.blocks.some((b) => b.type === "button");
  if (!hasCta) {
    warn("No call to action", "There is no button in this email, so there is nothing to click.");
  }

  // Gmail clips a message at about 102 KB, and the clip lands mid-content.
  const approxBytes = JSON.stringify(input.blocks).length;
  if (approxBytes > 80_000) {
    warn(
      "The email is very long",
      "Gmail clips messages around 102 KB and hides everything after the cut, including the unsubscribe link."
    );
  }

  // A token in the SUBJECT with no fallback is the one that gets noticed.
  const subjectTokens = findTokens(input.subject ?? "");
  if (subjectTokens.includes("company_name") || subjectTokens.includes("first_name")) {
    warn(
      "Personalized subject line",
      "Recipients with no name or company on file will see the fallback text instead. Send yourself a test.",
    );
  }

  return issues;
}

/** Whether the issues found allow a send at all. */
export function canSend(issues: PreSendIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}
