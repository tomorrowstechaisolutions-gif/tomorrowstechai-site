import type { Metadata } from "next";
import { RunBusinessHero } from "@/components/run-business/RunBusinessHero";
import { CommandCenterFeatures, BusinessWorkflow, IndustrySolutions, AIBusinessSection, RunBusinessCTA } from "@/components/run-business/RunBusinessSections";
import styles from "@/components/run-business/runBusiness.module.css";

export const metadata: Metadata = {
  title: { absolute: "Custom Business Management Software | Tomorrow’s Tech AI" },
  description: "Run your business from one custom platform. Tomorrow’s Tech AI builds AI-powered dashboards, CRM, scheduling, projects, automation and business management systems designed around your operation.",
  alternates: { canonical: "/services/run-your-business" },
  openGraph: { title: "Custom Business Management Software | Tomorrow’s Tech AI", description: "One custom platform for your dashboard, CRM, scheduling, projects, automation and AI.", url: "https://tomorrowstechai.com/services/run-your-business", type: "website" },
};

export default function RunYourBusinessPage() {
  return <div className={`${styles.page} run-business-page`}>
    <RunBusinessHero />
    <CommandCenterFeatures />
    <BusinessWorkflow />
    <IndustrySolutions />
    <AIBusinessSection />
    <RunBusinessCTA />
  </div>;
}
