import type { Course } from "../types";

/**
 * Courses that are designed but not recorded yet. Each shows its outline and a
 * founding-student list. When one is ready, give it `modules` (see
 * speak-method.ts for the shape), move it to its own file if it gets long,
 * and set `status` to "waitlist" or "open".
 */

export const humanAdvantage: Course = {
  slug: "human-advantage",
  title: "The Human Advantage: Building Trust, Not Titles",
  tagline: "For AI founders and consultants who want a real business, not a fancy title and a feed full of copy-paste posts.",
  level: 2,
  price: { kind: "tbd" },
  status: "planned",
  framework: "human",
  volume: "04",
  audience: "New AI founders, consultants and agency owners without an established reputation yet.",
  build: "Your 30-day local business action plan, worked with real businesses in your own area.",
  outcomes: [
    "Earn credibility without leaning on a title",
    "Use AI without losing your own voice",
    "Walk into a local business to understand a problem, not to sell AI",
    "Turn one real project into referrals",
  ],
  outline: [
    "The illusion of AI entrepreneurship",
    "Credibility over credentials",
    "The dangers of generic AI content",
    "Developing your authentic voice",
    "The H.U.M.A.N. Method",
    "Boots-on-the-ground business development",
    "Discovering local business opportunities",
    "How to approach business owners",
    "Listening before selling",
    "Demonstrating value through real projects",
    "Building a reputation from nothing",
    "Turning relationships into referrals",
    "The 30-day local business action plan",
    "Building a sustainable AI company",
    "The founder's code of conduct",
  ],
};

export const aiWorkforce: Course = {
  slug: "ai-workforce",
  title: "Build Your Own AI Workforce",
  tagline: "Set up a team of AI assistants for your business, tested and documented, without writing code.",
  level: 2,
  price: { kind: "paid", amount: 79 },
  status: "planned",
  volume: "01",
  audience: "Business owners and managers who want assistants for the work that repeats every week.",
  build: "Three working assistants for your own business, each with its instructions, test results and a named owner.",
  outcomes: [
    "Write assistant instructions with role, context, workflow, format and boundaries",
    "Adapt the 15 Business Bot blueprints to your company",
    "Test every assistant before your team relies on it",
    "Know where a prompt ends and real automation begins",
  ],
  outline: [
    "What a bot is (and isn't) in a business",
    "The setup worksheet: giving an assistant your business context",
    "Executive, project and operations assistants",
    "Customer service, sales and marketing assistants",
    "HR, SOP and training assistants",
    "Research, finance and quality control assistants",
    "The Custom Bot Builder: designing your own",
    "Test before you trust: normal, missing-info and boundary tests",
    "Rolling assistants out to your team",
  ],
};

export const aiForSmallBusiness: Course = {
  slug: "ai-for-small-business",
  title: "AI for Small Business Owners",
  tagline: "Find where AI actually saves your business time and money, prove it with a small pilot, then scale what works.",
  level: 2,
  price: { kind: "paid", amount: 99 },
  status: "planned",
  volume: "03",
  audience: "Owners and operators who know they should be using AI but don't know where to start.",
  build: "A scored opportunity list and a 30-day pilot plan for one real workflow in your business.",
  outcomes: [
    "Score your AI readiness honestly",
    "Map a workflow the way it really runs, not how the procedure says",
    "Pick the right tool: AI, rules, integration or process fix",
    "Estimate value without fooling yourself",
    "Run a safe pilot and decide: expand, revise or stop",
  ],
  outline: [
    "Assess: readiness, ownership and data",
    "Map the workflow and find the hidden friction",
    "The automation opportunity checklist",
    "Choosing the right technology",
    "Scoring and prioritizing opportunities",
    "Calculating value and ROI",
    "Designing a safe pilot",
    "Protecting your business data",
    "Build, configure or hire?",
    "Your 30-day implementation roadmap",
  ],
};

