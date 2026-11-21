/**
 * The site guide's script: what Tess says to a visitor, what they can answer,
 * and which service each path ends on.
 *
 * It is data, not AI. Every line is written here once, recorded once in her
 * voice, and replayed for every visitor, so a visit costs nothing. The page
 * only ever asks `nextStep` what comes after an answer, so a live model can
 * take that function's place later without the page changing.
 *
 * No `server-only`: the page, the recorder and the tests all read this.
 */

export type GuideOption = { label: string; to: string };

/** A question she asks, with the answers the visitor can pick. */
export type GuideQuestion = { kind: "question"; id: string; say: string; options: GuideOption[] };

/** Where a path ends: what she recommends and where its button goes. */
export type GuideOutcome = {
  kind: "outcome";
  id: string;
  say: string;
  /** catalog_items.slug of the offer she recommends. */
  offer: string;
  /** Where "See it" goes. */
  href: string;
  /** What the visitor was after, in a few words, for the lead record. */
  need: string;
};

/** A line with no choice attached: the greeting and the pop-up. */
export type GuideLine = { kind: "line"; id: string; say: string };

export type GuideStep = GuideQuestion | GuideOutcome | GuideLine;

export const GUIDE_START = "start";
export const GUIDE_WELCOME = "welcome";
/** The pop-up's words. Shown only, never spoken: a browser will not play sound before the visitor clicks. */
export const GUIDE_INVITE_TEXT = "How can we help you?";

const q = (id: string, say: string, options: [string, string][]): GuideQuestion => ({ kind: "question", id, say, options: options.map(([label, to]) => ({ label, to })) });
const end = (id: string, offer: string, href: string, need: string, say: string): GuideOutcome => ({ kind: "outcome", id, say, offer, href, need });

export const GUIDE_STEPS: GuideStep[] = [
  { kind: "line", id: GUIDE_WELCOME, say: "Hi, I'm Tess. I'll help you find the right fit in about a minute. Before we start, who am I talking to?" },

  q(GUIDE_START, "Thanks. What brought you here today?", [
    ["I need a website", "web"],
    ["I need more customers", "grow"],
    ["I'm missing calls and follow-ups", "ai"],
    ["My business runs on spreadsheets and texts", "out-systems"],
  ]),

  q("web", "Got it. What do you have right now?", [
    ["No website yet", "web-size"],
    ["A website that looks outdated", "web-size"],
    ["I need to sell products online", "out-ecommerce"],
    ["I want something fully custom", "out-custom-site"],
  ]),
  q("web-size", "How much does your website need to do?", [
    ["Just the basics: who we are and how to reach us", "out-starter"],
    ["A full business site with our services and reviews", "out-classic"],
    ["Booking, a blog, galleries and more", "out-professional"],
  ]),

  q("grow", "Where do you want more customers to come from?", [
    ["Social media", "grow-level"],
    ["Google search", "out-seo"],
    ["Paid ads", "out-ads"],
    ["I'm not sure", "out-audience-growth"],
  ]),
  q("grow-level", "How much of the posting do you want off your plate?", [
    ["Keep me active with regular posts", "out-audience-starter"],
    ["Build my audience and bring in leads", "out-audience-growth"],
    ["Run all of my marketing for me", "out-audience-full"],
  ]),

  q("ai", "What slips through the cracks most?", [
    ["Calls I can't answer", "out-missed-call"],
    ["Booking appointments", "out-booking"],
    ["Following up on leads and estimates", "out-ai-growth"],
    ["All of it", "out-ai-operator"],
  ]),

  end("out-starter", "website-starter", "/starter-website", "A simple first website", "A Starter Website fits. It covers the basics, so people can find you and reach you, and it gets you online fast."),
  end("out-classic", "website-classic", "/business-launch", "A full business website", "The Classic Business Website fits. It gives your services room and helps visitors trust you enough to call."),
  end("out-professional", "website-professional", "/professional-website", "A website with booking and more", "The Professional Business Website fits. It is built for a business that needs its site to do real work, like booking and showing off finished jobs."),
  end("out-ecommerce", "website-ecommerce", "/ecommerce-website", "An online store", "The E-Commerce Website fits. It sets you up to list products and take payment online."),
  end("out-custom-site", "website-custom", "/contact?service=website-custom", "A custom-built website", "A Custom Built Website fits. It is designed and written around your business from the ground up, so the first step is a short conversation with John."),

  end("out-audience-starter", "audience-starter", "/services/grow-your-audience", "Regular social media posts", "Grow Your Audience Starter fits. It keeps your business active and posting, without you having to think about it."),
  end("out-audience-growth", "audience-growth", "/services/grow-your-audience", "More customers through marketing", "Grow Your Audience Growth fits. It builds your following and turns that attention into leads."),
  end("out-audience-full", "audience-full-service", "/services/grow-your-audience", "Marketing fully handled", "Grow Your Audience Full Service fits. We run your marketing, so you can run your business."),
  end("out-seo", "seo", "/contact?service=seo", "Showing up on Google", "Search Engine Optimization fits. It helps the people already searching for what you do find you first."),
  end("out-ads", "paid-advertising", "/contact?service=paid-advertising", "Paid advertising", "Paid Advertising fits. We build and manage the ads, so your budget goes toward customers and not guesswork."),

  end("out-missed-call", "missed-call-text-back", "/contact?service=missed-call-text-back", "Catching missed calls", "Missed-Call Text Back fits. When you can't pick up, the caller gets a text right away, so the job doesn't go to someone else."),
  end("out-booking", "appointment-booking", "/contact?service=appointment-booking", "Booking appointments", "Appointment Booking fits. Customers pick a time themselves and get a confirmation, with no phone tag."),
  end("out-ai-growth", "ai-operator-growth", "/services/ai-business-operator", "Following up on leads and estimates", "AI Growth fits. It follows up with every lead for you and keeps them in one place, so nothing goes cold."),
  end("out-ai-operator", "ai-operator-operator", "/services/ai-business-operator", "Calls, booking and follow-up handled", "AI Operator fits. It handles the calls, booking and follow-up together, so the day-to-day runs without you chasing it."),

  end("out-systems", "run-your-business-custom", "/services/run-your-business", "One system to run the business", "A Custom Business System fits. It pulls your customers, jobs and schedule into one place built around how you work. The first step is a short conversation with John."),
];

