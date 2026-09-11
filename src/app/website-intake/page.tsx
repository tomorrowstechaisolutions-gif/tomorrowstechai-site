import type { Metadata } from "next";
import { WebsitePackageIntake } from "@/components/website-intake/WebsitePackageIntake";
import { getWebsitePackage } from "@/lib/website-packages";
import { loadPublicPackages } from "@/lib/catalog/public";
import { catalogPrice } from "@/lib/catalog/types";

export const metadata: Metadata = {
  title: { absolute: "Website Project Inquiry | Tomorrow’s Tech AI" },
  description: "Tell Tomorrow’s Tech AI about your website project and get the right package, timeline, and next steps for your business.",
  alternates: { canonical: "/website-intake" },
};

export default async function WebsiteIntakePage({ searchParams }: { searchParams: Promise<{ package?: string }> }) {
  const params = await searchParams;
  const packages=(await loadPublicPackages("websites")).map(pkg=>({id:pkg.slug,name:pkg.name,price:catalogPrice(pkg),campaign:`${catalogPrice(pkg)} ${pkg.name}`,description:pkg.shortDescription||pkg.description,features:pkg.features.filter(x=>x.included).map(x=>x.label),featured:pkg.mostPopular||pkg.featured}));
  const legacy=getWebsitePackage(params.package);
  const selectedPackage = packages.find(pkg=>pkg.id===params.package)?.id ?? (legacy?`website-${legacy.id}`:"");
  return <WebsitePackageIntake initialPackageId={selectedPackage} packages={packages} />;
}
