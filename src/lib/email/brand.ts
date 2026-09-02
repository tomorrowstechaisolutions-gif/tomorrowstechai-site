/**
 * The house style for every email Tomorrow's Tech AI sends.
 *
 * Everything before this was plain text, which is fine for a receipt and
 * wrong for the one document a client reads before they decide to spend
 * money. A proposal email is the first time most people see the company as
 * a company, so it gets built like the site: dark plate, the mark, the blue,
 * and the figures set out where they cannot be misread.
 *
 * Email is not the web, so this file obeys email's rules rather than ours:
 *
 *   - Tables for layout. Flexbox and grid do not exist in Outlook.
 *   - Every style inline. There is no reliable <style> support, so the
 *     media query at the top of the document is a progressive nicety and
 *     never load-bearing.
 *   - `bgcolor` next to every background colour, because Outlook ignores
 *     the CSS and honours the attribute.
 *   - The design has to survive images being blocked, which is the default
 *     in a lot of inboxes. The wordmark is live text; the mark is decoration.
 *   - No webp, no svg, no background-image, no web fonts.
 *
 * Nothing in here is server-only: it builds strings, so it can be rendered
 * to a file and looked at without sending anything.
 */

export const BRAND = {
  name: "Tomorrow's Tech AI",
  tagline: "Solutions for tomorrow. Results today.",
  site: "https://tomorrowstechai.com",
  siteLabel: "tomorrowstechai.com",
  phone: "(254) 563-2130",
  phoneHref: "tel:+12545632130",
  email: "john@tomorrowstechai.com",
  signer: "John",
  signerRole: "Founder, Tomorrow's Tech AI",
  /**
   * The mark already sits on its own dark plate (#070B14), so the header
   * needs no transparency and no cut-out — and it is 3.7 KB, which matters
   * when Gmail clips a message at 102 KB.
   */
  logo: "https://www.tomorrowstechai.com/icon-192.png",
} as const;

/** The site's own tokens, hard-coded because email cannot read a stylesheet. */
export const C = {
  page: "#04070D",
  plate: "#070B14",
  card: "#0A111C",
  cardSoft: "#101A29",
  border: "#1B2739",
  borderSoft: "#141D2C",
  text: "#E9EFF7",
  dim: "#94A3B8",
  faint: "#64748B",
  blue: "#3B82F6",
  blueBright: "#60A5FA",
  blueDeep: "#1D4ED8",
  indigo: "#6366F1",
  success: "#22C55E",
  amber: "#F5A623",
} as const;

/**
 * Single quotes inside, deliberately. This string is interpolated into
 * style="..." attributes, and a double quote in the font stack closes the
 * attribute early — which silently drops every declaration after
 * `font-family`. CSS accepts either quote; the attribute does not.
 */
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Anything interpolated into markup goes through this. No exceptions. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes, then turns blank lines into paragraphs and newlines into breaks. */
export function escMultiline(value: string): string {
  return esc(value)
    .split(/\n{2,}/)
    .map((para) => para.trim().replace(/\n/g, "<br />"))
    .filter(Boolean)
    .join("<br /><br />");
}

// ── Blocks ───────────────────────────────────────────────────────────
//
// Each returns one <tr> for the content table, so a message is written as a
// list of blocks rather than a wall of nested tables.

const PAD = "padding:0 32px;";

export function heading(text: string): string {
  return `<tr><td style="${PAD}padding-top:4px;padding-bottom:14px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;color:${C.text};letter-spacing:-0.02em;">${esc(text)}</td></tr>`;
}

export function eyebrow(text: string): string {
  return `<tr><td style="${PAD}padding-bottom:10px;font-family:${FONT};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.blueBright};">${esc(text)}</td></tr>`;
}

/** Body copy. Pass already-escaped HTML — use escMultiline for user text. */
export function paragraph(html: string, opts?: { dim?: boolean }): string {
  const color = opts?.dim ? C.dim : C.text;
  return `<tr><td style="${PAD}padding-bottom:16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${color};">${html}</td></tr>`;
}

export function subheading(text: string): string {
  return `<tr><td style="${PAD}padding-top:10px;padding-bottom:12px;font-family:${FONT};font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.faint};">${esc(text)}</td></tr>`;
}

/**
 * The money. A bordered panel rather than a sentence, because a number a
 * client has to hunt for in a paragraph is a number they will get wrong.
 */
