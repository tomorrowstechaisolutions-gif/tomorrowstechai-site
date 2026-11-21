import type { Metadata } from "next";
import GuideExperience from "@/components/guide/GuideExperience";
import { clipUrls } from "@/lib/guide/clips";
import { loadGuideOffers } from "@/lib/guide/offers";

export const metadata: Metadata = {
  title: "Find the right fit",
  description: "Answer a few quick questions and Tess will point you to the service that fits your business.",
  alternates: { canonical: "/guide" },
};

// Prices and recordings are read fresh, at most five minutes old.
export const revalidate = 300;

export default async function GuidePage() {
  const [offers, clips] = await Promise.all([loadGuideOffers(), clipUrls()]);
  return <GuideExperience offers={offers} clips={clips} />;
}
