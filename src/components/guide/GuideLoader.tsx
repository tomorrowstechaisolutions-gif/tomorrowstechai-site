"use client";

import dynamic from "next/dynamic";
import type { GuideOffer } from "@/lib/guide/offers";

/**
 * Draws Tess's page in the browser only. She has to know before her first
 * word whether this browser has met her before, and only the browser can say.
 */
const GuideExperience = dynamic(() => import("./GuideExperience"), { ssr: false });

export default function GuideLoader(props: { offers: Record<string, GuideOffer>; clips: Record<string, string> }) {
  return <GuideExperience {...props} />;
}
