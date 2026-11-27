import type { Level } from "./types";

/**
 * The Academy's fixed wording: the founder's quote, mission, slogans, the two
 * methods and the principles. Change wording here and every page follows.
 */

export const FOUNDER_QUOTE =
  "Artificial intelligence should not replace your imagination. It should expand your ability to turn that imagination into reality.";

export const FOUNDER_NAME = "John C. Hockinson Jr.";

export const MISSION =
  "To empower individuals, entrepreneurs and businesses to transform their ideas into real-world solutions through artificial intelligence, regardless of their technical background.";

export const ACADEMY_NAME = "Tomorrow’s Tech AI Academy";
export const ACADEMY_TAGLINE = "Learn AI. Build with AI. Transform your business.";
export const ACADEMY_SLOGAN = "Think it. Speak it. Build it.";
export const CORE_PHILOSOPHY = "Human-led. AI-assisted.";
export const TEACHING_RULE =
  "Never let a student finish a course with just knowledge. Let them finish with something they built.";

export type MethodStep = { letter: string; title: string; detail: string };

export type Method = {
  id: "speak" | "human";
  name: string;
  subtitle: string;
  teaches: string;
  slogan: string;
  steps: MethodStep[];
};

export const SPEAK: Method = {
  id: "speak",
  name: "The S.P.E.A.K. Method",
  subtitle: "Mastering human-to-AI communication.",
  teaches: "How to communicate with technology",
  slogan: "Better Communication. Better Intelligence.",
  steps: [
    { letter: "S", title: "State your objective", detail: "Say what you want to accomplish and why it matters." },
    { letter: "P", title: "Provide context", detail: "Your situation, your background, the constraints you are working inside." },
    { letter: "E", title: "Express your expectations", detail: "The format, the audience, the tone, and what success looks like." },
    { letter: "A", title: "Ask for clarification", detail: "Have it ask you questions before it makes assumptions that matter." },
    { letter: "K", title: "Keep refining", detail: "Correct it, keep what works, and improve it pass by pass." },
  ],
};

export const HUMAN: Method = {
  id: "human",
  name: "The H.U.M.A.N. Method",
  subtitle: "Mastering human-to-human business relationships.",
  teaches: "How to build relationships with people",
  slogan: "Less Hype. More Substance.",
  steps: [
    { letter: "H", title: "Human relationships first", detail: "Build real connections before you try to sell anyone technology." },
    { letter: "U", title: "Understand real problems", detail: "Listen to owners and learn how their operation actually runs." },
    { letter: "M", title: "Make something meaningful", detail: "Build things that deliver value, not things that just get attention." },
    { letter: "A", title: "Act with authenticity", detail: "Be transparent, original and accountable for everything you put out." },
    { letter: "N", title: "Nurture long-term trust", detail: "Keep your commitments. Build relationships that outlast the transaction." },
  ],
};

export const METHODS: Method[] = [SPEAK, HUMAN];

/** Both methods are our own, independently developed. Shown wherever they are named. */
export const METHOD_NOTICE =
  "The S.P.E.A.K. and H.U.M.A.N. Methods were developed by Tomorrow’s Tech AI Solutions. No claim of exclusive trademark ownership is made.";

export const PRINCIPLES: { title: string; body: string }[] = [
  { title: "Human-led, AI-assisted", body: "Your ideas, your judgment and your vision drive the outcome. AI helps you execute." },
  { title: "Communication over commands", body: "We teach people to say what they mean, not to memorize prompts." },
  { title: "Learning by building", body: "Every course ends with something useful you made yourself." },
  { title: "Independence over dependency", body: "The goal is that you can build your own solutions, not that you need us forever." },
  { title: "Real projects, real mistakes", body: "You see actual builds, including what went wrong and how it got fixed." },
  { title: "Platform independence", body: "Skills that carry across ChatGPT, Claude, Gemini and whatever comes next." },
];

export const LEVELS: Level[] = [
  {
    id: 1,
    name: "AI Foundations",
    priceRange: "Free",
    summary: "Free guides, short videos and the basics. Start here if AI still feels like a black box.",
  },
  {
    id: 2,
    name: "AI Practitioner",
    priceRange: "$29–$99 per course",
    summary: "Voice prompting, custom assistants and everyday business use. Skills you use the same day.",
  },
  {
    id: 3,
    name: "AI Builder",
    priceRange: "$149–$399 per course",
    summary: "Websites, apps, automated workflows and business systems. You build the real thing.",
  },
  {
    id: 4,
    name: "Corporate AI Training",
    priceRange: "$499–$2,500+",
    summary: "Live workshops, employee training and implementation programs built around your company.",
  },
];

/** Real things John has built. They become the case studies inside the courses. */
export const BUILT_FROM: string[] = [
  "Business websites and ecommerce platforms",
  "SaaS applications",
  "Customer relationship management systems",
  "AI-powered automotive diagnostic tools",
  "Business management and automation platforms",
  "Game development and 3D asset tools",
];
