export const CATALOG_CATEGORIES = ["websites", "business-systems", "ai", "marketing", "automation", "integrations", "hosting", "branding", "support", "other"] as const;
export const PRICING_MODES = ["fixed", "starting_at", "custom_quote", "free"] as const;
export type CatalogCategory = typeof CATALOG_CATEGORIES[number];
export type PricingMode = typeof PRICING_MODES[number];

export type PackageFeature = {
  relationshipId?: string;
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  label: string;
  description: string | null;
  included: boolean;
  sortOrder: number;
};

export type CatalogPackage = {
  id: string;
  slug: string;
  name: string;
  category: string;
  subtitle: string;
  shortDescription: string;
  description: string;
  pricingMode: PricingMode;
  priceCents: number;
  setupFeeCents: number;
  billingType: "one_time" | "recurring" | "usage_based" | "custom_quote";
  billingInterval: string;
  badge: string | null;
  featured: boolean;
  mostPopular: boolean;
  active: boolean;
  sortOrder: number;
  ctaLabel: string;
  ctaRoute: string;
  publicRoute: string | null;
  imageUrl: string | null;
  imagePath: string | null;
  imageAlt: string | null;
  iconKey: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  frontendLocations: string[];
  features: PackageFeature[];
};

export function catalogPrice(pkg: Pick<CatalogPackage, "pricingMode" | "priceCents" | "billingType" | "billingInterval">) {
  if (pkg.pricingMode === "custom_quote") return "Contact for pricing";
  if (pkg.pricingMode === "free") return "$0";
  const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: pkg.priceCents % 100 ? 2 : 0 }).format(pkg.priceCents / 100);
  const interval = pkg.billingType === "recurring" ? pkg.billingInterval === "yearly" ? "/year" : pkg.billingInterval === "quarterly" ? "/quarter" : "/month" : "";
  return `${pkg.pricingMode === "starting_at" ? "Starting at " : ""}${dollars}${interval}`;
}
