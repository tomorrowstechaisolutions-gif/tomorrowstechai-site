/**
 * Single source of truth for the $399 Business Launch offer.
 * Landing page copy, form options, emails and the admin dashboard all read
 * from here so the price can never drift between them.
 */

export const CAMPAIGN_ID = "business-launch";
export const CAMPAIGN_NAME = "$399 Business Launch";

export const OFFER_PRICE = 399;
export const OFFER_PRICE_CENTS = 39900;
export const OFFER_CURRENCY = "USD";
export const HOSTING_FROM = 29;
export const HOSTING_FROM_CENTS = 2900;

export const HOSTING_DISCLOSURE =
  "Hosting & management from $29/month, billed after your site goes live. Cancel any time.";

export const BUSINESS_TYPES = [
  "Contractor",
  "Construction",
  "Roofing",
  "HVAC",
  "Plumbing",
  "Pool Service",
  "Landscaping",
  "Automotive",
  "Professional Services",
  "Retail",
  "Restaurant",
  "Health/Wellness",
  "Other",
] as const;

export const SERVICE_OPTIONS = [
  "Website",
  "Lead Management",
  "Online Booking",
  "Payments",
  "CRM",
  "Automation",
  "AI",
  "E-commerce",
  "Other",
] as const;

/** Services that signal appetite for the higher-margin upsells. */
export const HIGH_INTENT_SERVICES = ["CRM", "Automation", "AI"];

export const TIMELINES = [
  "Immediately",
  "Within 30 days",
  "1-3 months",
  "Just researching",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
export type ServiceOption = (typeof SERVICE_OPTIONS)[number];
export type Timeline = (typeof TIMELINES)[number];

/** Everything the $399 package actually includes. */
export const INCLUDED = [
  { title: "Professional 5-page website", body: "Home, services, about, contact and one more page of your choosing — designed, written and built for your business." },
  { title: "Mobile optimization", body: "Built mobile-first. Most of your customers will find you on a phone, so that's where it has to look right." },
  { title: "Branding setup", body: "Logo placement, colors and typography applied consistently across the whole site." },
  { title: "Lead & contact capture", body: "Forms that actually land somewhere — in your inbox and in your dashboard, not into a void." },
  { title: "Starter CRM", body: "Every lead in one list with status, notes and follow-up dates. No spreadsheet." },
  { title: "Appointment / estimate requests", body: "Customers request a time or an estimate; you approve it. No phone tag." },
  { title: "Online payments", body: "Take deposits and payments online through a secure checkout." },
  { title: "Basic business dashboard", body: "One screen showing new leads, requests and activity." },
  { title: "Basic analytics", body: "Where your visitors come from and what they do, in plain numbers." },
  { title: "Google / SEO technical setup", body: "Sitemap, metadata, structured data and Google Search Console so you can actually be found." },
  { title: "Social links", body: "Your profiles connected and pointing back at the site." },
  { title: "Contact forms", body: "Spam-protected, validated, and routed to the right place." },
  { title: "Domain connection", body: "We connect the domain you own — or help you get the right one." },
  { title: "SSL / security", body: "HTTPS, secure hosting and sensible defaults from day one." },
  { title: "One revision round", body: "You review the build, we make your changes, then it goes live." },
];

/**
 * Said plainly on the page. Hiding the boundary is how you get refund
 * requests and one-star reviews.
 */
export const NOT_INCLUDED = [
  "Advanced or fully custom CRM",
  "AI agents and custom AI assistants",
  "Custom automations and workflow builds",
  "Custom applications or SaaS products",
  "Third-party system integrations",
  "Social media automation and management",
  "Advanced dashboards and reporting",
  "Ongoing marketing, ad management or content production",
  "Copywriting beyond the five pages",
  "Photography and video production",
];

export const UPGRADES = [
  { title: "Full CRM", body: "Pipelines, automations, assignment rules and reporting on top of the starter list." },
  { title: "AI agents & assistants", body: "A trained assistant that answers, qualifies and routes — on your site, your phone or your inbox." },
  { title: "Custom automation", body: "The repetitive parts of your week, running themselves." },
  { title: "Custom applications", body: "Software built around how your business actually works." },
  { title: "E-commerce", body: "Products, cart, checkout, fulfillment and inventory." },
  { title: "Advanced dashboard", body: "The full command center — jobs, crews, revenue, forecasting." },
  { title: "Social management", body: "Content calendar, assets and publishing." },
];

export const FAQ = [
  { q: "Is $399 really the total price?", a: "Yes — $399 is the one-time build. After your site is live, hosting and management is $29/month and covers hosting, SSL, backups, security updates and small content changes. That's the whole price list for this package. Nothing else is required." },
  { q: "How long does it take?", a: "Most builds go live in 7 to 14 days from the day we have your content — logo, photos, services and hours. The clock is usually waiting on content, not on us." },
  { q: "What do I need to have ready?", a: "Your business name, services, service area, hours, contact details, and any photos or logo you already have. If you don't have a logo, we can set you up with one." },
  { q: "Do I own the site?", a: "Yes. The site, the domain and the content are yours. If you ever leave, you take it with you." },
  { q: "What if I already have a website?", a: "Then this is usually a rebuild rather than a first build — same price, and we migrate what's worth keeping." },
  { q: "What happens if I stop paying the $29?", a: "The site stops being hosted and managed by us. We'll hand you the files and help you move it. Nothing is held hostage." },
  { q: "Is this a template?", a: "The structure is proven and repeatable — that's how it's $399 instead of $4,000. The design, copy and photos are yours." },
  { q: "What if I need more than this later?", a: "That's the point. The $399 package is the foundation. CRM, AI, automation, e-commerce and custom applications bolt on when you're ready, at your pace." },
];
