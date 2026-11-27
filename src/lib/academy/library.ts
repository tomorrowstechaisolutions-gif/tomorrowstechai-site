/**
 * The Business AI Series: free publications that open the door to the Academy.
 *
 * A volume with a `magnet` is live: the form emails the PDF (the magnet id
 * must exist in MAGNETS, src/lib/forms/email-content.ts). A volume without
 * one shows as "in production".
 *
 * Each live volume also has its own landing page at /free/<slug>. That is the
 * link to put in social posts: cover, what's inside, and the email form.
 */

export type Volume = {
  number: string;
  /** URL segment for its landing page: /free/<slug>. Never change it once posted. */
  slug: string;
  title: string;
  subtitle: string;
  /** One line: what the volume teaches. */
  teaches: string;
  /** The landing page headline: the problem the guide solves, in plain words. */
  hook: string;
  /** Who it's for, one sentence. */
  audience: string;
  pages?: number;
  cover?: string;
  /** JPEG copy of the cover, used inside the social share image. */
  shareCover?: string;
  magnet?: string;
  /** Three short lines for the Academy library card. */
  highlights: string[];
  /** The fuller list for the landing page. Taken from the guide itself. */
  inside: string[];
};

export const SERIES_NAME = "The Business AI Series";

export const VOLUMES: Volume[] = [
  {
    number: "01",
    slug: "ai-business-bot-playbook",
    title: "The AI Business Bot Playbook",
    subtitle: "Build your own AI workforce without writing a single line of code.",
    teaches: "How to build",
    hook: "Stop paying thousands for simple AI bots. Build your own with the right words.",
    audience: "Business owners and teams who want AI assistants for real work, with no coding.",
    pages: 22,
    cover: "/academy/covers/vol-01.webp",
    shareCover: "public/academy/covers/vol-01.jpg",
    magnet: "ai-business-bot-playbook",
    highlights: [
      "15 copy-and-paste assistant blueprints",
      "A setup worksheet that makes each one yours",
      "How to test a bot before you trust it",
    ],
    inside: [
      "15 copy-and-paste assistant blueprints: executive assistant, project manager, customer service, sales, marketing, HR, SOPs, finance, research and more",
      "A first task and a quality check for every blueprint",
      "A setup worksheet that gives any assistant your business context",
      "A 5-step quick start from prompt to working assistant",
      "How to test a bot before your team relies on it",
      "Where a prompt ends and real automation begins",
    ],
  },
  {
    number: "02",
    slug: "art-of-voice-prompting",
    title: "The Art of Voice Prompting",
    subtitle: "Stop typing. Start talking. Get better results from AI.",
    teaches: "How to communicate",
    hook: "Better AI results don't come from magic prompts. They come from saying what you mean.",
    audience: "Anyone who uses ChatGPT, Claude or Gemini and keeps getting generic answers.",
    pages: 20,
    cover: "/academy/covers/vol-02.webp",
    shareCover: "public/academy/covers/vol-02.jpg",
    magnet: "art-of-voice-prompting",
    highlights: [
      "The S.P.E.A.K. Method, step by step",
      "Before-and-after prompts for real business work",
      "A printable cheat sheet and a 15-minute experiment",
    ],
    inside: [
      "The S.P.E.A.K. Method: State, Provide, Express, Ask, Keep refining",
      "Dictation vs. live voice conversation, and when to use each",
      "How to let AI interview you instead of guessing",
      "Before-and-after prompts for websites, operations, projects, marketing and troubleshooting",
      "A printable voice prompting cheat sheet",
      "A 15-minute experiment to prove it on your own work",
    ],
  },
  {
    number: "03",
    slug: "ai-business-blueprint",
    title: "The AI Business Blueprint",
    subtitle: "Discover where AI can save your business time, money and resources.",
    teaches: "How to implement",
    hook: "Find where AI actually saves your business time and money, before you spend a dollar on it.",
    audience: "Owners, managers and team leads who want practical results, not another subscription.",
    pages: 21,
    cover: "/academy/covers/vol-03.webp",
    shareCover: "public/academy/covers/vol-03.jpg",
    magnet: "ai-business-blueprint",
    highlights: [
      "AI readiness assessment and opportunity scoring",
      "ROI formulas with a worked example",
      "A 30-day implementation roadmap",
    ],
    inside: [
      "A business AI readiness assessment you can score in minutes",
      "How to map a workflow the way it really runs",
      "A department-by-department automation opportunity checklist",
      "Opportunity scoring and ROI formulas, with a worked example",
      "How to run a safe pilot and protect your business data",
      "A 30-day implementation roadmap and a printable worksheet",
    ],
  },
  {
    number: "04",
    slug: "human-advantage",
    title: "The Human Advantage",
    subtitle: "Building trust, not titles, in the age of artificial intelligence.",
    teaches: "How to earn trust",
    hook: "A title doesn't make you credible. Here's how AI founders earn real trust and real clients.",
    audience: "AI founders, consultants and new agency owners building a reputation from scratch.",
    pages: 21,
    cover: "/academy/covers/vol-04.webp",
    shareCover: "public/academy/covers/vol-04.jpg",
    magnet: "human-advantage",
    highlights: [
      "Credibility over credentials",
      "The H.U.M.A.N. Method",
      "A 30-day local business action plan",
    ],
    inside: [
      "Why titles and generic AI posts cost you trust",
      "The H.U.M.A.N. Method for building real business relationships",
      "How to approach local business owners without pitching",
      "Nine discovery questions that get owners talking",
      "A 30-day local business action plan",
      "The founder's code of conduct",
    ],
  },
];

export function getVolume(slug: string): Volume | undefined {
  return VOLUMES.find((v) => v.slug === slug);
}
