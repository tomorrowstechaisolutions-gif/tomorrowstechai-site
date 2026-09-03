/**
 * The request catalogue — what we can ask a client to go and do.
 *
 * Plain module. No `server-only`, no database, no Resend: the email, the
 * client's page and the admin picker all read the same objects, and a
 * template can be rendered to a file and looked at without sending anything.
 * Same seam as tasks/config.ts — a new kind of request is a new object in
 * this file, not a migration.
 *
 * The copy here is client-facing and gets read by people who did not ask to
 * become technical. It is written for them: short sentences, the reason
 * before the instruction, and never a step that assumes they already know
 * what a nameserver is.
 */

import { BRAND } from "@/lib/email/brand";
import type { EmailTone } from "@/lib/email/brand";

/** Who a client invites. One constant so it cannot drift between templates. */
export const OUR_EMAIL = BRAND.email;

export type RequestFieldType = "text" | "textarea" | "email" | "url" | "select";

export type RequestField = {
  key: string;
  label: string;
  type: RequestFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly string[];
  /** Character cap. The route handler enforces it; this is where it is set. */
  max?: number;
};

export type RequestStep = {
  /** Stable. `steps_done` stores these, so renaming one loses a tick. */
  id: string;
  title: string;
  /** Paragraphs. Plain text — escaped everywhere it is rendered. */
  body: string[];
  link?: { label: string; href: string };
  /** The one line that stops the most common mistake on this step. */
  callout?: string;
};

export type RequestTemplate = {
  key: string;
  /** What the client sees. */
  title: string;
  eyebrow: string;
  /** What John sees in the picker, and the one line under it. */
  pickerLabel: string;
  pickerHint: string;
  /**
   * The same thing as a noun phrase, for use inside a sentence: "we have
   * everything we need on the <noun>". pickerLabel is a label and reads as
   * one — "your logo & brand files came through" has an ampersand in the
   * middle of a sentence, and lower-casing it gives "your stripe account".
   */
  noun: string;
  /** Completes "Until this is done, ___". Goes in the email and the page. */
  blocks: string;
  /** Honest estimate. Overstating it is what stops people starting. */
  minutes: number;
  /** The opening paragraph of the email. */
  emailIntro: string;
  /** Why it has to be them and not us. The question everyone asks. */
  why: string;
  steps: RequestStep[];
  fields: RequestField[];
  confirm: { key: string; label: string }[];
  tone: EmailTone;
};