export const websitesWithAi: Course = {
  slug: "websites-with-ai",
  title: "Build Professional Websites Using AI",
  tagline: "Go from a spoken idea to a real, live, professional website, using the same process behind this site.",
  level: 3,
  price: { kind: "paid", amount: 149 },
  status: "planned",
  audience: "Owners, freelancers and new builders who want a site that doesn't look like a template.",
  build: "A live website on your own domain, with a working contact form.",
  outcomes: [
    "Turn your idea into a website brief with S.P.E.A.K.",
    "Build pages with AI coding tools, not drag-and-drop templates",
    "Deploy it, connect a domain, and capture leads",
    "Keep it fast, findable and maintainable",
  ],
  outline: [
    "From a spoken vision to a page plan",
    "Your tools: AI coding assistants and where the code lives",
    "Building the pages",
    "Design that doesn't look AI-made",
    "Forms, lead capture and email",
    "Going live: hosting and your domain",
    "SEO basics and getting found",
    "Maintaining and improving it with AI",
  ],
};

export const automationMasterclass: Course = {
  slug: "automation-masterclass",
  title: "Business Automation Masterclass",
  tagline: "Connect the tools a business already uses so routine work moves on its own, with people approving what matters.",
  level: 3,
  price: { kind: "paid", amount: 199 },
  status: "planned",
  audience: "Operators, office managers and builders tired of copying data between systems by hand.",
  build: "One automated workflow running in a real business, with an approval step and a way to roll it back.",
  outcomes: [
    "Spot what should be rules, what needs AI, and what needs a person",
    "Build triggers, routing and approvals",
    "Connect forms, email, CRM and spreadsheets",
    "Monitor automations so failures don't hide",
  ],
  outline: [
    "Mapping the work before you automate it",
    "Rules vs. AI vs. people",
    "Triggers, actions and approvals",
    "Connecting your systems",
    "Adding AI steps safely",
    "Monitoring, logs and rollback",
    "Case study: a lead-to-booking workflow",
  ],
};

export const saasWithAi: Course = {
  slug: "saas-with-ai",
  title: "Build Your Own SaaS Application With AI",
  tagline: "Plan, build and launch a real software product with AI as your development partner.",
  level: 3,
  price: { kind: "paid", amount: 299 },
  status: "planned",
  audience: "Founders and builders with an app idea and the drive to ship it.",
  build: "A deployed web app with accounts, a database and a payment flow.",
  outcomes: [
    "Scope an MVP you can actually finish",
    "Build with AI coding tools from database to interface",
    "Add sign-in, data and payments",
    "Ship it, test it with real users and keep improving",
  ],
  outline: [
    "From idea to MVP scope",
    "Your stack and your AI coding workflow",
    "Data: designing the database",
    "Accounts and sign-in",
    "Building the core feature",
    "Payments and plans",
    "Testing, deploying and monitoring",
    "Launching to your first users",
  ],
};

export const aiBuilderProgram: Course = {
  slug: "ai-builder-program",
  title: "Complete AI Builder Program",
  tagline: "The full path: communicate, build, automate and launch. Everything in the Academy, in order, with projects at every step.",
  level: 3,
  price: { kind: "paid", amount: 499 },
  status: "planned",
  audience: "People who want to do what we do: build real AI-powered systems for themselves or for clients.",
  build: "A portfolio: a website, an automation and an app you built, ready to show clients.",
  outcomes: [
    "Everything from the Practitioner and Builder courses",
    "A finished portfolio of real projects",
    "How to scope, price and deliver work for clients",
  ],
  outline: [
    "Mastering AI Communication: The S.P.E.A.K. Method",
    "Build Your Own AI Workforce",
    "AI for Small Business Owners",
    "Build Professional Websites Using AI",
    "Business Automation Masterclass",
    "Build Your Own SaaS Application With AI",
    "The Human Advantage",
    "Capstone: a client project, start to finish",
  ],
};
