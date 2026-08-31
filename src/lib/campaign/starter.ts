/**
 * Single source of truth for the $149 Starter Website offer.
 *
 * Every line here traces to John's ad creative. Where the ad is silent the
 * page is silent too — this is the entry-level package and the fastest way to
 * ruin it is to imply it does more than it does.
 */

export const STARTER_CAMPAIGN_ID = "starter-website";
export const STARTER_CAMPAIGN_NAME = "$149 Starter Website";

export const STARTER_PRICE = 149;
export const STARTER_PRICE_CENTS = 14900;
export const STARTER_CURRENCY = "USD";

export const STARTER_HOSTING = 29;
export const STARTER_HOSTING_TRIAL_DAYS = 30;

/**
 * The ad says "hosting is a required monthly charge" and, in the same breath,
 * "no monthly management plan". Both are true and they are not the same thing:
 * the $29 keeps the site online, it does not buy anyone's time. Saying that
 * plainly here is cheaper than saying it later to someone who expected monthly
 * content edits.
 */
export const STARTER_HOSTING_DISCLOSURE =
  "Hosting is required: $29/month, free for the first 30 days. It covers hosting, SSL, backups and security updates. It is not a management retainer — content changes after launch are quoted separately. Cancel any time and we hand you the files.";

/** Typical turnaround, in business days, counted from content received. */
export const STARTER_TURNAROUND_DAYS = "2–3";

export const STARTER_INCLUDED = [
  { title: "Up to 3 pages", body: "Home, Services and Contact. The three a customer actually needs to decide whether to call you." },
  { title: "Professional starter layout", body: "A proven layout, customized to your business, your services and your photos." },
  { title: "Mobile responsive design", body: "Built to read properly on a phone, because that is where nearly everyone will find you." },
  { title: "Contact / lead form", body: "Goes to your inbox. Spam-protected and validated, so what arrives is real." },
  { title: "Basic SEO setup", body: "Titles, descriptions, sitemap and the technical basics so Google can index you." },
  { title: "Domain connection", body: "We connect the domain you own, or help you pick and register the right one." },
  { title: "SSL setup", body: "HTTPS from day one. No browser warning in front of your business." },
  { title: "Deployment", body: "Live on fast, modern hosting — the same stack this site runs on." },
  { title: "1 revision round", body: "You review the build, we make your changes, then it goes live." },
];

/**
 * Said plainly, in the ad's own words. Hiding the boundary on a $149 package
 * is how you end up doing $1,500 of work for $149.
 */
export const STARTER_NOT_INCLUDED = [
  "E-commerce or online store",
  "CRM",
  "Booking systems",
  "Advanced automation",
  "Custom app development",
  "Large copywriting projects",
  "Unlimited revisions",
  "A monthly management plan",
];

/**
 * The single biggest reason a 2–3 day build turns into a three-week one.
 * On the page before the form, not in an email afterwards.
 */
export const STARTER_YOU_PROVIDE = [
  { title: "Your logo", body: "Whatever you have. If you have nothing, our Logo Studio can make one." },
  { title: "Business information", body: "Name, address or service area, phone, email and your hours." },
  { title: "Photos", body: "Real photos of your work, your team, your truck. Real beats stock every time." },
  { title: "Service information", body: "What you do, who you do it for, and what you want to be called about." },
];

export const STARTER_STEPS = [
  {
    n: "01",
    title: "Tell us about your business",
    body: "Two minutes on the form below. No call needed to get started, and no payment yet.",
  },
  {
    n: "02",
    title: "We confirm and take payment",
    body: "A short email or call to check the Starter package is genuinely the right fit. $149, one time.",
  },
  {
    n: "03",
    title: "You send your content",
    body: "A short online form collects your logo, photos, services and hours in one go. This is the step that decides how fast the rest goes.",
  },
  {
    n: "04",
    title: "We build it in 2–3 business days",
    body: "The clock starts once your content is in and checked — not the day you pay.",
  },
  {
    n: "05",
    title: "You review, then it goes live",
    body: "One revision round included, then we connect your domain, turn on SSL and hand you the keys.",
  },
];

export const STARTER_FOR_YOU = [
  "You have no website at all and you need one this week.",
  "You are sending customers to a Facebook page because there is nothing else to send them to.",
  "You want to look legitimate when someone searches your name.",
  "You would rather start small and add the rest when it earns its place.",
];

export const STARTER_NOT_FOR_YOU = [
  "You need to sell products online — that is the $999 E-Commerce package.",
  "You need lead workflows, a CRM or booking — start at $399 or $699.",
  "You want an original design written for your market rather than a proven layout.",
];

export const STARTER_FAQ = [
  {
    q: "Is $149 really the total build price?",
    a: "Yes. $149 is the one-time build. The only other cost is hosting at $29/month, free for the first 30 days, which keeps the site online, secured and backed up. There is nothing else.",
  },
  {
    q: "Why is hosting required?",
    a: "A website has to live somewhere, and that somewhere has to stay patched, backed up and covered by an SSL certificate. The $29 covers that. What it is not is a management retainer — it does not include ongoing content changes.",
  },
  {
    q: "How fast is it really?",
    a: "Typically 2–3 business days, and the clock starts when we have your content — logo, photos, services and hours — not when you pay. Almost every slow build is a build waiting on content.",
  },
  {
    q: "What if I don't have a logo or photos?",
    a: "We can generate a logo for you in our Logo Studio. Photos are harder: a few honest phone pictures of your actual work will do more for you than any stock image, so it is worth twenty minutes before we start.",
  },
  {
    q: "What is the difference between this and the $399 package?",
    a: "Pages and machinery. Starter is 3 pages and a contact form. The $399 Classic is up to 5 pages with social integration, a map, testimonials, analytics and a conversion-focused layout. If you need lead capture workflows or a CRM behind the site, you want $699.",
  },
  {
    q: "Do I own the site?",
    a: "Yes. The site, the domain and the content are yours. Stop the $29 whenever you like and we hand over the files and help you move.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes, and plenty of people do. What you pay for Starter is not wasted — we build on it rather than starting again.",
  },
  {
    q: "Is this a template?",
    a: "The layout is proven and repeatable. That is exactly how it costs $149 instead of the $1,500 to $3,000 a fully custom build costs. Your content, colours, photos and services are yours; the structure is one we already know converts.",
  },
];