/**
 * ═══ The rule this file enforces ═══
 *
 * We never ask a client to send us a credential. Not a password, not an API
 * key, not a bank login, not a card number. Every template asks them to
 * INVITE us to their account instead, because an invitation is revocable,
 * attributable, and does not end up sitting in a jsonb column and an inbox
 * forever.
 *
 * `payload` is plain jsonb in a database the admin can read and is quoted
 * back into an HTML page. Treat it as a postcard. The guard below refuses at
 * module load — which means at build — to construct a template with a field
 * that looks like it is fishing for a secret, so this rule cannot be undone
 * by someone in a hurry six months from now.
 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /pass(word|phrase|code)/i,
  /\bpin\b/i,
  /secret/i,
  /api[\s_-]?key/i,
  /private[\s_-]?key/i,
  /\btoken\b/i,
  /credential/i,
  /\blogin\b/i,
  /\bcvv\b|\bcvc\b/i,
  /card[\s_-]?number/i,
  /routing[\s_-]?number/i,
  /account[\s_-]?number/i,
  /\bssn\b|social[\s_-]?security/i,
  /seed[\s_-]?phrase|recovery[\s_-]?phrase/i,
  /two[\s_-]?factor|\b2fa\b|auth(entication)?[\s_-]?code/i,
];

function assertNoCredentialFields(t: RequestTemplate): RequestTemplate {
  for (const f of t.fields) {
    for (const re of CREDENTIAL_PATTERNS) {
      if (re.test(f.key) || re.test(f.label)) {
        throw new Error(
          `Request template "${t.key}" asks for "${f.label}" (${f.key}), which reads as a ` +
            `credential. We do not collect credentials from clients — ask them to invite ` +
            `${OUR_EMAIL} to the account instead. See the rule in src/lib/requests/config.ts.`
        );
      }
    }
  }
  return t;
}

const NEVER_ASK =
  `We will never ask you for a password, a bank login or a card number — ` +
  `not by email, not by phone, not on this page. If a message claiming to be ` +
  `from us ever does, it is not from us. Call ${BRAND.phone}.`;

// ═══════════════════════════════════════════════════════════════════════════
// 1 · Stripe
// ═══════════════════════════════════════════════════════════════════════════
const STRIPE: RequestTemplate = {
  key: "stripe_account",
  title: "Set up your Stripe account",
  eyebrow: "One thing we need from you",
  pickerLabel: "Stripe account",
  pickerHint: "Client opens their own Stripe account and invites us in. Needed before the site can take payments.",
  noun: "Stripe account",
  blocks: "your site cannot take a payment",
  minutes: 20,
  emailIntro:
    "Your website is going to take card payments, and that part has to be set up in your name. " +
    "It is about twenty minutes of form-filling and it only has to happen once.",
  why:
    "The money goes to your bank account, so the account has to be yours — your business name, " +
    "your tax ID, your bank details. Nobody can open it on your behalf, and you would not want " +
    "them to: refunds, chargebacks and your 1099-K all follow whoever owns the account.",
  steps: [
    {
      id: "create",
      title: "Create the account",
      body: [
        "Go to stripe.com and sign up with the email you actually check. You will need your legal business name, your business address, and your EIN — or your Social Security number if you are a sole proprietor and have not got an EIN.",
        "Stripe asks what your business does and what you sell. Plain answers are fine.",
      ],
      link: { label: "Open stripe.com", href: "https://dashboard.stripe.com/register" },
    },
    {
      id: "bank",
      title: "Add the bank account that gets paid",
      body: [
        "This is where your money lands. Stripe pays out on a rolling schedule — usually two business days after a payment for the first while, faster once the account has history.",
        "You will also set a statement descriptor: the short name that appears on your customer's card statement. Make it something they will recognise, or you will get calls asking who charged them.",
      ],
      callout: "Have your account and routing numbers to hand. You enter them at Stripe, never anywhere else.",
    },
    {
      id: "invite",
      title: `Invite us as a team member`,
      body: [
        `In the Stripe dashboard: Settings → Team and security → Team → New member. Invite ${OUR_EMAIL} and give it the Developer role.`,
        "Developer lets us connect your website to the account and test that a payment goes through. It does not let us move your money or see your bank details, and you can remove us in two clicks whenever you like.",
      ],
      callout: "Developer, not Administrator. We do not need Administrator and should not have it.",
    },
    {
      id: "verify",
      title: "Finish verification",
      body: [
        "Stripe may ask for a photo of your ID or a document confirming the business. Do that part as soon as it appears — an unverified account can accept payments but cannot pay them out, and that is the thing people discover at the worst moment.",
      ],
    },
  ],
  fields: [
    {
      key: "account_email",
      label: "The email you signed up to Stripe with",
      type: "email",
      required: true,
      placeholder: "you@yourbusiness.com",
      help: "So we can check the invitation landed on the right account.",
      max: 320,
    },
    {
      key: "legal_business_name",
      label: "Business name on the account",
      type: "text",
      placeholder: "As it appears on Stripe",
      max: 200,
    },
    {
      key: "statement_descriptor",
      label: "What appears on your customer's card statement",
      type: "text",
      placeholder: "KEY KONNECT",
      help: "Up to 22 characters. Leave blank and we will suggest one.",
      max: 22,
    },
    {
      key: "activation_state",
      label: "Where did you get to?",
      type: "select",
      required: true,
      options: ["Fully set up and verified", "Set up, verification still pending", "Started, got stuck", "Have not started yet"],
    },
    {
      key: "stuck_on",
      label: "If you got stuck, what happened?",
      type: "textarea",
      placeholder: "Tell us where it stopped and we will get on the phone.",
      max: 2000,
    },
  ],
  confirm: [
    { key: "invited", label: `I have invited ${OUR_EMAIL} to the Stripe account` },
    { key: "no_secrets", label: "I understand Tomorrow's Tech AI will never ask for my Stripe password or bank login" },
  ],
  tone: "default",
};

// ═══════════════════════════════════════════════════════════════════════════
// 2 · Domain and DNS
// ═══════════════════════════════════════════════════════════════════════════
const DOMAIN: RequestTemplate = {
  key: "domain_access",
  title: "Give us access to your domain",
  eyebrow: "One thing we need from you",
  pickerLabel: "Domain / DNS access",
  pickerHint: "Client grants access at their registrar, or agrees to make the DNS change we send. Needed to point the domain at the new site.",
  noun: "domain access",
  blocks: "we cannot point your web address at the new site",
  minutes: 10,
  emailIntro:
    "Your new site is built and waiting. To make your web address point at it, we need either " +
    "access to wherever your domain is registered, or five minutes of your time to paste in two " +
    "settings we will send you.",
  why:
    "Your domain is your property and it stays that way. We only ever need permission to change " +
    "where it points — not ownership of it. If we ever part ways, the domain is still yours and " +
    "nothing has to be untangled.",
  steps: [
    {
      id: "find",
      title: "Work out where the domain lives",
      body: [
        "The registrar is whoever you pay for the domain each year — GoDaddy, Namecheap, Squarespace, Wix, Network Solutions, Hover, or whoever set the site up originally.",
        "If you are not sure, search your email for the word “renewal” and the domain name. The receipt will tell you. If that turns up nothing, tell us the domain and we can look up who it is registered with.",
      ],
      callout: "Do not cancel or transfer anything. Nothing about this changes what you pay or who owns it.",
    },
    {
      id: "grant",
      title: "Pick one of two ways in",
      body: [
        `The easy way: most registrars let you invite someone. GoDaddy calls it Delegate Access, Namecheap and Cloudflare call it adding a user, Squarespace calls it a contributor. Invite ${OUR_EMAIL} and we will make the change ourselves and tell you when it is done.`,
        "The other way: leave us out of the account and we will email you two lines to paste in — an A record and a CNAME. It is copy and paste, and we will stay on the phone while you do it if you would rather.",
      ],
    },
    {
      id: "wait",
      title: "Know what happens next",
      body: [
        "Once the change is in, the internet takes anywhere from a few minutes to a few hours to catch up. During that window some people will see the new site and some will still see the old one. That is normal and it settles on its own.",
        "Email keeps working. We do not touch the records that carry your mail.",
      ],
    },
  ],
  fields: [
    {
      key: "domain_name",
      label: "The domain",
      type: "text",
      required: true,
      placeholder: "yourbusiness.com",
      max: 253,
    },
    {
      key: "registrar",
      label: "Where is it registered?",
      type: "select",
      required: true,
      options: [
        "GoDaddy", "Namecheap", "Squarespace / Google Domains", "Wix", "Cloudflare",
        "Network Solutions", "Bluehost", "HostGator", "Hover", "Somewhere else", "I do not know",
      ],
    },
    {
      key: "access_method",
      label: "How would you like to do this?",
      type: "select",
      required: true,
      options: [
        "I have invited you to the registrar",
        "Send me the settings and I will paste them in",
        "Walk me through it on a call",
        "I cannot get into the account",
      ],
    },
    {
      key: "notes",
      label: "Anything we should know",
      type: "textarea",
      placeholder: "An old site still running, a work email on the domain, someone else who manages it.",
      max: 2000,
    },
  ],
  confirm: [
    { key: "owner", label: "I am the owner of this domain, or I have the owner's permission" },
  ],
  tone: "default",
};

// ═══════════════════════════════════════════════════════════════════════════
// 3 · Logo and brand files
// ═══════════════════════════════════════════════════════════════════════════
const BRAND_ASSETS: RequestTemplate = {
  key: "brand_assets",
  title: "Send us your logo and brand files",
  eyebrow: "One thing we need from you",
  pickerLabel: "Logo & brand files",
  pickerHint: "Original logo files, colours and fonts. Needed before the design can be finished properly.",
  noun: "logo and brand files",
  blocks: "your site has to launch with a logo we rebuilt by eye",
  minutes: 10,
  emailIntro:
    "We are at the point where your branding goes on the site. What we need is the original logo " +
    "file if you still have it — not a screenshot of it, and not the one pulled off Facebook.",
  why:
    "A logo saved from a website is usually about 200 pixels wide with a white box behind it. It " +
    "looks fine until it sits on a dark header or someone opens the site on a good phone screen, " +
    "and then it looks like a photocopy. The original file scales to any size cleanly.",
  steps: [
    {
      id: "find",
      title: "Find the original file",
      body: [
        "Look for a file ending in .ai, .eps, .svg or .pdf — that is the good one. Failing that, a .png with a see-through background. Failing that, the biggest .jpg you own.",
        "If a designer made it, they will still have the file; asking them for “the vector files” is usually a one-line email. If it was made in Canva, open the design and download it as a PNG with a transparent background.",
      ],
      callout: "Send everything you have and let us sort it out. Too many files is not a problem; too few is.",
    },
    {
      id: "extras",
      title: "Anything else that has your look on it",
      body: [
        "Business cards, a truck wrap, a sign, a flyer, an old website. Any of it helps us match what people already recognise you by.",
        "If you know your colours or fonts, tell us below. If you do not, do not go hunting — we can read them off the files.",
      ],
    },
    {
      id: "send",
      title: "Send them over",
      body: [
        "Easiest: reply straight to the email that brought you here and attach them.",
        "If they are big, put them in Google Drive or Dropbox, set the link so anyone with it can view, and paste the link below.",
      ],
    },
  ],
  fields: [
    {
      key: "assets_link",
      label: "Link to the files",
      type: "url",
      placeholder: "https://drive.google.com/...",
      help: "Leave blank if you are emailing them to us instead.",
      max: 500,
    },
    {
      key: "brand_colors",
      label: "Your colours, if you know them",
      type: "text",
      placeholder: "Navy and orange, or #1B2A4A and #F5811F",
      max: 300,
    },
    {
      key: "fonts",
      label: "Your fonts, if you know them",
      type: "text",
      placeholder: "Montserrat for headings",
      max: 300,
    },
    {
      key: "logo_state",
      label: "What have you got?",
      type: "select",
      required: true,
      options: [
        "The original design files",
        "A good PNG with a transparent background",
        "Only a picture of it",
        "No logo yet — can you make one?",
      ],
    },
  ],
  confirm: [
    { key: "rights", label: "I own these files or have the right to use them" },
  ],
  tone: "default",
};

// ═══════════════════════════════════════════════════════════════════════════
// 4 · Content and photos
// ═══════════════════════════════════════════════════════════════════════════
const CONTENT: RequestTemplate = {
  key: "content_photos",
  title: "Send us your words and photos",
  eyebrow: "One thing we need from you",
  pickerLabel: "Content & photos",
  pickerHint: "The words for the pages and real photos of the work. The most common reason a build stalls.",
  noun: "words and photos",
  blocks: "the pages stay filled with placeholder text",
  minutes: 45,
  emailIntro:
    "The site is built and the layout is done. What goes in it is the part only you can supply: " +
    "what you do, who you do it for, and photographs of the actual work.",
  why:
    "Anyone can write “quality service, competitive prices” and nobody believes it. What sells is " +
    "the specific thing you would say standing in front of a customer — and a photo of a job you " +
    "finished beats any stock image ever taken.",
  steps: [
    {
      id: "words",
      title: "The words",
      body: [
        "Do not write a brochure. Answer four questions in whatever words come out: what you do, who you do it for, what makes you the one to call, and what you want someone to do when they land on the page.",
        "A voice memo is fine. Bullet points are fine. Rough is fine — we tidy it up and send it back for you to approve.",
      ],
      callout: "Nothing here has to be final. It is much easier for us to fix your words than to invent them.",
    },
    {
      id: "photos",
      title: "The photos",
      body: [
        "Ten to twenty is plenty. Finished work, work in progress, your crew, your truck, you. Straight off a recent phone is good enough — do not send screenshots of photos, and do not shrink them to email them.",
        "Wide shots work better than close-ups on a website, because a header photo gets cropped short and tall on a phone.",
      ],
    },
    {
      id: "send",
      title: "Get them to us",
      body: [
        "Photos: Google Drive, Dropbox, or an iPhone shared album link. Paste the link below.",
        "Words: type them in below, or reply to the email that brought you here.",
      ],
    },
  ],
  fields: [
    {
      key: "what_you_do",
      label: "What you do, in your own words",
      type: "textarea",
      required: true,
      placeholder: "We frame and finish custom homes across the Waco area. Twenty years, mostly repeat customers and referrals.",
      max: 5000,
    },
    {
      key: "who_for",
      label: "Who you want to hear from",
      type: "textarea",
      placeholder: "Homeowners planning a remodel, and two builders we sub for.",
      max: 3000,
    },
    {
      key: "primary_cta",
      label: "What should a visitor do?",
      type: "select",
      required: true,
      options: ["Call us", "Request a quote", "Send a message", "Book a consultation"],
    },
    {
      key: "photos_link",
      label: "Link to your photos",
      type: "url",
      placeholder: "https://photos.app.goo.gl/...",
      max: 500,
    },
    {
      key: "testimonials",
      label: "Anything a customer has said about you",
      type: "textarea",
      placeholder: "A Google review, a text message, a card. Paste it in with their first name.",
      max: 5000,
    },
  ],
  confirm: [
    { key: "rights", label: "These photos are mine, or I have permission to use them" },
  ],
  tone: "default",
};

// ═══════════════════════════════════════════════════════════════════════════
// 5 · Google Business Profile
// ═══════════════════════════════════════════════════════════════════════════
const GOOGLE_BUSINESS: RequestTemplate = {
  key: "google_business",
  title: "Give us access to your Google listing",
  eyebrow: "One thing we need from you",
  pickerLabel: "Google Business Profile",
  pickerHint: "Manager access to the Google listing. Needed to connect the map, the hours and the reviews to the site.",
  noun: "Google listing",
  blocks: "your listing and your website stay disconnected from each other",
  minutes: 10,
  emailIntro:
    "Your Google listing — the box with your hours, your map pin and your reviews that shows up " +
    "when somebody searches your name — needs to point at the new site, and we would like to keep " +
    "it accurate for you.",
  why:
    "For a local business the Google listing sends more people to you than the website does. The " +
    "two are supposed to agree with each other: same phone number, same hours, same address. When " +
    "they disagree, Google trusts neither.",
  steps: [
    {
      id: "check",
      title: "See whether you have one",
      body: [
        "Search your business name and your town on Google. If a panel appears on the right with your hours and a map, the listing exists.",
        "If it says “Own this business?”, it exists but nobody has claimed it — click that and follow the steps. Google usually verifies by postcard or phone, and the postcard takes about a week, so start it today.",
      ],
    },
    {
      id: "invite",
      title: "Add us as a manager",
      body: [
        `Open the listing while signed in as the owner, go to Settings, then People and access, then Add. Enter ${OUR_EMAIL} and choose the Manager role.`,
        "Manager lets us update hours, post photos and fix the website link. It cannot remove you, cannot transfer ownership, and you can take it away at any time.",
      ],
      callout: "Manager, not Owner. You stay the owner of your own listing.",
    },
  ],
  fields: [
    {
      key: "listing_state",
      label: "Where does the listing stand?",
      type: "select",
      required: true,
      options: [
        "It exists and I have added you as a manager",
        "It exists but I cannot get into it",
        "It exists and nobody has claimed it",
        "I could not find one",
      ],
    },
    {
      key: "listing_url",
      label: "Link to the listing, if you have it",
      type: "url",
      placeholder: "https://maps.app.goo.gl/...",
      max: 500,
    },
    {
      key: "hours",
      label: "Your hours, so we can check they match",
      type: "textarea",
      placeholder: "Mon–Fri 7–5, Sat by appointment",
      max: 1000,
    },
  ],
  confirm: [],
  tone: "default",
};

export const REQUEST_TEMPLATES: RequestTemplate[] = [
  STRIPE, DOMAIN, BRAND_ASSETS, CONTENT, GOOGLE_BUSINESS,
].map(assertNoCredentialFields);

export const TEMPLATES_BY_KEY: Record<string, RequestTemplate> = Object.fromEntries(
  REQUEST_TEMPLATES.map((t) => [t.key, t])
);

export function getTemplate(key: string): RequestTemplate | null {
  return TEMPLATES_BY_KEY[key] ?? null;
}

export { NEVER_ASK };

/** Status vocabulary, matching the check constraint in migration 0022. */
export const REQUEST_STATUSES = [
  "draft", "sent", "opened", "started", "completed", "canceled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  opened: "Opened",
  started: "Started",
  completed: "Done",
  canceled: "Canceled",
};

/** Tone classes the `.cc-chip` styles already define. */
export const STATUS_TONE: Record<RequestStatus, string> = {
  draft: "",
  sent: "t-warn",
  opened: "t-warn",
  started: "t-warn",
  completed: "t-ok",
  canceled: "",
};

/** Ordering for the admin list: what is waiting on them, first. */
export const STATUS_RANK: Record<RequestStatus, number> = {
  started: 0, opened: 1, sent: 2, draft: 3, completed: 4, canceled: 5,
};

export const OPEN_STATUSES: RequestStatus[] = ["sent", "opened", "started"];
