import type { Metadata } from "next";
import GuideLoader from "@/components/guide/GuideLoader";
import { clipBase, clipUrls } from "@/lib/guide/clips";
import { loadGuideOffers } from "@/lib/guide/offers";

export const metadata: Metadata = {
  title: "Find the right fit",
  description: "Answer a few quick questions and Tess will point you to the service that fits your business.",
  alternates: { canonical: "/guide" },
};

// Prices and recordings are read fresh, at most five minutes old.
export const revalidate = 300;

export default async function GuidePage() {
  const [offers, all] = await Promise.all([loadGuideOffers(), clipUrls()]);
  // The script's lines go to the page whole. The names are many, so only which ones exist is sent; the page works out a name's address itself.
  const clips = Object.fromEntries(Object.entries(all).filter(([id]) => !id.startsWith("back-")));
  const names = Object.keys(all).filter((id) => id.startsWith("back-")).map((id) => id.slice(5));
  return <GuideLoader offers={offers} clips={clips} names={names} clipBase={clipBase()} />;
}