export function factPanel(
  rows: { label: string; value: string; strong?: boolean; note?: string }[]
): string {
  const body = rows
    .map((row, index) => {
      const first = index === 0;
      const border = first ? "" : `border-top:1px solid ${C.borderSoft};`;
      const labelColor = row.strong ? C.text : C.dim;
      const valueColor = row.strong ? C.blueBright : C.text;
      const weight = row.strong ? "700" : "600";
      const note = row.note
        ? `<div style="font-family:${FONT};font-size:12px;line-height:1.4;color:${C.faint};padding-top:3px;">${esc(row.note)}</div>`
        : "";
      return `<tr>
        <td style="${border}padding:13px 18px 13px 0;font-family:${FONT};font-size:14px;line-height:1.4;color:${labelColor};">${esc(row.label)}${note}</td>
        <td align="right" style="${border}padding:13px 0;font-family:${FONT};font-size:16px;line-height:1.4;font-weight:${weight};color:${valueColor};white-space:nowrap;">${esc(row.value)}</td>
      </tr>`;
    })
    .join("");

  return `<tr><td style="${PAD}padding-bottom:26px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.border};border-radius:12px;">
      <tr><td style="padding:6px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}</table>
      </td></tr>
    </table>
  </td></tr>`;
}

/** The one thing the reader is meant to do. There is never a second one. */
export function button(label: string, href: string): string {
  const url = esc(href);
  return `<tr><td style="${PAD}padding-bottom:12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" bgcolor="${C.blue}" style="background-color:${C.blue};border-radius:10px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="20%" stroke="f" fillcolor="${C.blue}">
        <w:anchorlock/><center style="color:#FFFFFF;font-family:${FONT};font-size:16px;font-weight:700;">${esc(label)}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${url}" style="display:inline-block;padding:16px 34px;font-family:${FONT};font-size:16px;line-height:1;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;background-color:${C.blue};mso-hide:all;">${esc(label)}</a>
        <!--<![endif]-->
      </td></tr>
    </table>
  </td></tr>`;
}

/** The same link as plain text, for anyone whose client eats the button. */
export function linkFallback(href: string): string {
  return `<tr><td style="${PAD}padding-bottom:26px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};word-break:break-all;">Or paste this into your browser:<br /><a href="${esc(href)}" style="color:${C.blue};text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${esc(href)}</a></td></tr>`;
}

/** A checklist, set with a blue rule instead of bullet glyphs that break. */
export function bullets(items: string[]): string {
  const rows = items
    .map(
      (item) => `<tr>
        <td width="14" valign="top" style="padding:0 0 12px 0;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.blue};">&bull;</td>
        <td valign="top" style="padding:0 0 12px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.dim};">${esc(item)}</td>
      </tr>`
    )
    .join("");
  return `<tr><td style="${PAD}padding-bottom:14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
  </td></tr>`;
}

/** A note typed by a person, kept visually separate from the template's voice. */
export function quote(text: string): string {
  return `<tr><td style="${PAD}padding-bottom:26px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.cardSoft}" style="background-color:${C.cardSoft};border-left:3px solid ${C.blue};border-radius:0 10px 10px 0;">
      <tr><td style="padding:16px 18px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.text};">${escMultiline(text)}</td></tr>
    </table>
  </td></tr>`;
}

export function divider(): string {
  return `<tr><td style="${PAD}padding-top:6px;padding-bottom:24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" bgcolor="${C.border}" style="background-color:${C.border};height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr></table></td></tr>`;
}

/** Small print inside the body — an expiry date, a caveat. */
export function fineprint(text: string): string {
  return `<tr><td style="${PAD}padding-bottom:22px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.faint};">${esc(text)}</td></tr>`;
}

/** The human at the end. Always the same person, always reachable. */
export function signoff(): string {
  return `<tr><td style="${PAD}padding-top:8px;padding-bottom:34px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="font-family:${FONT};font-size:16px;line-height:1.6;color:${C.text};">&mdash; ${esc(BRAND.signer)}</td></tr>
      <tr><td style="font-family:${FONT};font-size:13px;line-height:1.6;color:${C.faint};padding-top:2px;">${esc(BRAND.signerRole)}</td></tr>
      <tr><td style="font-family:${FONT};font-size:13px;line-height:1.6;color:${C.dim};padding-top:8px;">
        <a href="${BRAND.phoneHref}" style="color:${C.dim};text-decoration:none;">${esc(BRAND.phone)}</a>
        <span style="color:${C.border};">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
        <a href="mailto:${esc(BRAND.email)}" style="color:${C.dim};text-decoration:none;">${esc(BRAND.email)}</a>
      </td></tr>
    </table>
  </td></tr>`;
}

// ── The shell ────────────────────────────────────────────────────────

export type EmailTone = "default" | "success" | "alert";

/**
 * The 4px rule across the top. Six stops rather than three, because a
 * background-image gradient is not safe in email and three flat cells read
 * as three flat cells rather than as the site's blue-to-indigo ramp.
 */
