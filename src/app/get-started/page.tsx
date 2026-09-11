import type { Metadata } from "next";
import { AiOperatorIntake } from "@/components/ai-operator/AiOperatorIntake";
import { getAiOperatorPlan } from "@/lib/ai-operator/plans";

export const metadata: Metadata = {
  title: "Get Started with Your AI Business Operator",
  description: "Tell us about your business and selected AI Business Operator plan.",
  robots: { index: false, follow: true },
};

export default async function GetStartedPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <AiOperatorIntake initialPlan={getAiOperatorPlan(plan)} />;
}
