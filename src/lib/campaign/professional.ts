/**
 * Single source of truth for the $699 Professional Business Website.
 *
 * The pitch in the ad is "not just a website — a website designed to generate
 * and organize business". That is the whole reason this tier exists above the
 * $399: the pages are the smaller half, the workflows behind them are the
 * point.
 */

export const PRO_CAMPAIGN_ID = "professional-website";
export const PRO_CAMPAIGN_NAME = "$699 Professional Website";

export const PRO_PRICE = 699;
export const PRO_PRICE_CENTS = 69900;
export const PRO_CURRENCY = "USD";

export const PRO_HOSTING = 29;
export const PRO_HOSTING_TRIAL_DAYS = 30;

export const PRO_HOSTING_DISCLOSURE =
  "Hosting & management: $29/month, free for the first 30 days. Covers hosting, SSL, backups, security updates and small content changes. Cancel any time and we hand you the files.";

/**
 * The ad states no turnaround for this tier, so neither does the page.
 * Starter is 2–3 business days and Classic is 7–14; a ten-page build with
 * workflows behind it is neither, and inventing a number here is how a
 * promise gets broken. Ask John, then put it in this file.
 */
export const PRO_TURNAROUND: string | null = null;

export const PRO_INCLUDED = [
  { title: "Up to 10 custom pages", body: "Room for every service, every location and the pages that actually answer what customers ask." },
  { title: "Premium custom design", body: "Designed around your brand rather than dropped into a layout. Custom, modern, yours." },
  { title: "Custom graphics & image treatment", body: "Your photos edited, cropped and treated so the whole site looks like one piece of work." },
  { title: "Multiple lead forms", body: "Different forms for different intents, so a quote request and a general question do not land in the same undifferentiated pile." },
  { title: "Quote / request form", body: "A structured form that asks what you need to know before you pick up the phone." },
  { title: "Lead capture workflow", body: "What happens after someone hits send: where it goes, who is told, and what they see next." },
  { title: "CRM-ready integration", body: "Built so your leads can flow into a CRM cleanly — ours, or one you already use." },
  { title: "Appointment / inquiry workflow", body: "Requests come in organized, with the information you need to answer them attached." },
  { title: "Blog / news capability", body: "Somewhere to publish, which is also how you keep giving Google reasons to rank you." },
  { title: "Google Analytics", body: "Real numbers on who arrives, from where, and what they do." },
  { title: "Google Search Console setup", body: "So you can see the searches you show up for and the ones you are missing." },
  { title: "Enhanced on-page SEO", body: "Beyond the basics: structured data, internal linking and per-page targeting." },
  { title: "Conversion tracking", body: "Which pages and which forms actually produce work. Without this you are guessing." },
  { title: "Email notification automation", body: "The right person told the moment a lead lands, without anyone watching an inbox." },
  { title: "Advanced testimonials & project galleries", body: "Your real work and your real reviews, laid out to be believed." },
  { title: "3 revision rounds", body: "Three passes to get it right, not one." },
  { title: "30 days of launch support", body: "A month of us on hand after go-live, while the site meets real traffic." },
];

/** Straight from the ad's own "Why upgrade?" column. */
export const PRO_WHY_UPGRADE = [
  { title: "More pages, deeper customization", body: "Ten pages designed around your business instead of five on a proven layout." },
  { title: "Better lead generation", body: "Multiple forms, a real quote request, and a page structure built to convert rather than just inform." },
  { title: "Organized inquiries and quote requests", body: "Structured, routed and notified — not a pile of identical emails." },
  { title: "Built to support business growth", body: "The workflows and tracking are already in place when you are ready to spend on traffic." },
];

/**
 * Said plainly. This tier organizes leads; it is not the full command center,
 * and the gap between those two is where expectations get expensive.
 */
export const PRO_NOT_INCLUDED = [
  "E-commerce or an online store",
  "A full custom CRM with pipelines and assignment rules",
  "AI agents and custom AI assistants",
  "Custom automations beyond the lead and inquiry workflows above",
  "Custom applications or SaaS products",
  "Third-party system integrations",
  "Ongoing marketing, ad management or content production",
  "Photography and video production",
];

export const PRO_STEPS = [
  { n: "01", title: "Tell us about your business", body: "Two minutes on the form below. No payment now — we confirm the plan with you first." },
  { n: "02", title: "We scope the ten pages", body: "A real conversation about your services, your customers and what the site has to make happen. This is the step that earns the price difference." },
  { n: "03", title: "You send your content", body: "A short online form collects your logo, photos, services and hours in one go." },
  { n: "04", title: "We design and build", body: "Custom design, the pages, the forms, the workflows, analytics and tracking — wired together, not bolted on." },
  { n: "05", title: "Three revision rounds, then live", body: "Three passes to get it right. Then domain, SSL, go-live, and 30 days of support while it meets real traffic." },
];

export const PRO_FOR_YOU = [
  "You have more than a handful of services and five pages will not hold them.",
  "Leads already come in, and losing track of them is costing you work.",
  "You want to know which pages produce business, not just that people visited.",
  "You are about to spend money on ads and want somewhere worth sending the traffic.",
  "You want the site to look like it was made for you, not adapted to you.",
];

export const PRO_NOT_FOR_YOU = [
  "You need to sell products online — that is the $999 E-Commerce package.",
  "Three pages and a contact form would genuinely do the job — start at $149 or $399 and keep the difference.",
  "You need a full CRM, AI agents or custom software on day one. Those are separate builds, quoted separately.",
];

export const PRO_FAQ = [
  {
    q: "What makes this $300 more than the $399 package?",
    a: "Two things. Pages — up to ten, custom designed, rather than five on a proven layout. And the machinery behind them: multiple lead forms, a structured quote request, a lead capture workflow, appointment and inquiry handling, email notification automation, and conversion tracking so you can see which of it works. The $399 gets you online and looking right. This one is built to bring work in and keep it organized.",
  },
  {
    q: "Is a CRM included?",
    a: "This tier is CRM-ready rather than a CRM build: your leads are captured, structured and routed so they flow into a CRM cleanly, ours or one you already use. If you want pipelines, assignment rules and reporting built for you, that is a separate quote — and worth having the conversation before we start rather than after.",
  },
  {
    q: "How long does it take?",
    a: "We will give you a date once we have scoped your ten pages. A custom ten-page build with workflows behind it is not the same job twice, so we would rather commit to a real date on the call than print an average here and miss it.",
  },
  {
    q: "Is $699 really the total build price?",
    a: "Yes. $699 one time, then hosting and management at $29/month after the first 30 days free. That covers hosting, SSL, backups, security updates and small content changes. Anything in the 'not included' list above is quoted separately and never assumed.",
  },
  {
    q: "What do I need to have ready?",
    a: "Your logo, real photos of your work, your service list, your service area and your hours. The design is on us; the raw material has to come from you, and how fast it arrives is usually what decides the timeline.",
  },
  {
    q: "Do I own the site?",
    a: "Yes. The site, the domain and the content are yours. Stop the $29/month whenever you like and we hand over the files and help you move.",
  },
  {
    q: "Can I start smaller and upgrade to this?",
    a: "Yes, and nothing is wasted — we build on what is there. But if you already know you need ten pages and lead workflows, starting here is cheaper than doing it twice.",
  },
];