const TONE_STRIP: Record<EmailTone, string[]> = {
  default: ["#7DBBFF", C.blueBright, "#4A8FF7", C.blue, "#4E6FF0", C.indigo],
  success: ["#4ADE80", C.success, "#16A34A", "#12A07A", "#0F8C7E", "#0F766E"],
  alert: ["#FFC257", C.amber, "#EE9612", "#E08600", "#C96F02", "#B45309"],
};

/**
 * Wraps blocks in the header, the plate and the footer.
 *
 * `preheader` is the grey line an inbox shows next to the subject. Left
 * unset, clients scrape the first words of the body, which is how a message
 * ends up previewed as "View this email in your browser". It is worth
 * writing deliberately every single time.
 */
export function renderEmail(input: {
  preheader: string;
  blocks: string[];
  tone?: EmailTone;
  /** Printed small under the footer rule — why this landed in their inbox. */
  footnote?: string;
  /** Right of the wordmark. A proposal number, an invoice number. */
  headerMeta?: string;
}): string {
  const strip = TONE_STRIP[input.tone ?? "default"];

  // A zero-width run after the preheader stops the client padding the preview
  // out with the first line of real copy.
  const spacer = "&#847;&zwnj;&nbsp;".repeat(40);

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${esc(BRAND.name)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:${C.blue}; }
  @media only screen and (max-width:620px) {
    .ttai-pad { padding-left:20px !important; padding-right:20px !important; }
    .ttai-h1 { font-size:23px !important; }
    .ttai-btn a { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.page};">${esc(input.preheader)}${spacer}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.page}" style="background-color:${C.page};">
  <tr><td align="center" style="padding:28px 12px 40px 12px;">

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">

      <tr><td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius:14px 14px 0 0;overflow:hidden;">
          <tr>${strip
            .map(
              (shade) =>
                `<td width="17%" height="4" bgcolor="${shade}" style="background-color:${shade};height:4px;line-height:4px;font-size:0;">&nbsp;</td>`
            )
            .join("")}</tr>
        </table>
      </td></tr>

      <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:20px 32px;" class="ttai-pad">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td valign="middle" width="44" style="padding-right:12px;">
              <img src="${BRAND.logo}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:9px;" />
            </td>
            <td valign="middle" style="font-family:${FONT};font-size:14px;line-height:1.2;font-weight:700;letter-spacing:0.1em;color:${C.text};text-transform:uppercase;">
              Tomorrow&rsquo;s <span style="color:${C.blueBright};">Tech AI</span>
            </td>
            ${
              input.headerMeta
                ? `<td valign="middle" align="right" style="font-family:${FONT};font-size:12px;line-height:1.2;color:${C.faint};white-space:nowrap;">${esc(input.headerMeta)}</td>`
                : ""
            }
          </tr>
        </table>
      </td></tr>

      <tr><td bgcolor="${C.page}" style="background-color:${C.page};border-left:1px solid ${C.border};border-right:1px solid ${C.border};border-top:1px solid ${C.border};padding:30px 0 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ttai-pad">
          ${input.blocks.join("\n")}
        </table>
      </td></tr>

      <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};border:1px solid ${C.border};border-radius:0 0 14px 14px;padding:22px 32px;" class="ttai-pad">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-family:${FONT};font-size:13px;line-height:1.6;font-weight:600;color:${C.text};">${esc(BRAND.name)}</td></tr>
          <tr><td style="font-family:${FONT};font-size:12px;line-height:1.6;color:${C.faint};padding-bottom:10px;">${esc(BRAND.tagline)}</td></tr>
          <tr><td style="font-family:${FONT};font-size:12px;line-height:1.7;color:${C.dim};">
            <a href="${BRAND.site}" style="color:${C.dim};text-decoration:none;">${esc(BRAND.siteLabel)}</a>
            <span style="color:${C.border};">&nbsp;&middot;&nbsp;</span>
            <a href="mailto:${esc(BRAND.email)}" style="color:${C.dim};text-decoration:none;">${esc(BRAND.email)}</a>
            <span style="color:${C.border};">&nbsp;&middot;&nbsp;</span>
            <a href="${BRAND.phoneHref}" style="color:${C.dim};text-decoration:none;">${esc(BRAND.phone)}</a>
          </td></tr>
          ${
            input.footnote
              ? `<tr><td style="font-family:${FONT};font-size:11px;line-height:1.6;color:${C.faint};padding-top:14px;border-top:1px solid ${C.borderSoft};margin-top:12px;">${esc(input.footnote)}</td></tr>`
              : ""
          }
        </table>
      </td></tr>

    </table>

  </td></tr>
</table>
</body>
</html>`;
}
