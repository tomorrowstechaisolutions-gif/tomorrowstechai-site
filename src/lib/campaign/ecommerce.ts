/**
 * Single source of truth for the $999 E-Commerce Website.
 *
 * The two numbers that matter most here are the ones people misread: the
 * store supports 100+ products, but only 20 are entered as part of the build.
 * That gap is the single most likely source of a "but I thought…" conversation
 * on this package, so it is stated on the page more than once.
 */

export const ECOM_CAMPAIGN_ID = "ecommerce-website";
export const ECOM_CAMPAIGN_NAME = "$999 E-Commerce Website";

export const ECOM_PRICE = 999;
export const ECOM_PRICE_CENTS = 99900;
export const ECOM_CURRENCY = "USD";

export const ECOM_HOSTING = 29;
export const ECOM_HOSTING_TRIAL_DAYS = 30;

/**
 * The ad puts "Ongoing Management (Available as Add-On)" in its NOT INCLUDED
 * column, so the $29 here buys hosting, not anyone's time — same as Starter,
 * and unlike the $399 Classic where management is part of it.
 */
export const ECOM_HOSTING_DISCLOSURE =
  "Hosting: $29/month, free for the first 30 days. Covers hosting, SSL, backups and security updates. Ongoing store management — adding products, changing prices, running promotions — is an add-on rather than part of the monthly. Cancel any time and we hand you the files.";

/** Products entered by us as part of the build. */
export const ECOM_PRODUCTS_INCLUDED = 20;

/** What the store itself will carry once it is yours. */
export const ECOM_PRODUCTS_SUPPORTED = "100+";

/** The ad states no turnaround for this tier, so neither does the page. */
export const ECOM_TURNAROUND: string | null = null;

export const ECOM_INCLUDED = [
  { title: "Custom e-commerce website", body: "A real store designed around your products and your brand, not a marketplace stall." },
  { title: "Up to 8–10 informational pages", body: "Home, about, contact, shipping, returns, FAQ — the pages that answer the questions that stop a sale." },
  { title: "Product catalog", body: "Structured properly from the start, so adding the 21st product later is easy rather than a rebuild." },
  { title: `Up to ${ECOM_PRODUCTS_INCLUDED} products entered by us`, body: "We do the first twenty: images, descriptions, prices, options. Beyond that is a straightforward add-on." },
  { title: `Store supports ${ECOM_PRODUCTS_SUPPORTED} products`, body: "The build is not capped at twenty. That is how many we enter for you; you can add as many as you like afterwards." },
  { title: "Categories & collections", body: "So people can browse the way they actually shop rather than scrolling one long list." },
  { title: "Product search", body: "Because a customer who cannot find it does not buy it." },
  { title: "Shopping cart", body: "Add, adjust, remove — and it remembers, so a distracted customer can come back." },
  { title: "Secure checkout", body: "Fast, trusted and mobile-first. Most abandoned carts are abandoned on a phone." },
  { title: "Payment integration", body: "Stripe, PayPal and more. Money lands in your account, not ours." },
  { title: "Shipping setup", body: "Rates, zones and options — domestic and international — configured to how you actually ship." },
  { title: "Tax configuration", body: "Set up correctly for where you sell, so you are not fixing it at year end." },
  { title: "Order notifications", body: "You know the moment an order lands. So does your customer." },
  { title: "Customer account capability", body: "Login and order history, so repeat buyers do not start from scratch every time." },
  { title: "Social media integration", body: "Your profiles connected, and your products shareable." },
  { title: "Mobile responsive store", body: "Built mobile-first, because that is where most of your customers will buy." },
  { title: "Basic SEO setup", body: "Product and page metadata, sitemap and the technical basics so you can be found." },
  { title: "Analytics setup", body: "Where visitors come from and what they buy, in plain numbers." },
  { title: "3 revision rounds", body: "Three passes to get it right before you start selling." },
  { title: "Launch support", body: "We are on hand through go-live and the first real orders." },
];