const BY_ID = new Map(GUIDE_STEPS.map((s) => [s.id, s]));

export function guideStep(id: string): GuideStep | null {
  return BY_ID.get(id) ?? null;
}

/** What comes after the visitor picks answer `choice` (its place in the list) at question `id`. Null when that is not a real answer. */
export function nextStep(id: string, choice: number): GuideStep | null {
  const at = BY_ID.get(id);
  if (!at || at.kind !== "question") return null;
  const picked = at.options[choice];
  return picked ? (BY_ID.get(picked.to) ?? null) : null;
}

/** The slugs of every offer the script can recommend. */
export function guideOfferSlugs(steps: GuideStep[] = GUIDE_STEPS): string[] {
  return [...new Set(steps.filter((s): s is GuideOutcome => s.kind === "outcome").map((s) => s.offer))];
}

/** Everything wrong with a script, in plain words. Empty when it is sound. */
export function scriptProblems(steps: GuideStep[] = GUIDE_STEPS): string[] {
  const problems: string[] = [];
  const ids = new Map<string, GuideStep>();
  for (const s of steps) {
    if (ids.has(s.id)) problems.push(`Two steps are called "${s.id}".`);
    ids.set(s.id, s);
    if (!s.say.trim()) problems.push(`"${s.id}" has nothing to say.`);
    if (s.kind === "question" && s.options.length < 2) problems.push(`"${s.id}" needs at least two answers.`);
    if (s.kind === "question" && s.options.length > 5) problems.push(`"${s.id}" has more than five answers.`);
  }
  if (ids.get(GUIDE_START)?.kind !== "question") problems.push(`There is no "${GUIDE_START}" question.`);
  for (const s of steps) {
    if (s.kind !== "question") continue;
    for (const o of s.options) if (!ids.has(o.to)) problems.push(`"${s.id}" leads to "${o.to}", which does not exist.`);
  }
  // Every question and outcome can be reached, and no path loops.
  const seen = new Set<string>();
  const walk = (id: string, trail: string[]) => {
    if (trail.includes(id)) return void problems.push(`"${id}" leads back to itself.`);
    seen.add(id);
    const s = ids.get(id);
    if (s?.kind === "question") for (const o of s.options) walk(o.to, [...trail, id]);
  };
  walk(GUIDE_START, []);
  for (const s of steps) if (s.kind !== "line" && !seen.has(s.id)) problems.push(`Nothing leads to "${s.id}".`);
  return [...new Set(problems)];
}

/**
 * The file name of a line's recording. The words are part of the name, so a
 * line that is reworded gets a new file and its old recording is never played
 * over the new words.
 */
export function clipName(step: Pick<GuideStep, "id" | "say">): string {
  let h = 2166136261;
  for (let i = 0; i < step.say.length; i++) {
    h ^= step.say.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${step.id}-${(h >>> 0).toString(16).padStart(8, "0")}.mp3`;
}

/** What is written on the lead: the answers picked, in order, and what she recommended. */
export function pathSummary(path: { id: string; choice: number }[], outcomeId: string): string {
  const lines = path.map(({ id, choice }) => {
    const s = BY_ID.get(id);
    return s?.kind === "question" && s.options[choice] ? `${s.say} ${s.options[choice].label}.` : null;
  });
  const outcome = BY_ID.get(outcomeId);
  return [...lines.filter(Boolean), outcome?.kind === "outcome" ? `Tess recommended: ${outcome.need} (${outcome.offer}).` : null].filter(Boolean).join("\n");
}
