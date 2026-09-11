import type { Metadata } from "next";
import { WebsitePackageIntake } from "@/components/website-intake/WebsitePackageIntake";
import { getWebsitePackage } from "@/lib/website-packages";

export const metadata: Metadata = {
  title: { absolute: "Website Project Inquiry | Tomorrow’s Tech AI" },
  description: "Tell Tomorrow’s Tech AI about your website project and get the right package, timeline, and next steps for your business.",
  alternates: { canonical: "/website-intake" },
};

export default async function WebsiteIntakePage({ searchParams }: { searchParams: Promise<{ package?: string }> }) {
  const params = await searchParams;
  const selectedPackage = getWebsitePackage(params.package)?.id ?? "";
  return <WebsitePackageIntake initialPackageId={selectedPackage} />;
}