export const ECOM_HIGHLIGHTS = [
  { title: "Secure checkout", body: "Safe and trusted." },
  { title: "Payment integration", body: "Stripe, PayPal and more." },
  { title: "Shipping setup", body: "Domestic and international." },
  { title: "Customer accounts", body: "Login and order history." },
  { title: "Mobile responsive", body: "Looks right everywhere." },
  { title: "SEO & analytics ready", body: "Get found. Track growth." },
];

export const ECOM_NOT_INCLUDED = [
  `Product data entry beyond ${ECOM_PRODUCTS_INCLUDED} products (available as an add-on)`,
  "Custom app development",
  "Advanced automation systems",
  "CRM or business workflows",
  "Ongoing store management (available as an add-on)",
  "Product photography",
  "Copywriting for large catalogs",
  "Ongoing marketing or ad management",
];

export const ECOM_STEPS = [
  { n: "01", title: "Tell us about your store", body: "Two minutes on the form below. What you sell, roughly how many products, and how you ship. No payment now." },
  { n: "02", title: "We scope it with you", body: "Products, categories, shipping, tax and payments. This is where we find out whether twenty entered products covers you or you want the add-on." },
  { n: "03", title: "You send products and content", body: "Images, descriptions, prices and options — plus your logo and the pages. A short online form collects it in one go." },
  { n: "04", title: "We build and configure the store", body: "Catalog, cart, checkout, payments, shipping, tax, accounts, analytics. Tested with real test orders before you see it." },
  { n: "05", title: "Three revision rounds, then you sell", body: "Three passes to get it right. Then domain, SSL, go-live and launch support through your first real orders." },
];

export const ECOM_FOR_YOU = [
  "You have products to sell and no proper way to sell them online.",
  "You are taking orders through DMs, texts or a spreadsheet and it does not scale.",
  "You are paying a marketplace a cut on every sale and want your own storefront.",
  "You want customers to check out themselves instead of waiting for you to send an invoice.",
];

export const ECOM_NOT_FOR_YOU = [
  "You do not sell products — the $149, $399 and $699 website packages are cheaper and a better fit.",
  "You have a catalog of hundreds of items you need entered for you. The store handles them; entering them is an add-on and worth quoting properly.",
  "You need custom software, automations or a CRM behind the store on day one. Those are separate builds.",
];

export const ECOM_FAQ = [
  {
    q: `Only ${ECOM_PRODUCTS_INCLUDED} products? I have more than that.`,
    a: `The store is not limited to ${ECOM_PRODUCTS_INCLUDED} — it supports ${ECOM_PRODUCTS_SUPPORTED}. Twenty is how many we enter for you as part of the $999. You can add the rest yourself, or we can quote entering them. Tell us your catalog size on the form and we will price it properly rather than surprising you later.`,
  },
  {
    q: "Is $999 really the total build price?",
    a: "Yes for the build as described. Hosting is $29/month after the first 30 days free. Product entry beyond twenty and ongoing store management are add-ons, priced when you ask for them and never assumed.",
  },
  {
    q: "Which payment processors can I use?",
    a: "Stripe and PayPal are the usual two, and there are others we can wire up. You hold the account and the money goes straight to you — we never sit between you and your revenue.",
  },
  {
    q: "What about shipping and sales tax?",
    a: "Both are set up as part of the build: shipping rates, zones and options for where you actually ship, and tax configured for where you sell. Tell us on the call if you ship internationally, because it changes how we set it up.",
  },
  {
    q: "How long does it take?",
    a: "We will give you a date once we know your catalog and how you ship. A twenty-product store with international shipping is a different job from a five-product local one, so we would rather commit to a real date on the call than print an average and miss it.",
  },
  {
    q: "Do I own the store?",
    a: "Yes. The store, the domain, the product data and the customer list are yours. Stop the $29/month whenever you like and we hand over the files and help you move.",
  },
  {
    q: "Can you manage the store for me afterwards?",
    a: "Yes, as an add-on — adding products, changing prices, running promotions. It is deliberately not bundled into the $29, because most people do not need it and should not pay for it.",
  },
];
