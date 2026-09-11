import type { Metadata } from "next";
import { AiOperatorIntake } from "@/components/ai-operator/AiOperatorIntake";
import { getAiOperatorPlan } from "@/lib/ai-operator/plans";
import { getPublicPackage } from "@/lib/catalog/public";

export const metadata: Metadata = {
  title: "Get Started with Your AI Business Operator",
  description: "Tell us about your business and selected AI Business Operator plan.",
  robots: { index: false, follow: true },
};

export default async function GetStartedPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const pkg=await getPublicPackage(plan||"ai-operator-growth","ai");
  const initialPlan=pkg?{id:pkg.slug,name:pkg.name,price:`$${(pkg.priceCents/100).toLocaleString("en-US")}`,setup:pkg.setupFeeCents?`$${(pkg.setupFeeCents/100).toLocaleString("en-US")} one-time setup`:"No setup fee",description:pkg.shortDescription||pkg.description,features:pkg.features.filter(x=>x.included).map(x=>x.label)}:getAiOperatorPlan(plan);
  return <AiOperatorIntake initialPlan={initialPlan} />;
}
