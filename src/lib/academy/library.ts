/**
 * The Business AI Series: free publications that open the door to the Academy.
 *
 * A volume with a `magnet` is live: the form emails the PDF (the magnet id
 * must exist in MAGNETS, src/lib/forms/email-content.ts). A volume without
 * one shows as "in production".
 */

export type Volume = {
  number: string;
  title: string;
  subtitle: string;
  /** One line: what the volume teaches. */
  teaches: string;
  pages?: number;
  cover?: string;
  magnet?: string;
  highlights: string[];
};

export const SERIES_NAME = "The Business AI Series";

export const VOLUMES: Volume[] = [
  {
    number: "01",
    title: "The AI Business Bot Playbook",
    subtitle: "Build your own AI workforce without writing a single line of code.",
    teaches: "How to build",
    pages: 22,
    cover: "/academy/covers/vol-01.webp",
    magnet: "ai-business-bot-playbook",
    highlights: [
      "15 copy-and-paste assistant blueprints",
      "A setup worksheet that makes each one yours",
      "How to test a bot before you trust it",
    ],
  },
  {
    number: "02",
    title: "The Art of Voice Prompting",
    subtitle: "Stop typing. Start talking. Get better results from AI.",
    teaches: "How to communicate",
    pages: 20,
    cover: "/academy/covers/vol-02.webp",
    magnet: "art-of-voice-prompting",
    highlights: [
      "The S.P.E.A.K. Method, step by step",
      "Before-and-after prompts for real business work",
      "A printable cheat sheet and a 15-minute experiment",
    ],
  },
  {
    number: "03",
    title: "The AI Business Blueprint",
    subtitle: "Discover where AI can save your business time, money and resources.",
    teaches: "How to implement",
    pages: 21,
    cover: "/academy/covers/vol-03.webp",
    magnet: "ai-business-blueprint",
    highlights: [
      "AI readiness assessment and opportunity scoring",
      "ROI formulas with a worked example",
      "A 30-day implementation roadmap",
    ],
  },
  {
    number: "04",
    title: "The Human Advantage",
    subtitle: "Building trust, not titles, in the age of artificial intelligence.",
    teaches: "How to earn trust",
    highlights: [
      "Credibility over credentials",
      "The H.U.M.A.N. Method",
      "A 30-day local business action plan",
    ],
  },
];
