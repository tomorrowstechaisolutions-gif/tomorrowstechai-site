import type { Metadata } from "next";
import { GrowAudienceHero } from "@/components/grow-audience/GrowAudienceHero";
import { MarketingFeatures } from "@/components/grow-audience/MarketingFeatures";
import { MarketingProcess } from "@/components/grow-audience/MarketingProcess";
import { MarketingPricing } from "@/components/grow-audience/MarketingPricing";
import { MarketingCTA } from "@/components/grow-audience/MarketingCTA";
import styles from "@/components/grow-audience/growAudience.module.css";

const TITLE = "Social Media & Business Growth Services | Tomorrow’s Tech AI";
const DESCRIPTION =
  "Grow your audience with managed social media, professional content, campaigns, lead generation, reputation management, automation and AI-powered marketing from Tomorrow’s Tech AI.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/services/grow-your-audience" },
  openGraph: {
    title: TITLE,
    description:
      "Social media, content, campaigns, lead generation and reputation — managed from one platform.",
    url: "https://tomorrowstechai.com/services/grow-your-audience",
    type: "website",
  },
};
export const dynamic = "force-dynamic";

export default function GrowYourAudiencePage() {
  return (
    <div className={`${styles.page} grow-audience-page`}>
      <GrowAudienceHero />
      <MarketingFeatures />
      <MarketingProcess />
      <MarketingPricing />
      <MarketingCTA />
    </div>
  );
}
