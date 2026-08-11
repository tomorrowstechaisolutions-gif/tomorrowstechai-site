import type { Metadata } from "next";
import { Ultra, Rye, Oswald } from "next/font/google";

import "./eventshop.css";

const slab = Ultra({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ls-slab",
});

const west = Rye({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ls-west",
});

const cond = Oswald({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ls-cond",
});

export const metadata: Metadata = {
  title: { absolute: "Lone Star Loud — Texas Doesn't Whisper" },
  description:
    "Limited-run Texas political shirts, printed to order and available through Election Day.",
  // Direct-link only: never indexed, never followed, no snippet, no preview.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-snippet": 0,
      "max-image-preview": "none",
    },
  },
  openGraph: {
    title: "Lone Star Loud — Texas Doesn't Whisper",
    description: "Limited-run Texas political shirts. Pick your message.",
    type: "website",
  },
};

export default function EventShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      id="top"
      className={`ls-root ${slab.variable} ${west.variable} ${cond.variable}`}
    >
      {children}
    </div>
  );
}
