import "server-only";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { AI_OPERATOR_PLANS } from "@/lib/ai-operator/plans";
import { WEBSITE_PACKAGES } from "@/lib/website-packages";
import type { CatalogPackage, PackageFeature, PricingMode } from "./types";

type Row = Record<string, unknown>;
const audienceFallback = [
  ["audience-starter", "Grow Your Audience Starter", "Stay Active", 19900, false, ["2 social platforms", "8 posts per month", "Custom graphics", "Captions & hashtags", "Content scheduling", "Monthly analytics", "Basic dashboard"]],
  ["audience-growth", "Grow Your Audience Growth", "Build Your Audience", 39900, true, ["3 social platforms", "16 posts per month", "Campaign creation", "Lead generation", "Reputation monitoring", "Analytics dashboard", "Monthly strategy"]],
  ["audience-full-service", "Grow Your Audience Full Service", "We Run Your Marketing", 69900, false, ["Up to 5 platforms", "24 posts per month", "Campaign management", "Lead generation", "Review & reputation management", "Comment/message monitoring", "Advanced automation", "Ongoing strategy & support"]],
  ["audience-custom", "Custom Growth System", "For Serious Growth", 99900, false, ["Paid advertising (FB/IG/Google)", "Landing pages", "CRM integration", "Email & SMS campaigns", "Advanced AI automation", "Multiple locations", "Higher content volume", "Custom strategy & support"]],
] as const;

function fallbackPackage(input: { slug: string; name: string; category: string; subtitle?: string; description?: string; priceCents: number; setupFeeCents?: number; recurring?: boolean; startingAt?: boolean; featured?: boolean; features: readonly string[]; ctaLabel?:string;ctaRoute: string; publicRoute: string }): CatalogPackage {
  return { id: input.slug, slug: input.slug, name: input.name, category: input.category, subtitle: input.subtitle ?? "", shortDescription: input.description ?? "", description: input.description ?? "", pricingMode: input.startingAt ? "starting_at" : "fixed", priceCents: input.priceCents, setupFeeCents: input.setupFeeCents ?? 0, billingType: input.recurring ? "recurring" : "one_time", billingInterval: "monthly", badge: input.featured ? "Most Popular" : null, featured: !!input.featured, mostPopular: !!input.featured, active: true, sortOrder: 0, ctaLabel: input.ctaLabel??"Get Started", ctaRoute: input.ctaRoute, publicRoute: input.publicRoute, imageUrl: null, imagePath: null, imageAlt: null, iconKey: null, metaTitle: null, metaDescription: null, frontendLocations: [input.publicRoute], features: input.features.map((label, sortOrder) => ({ serviceId: `${input.slug}-${sortOrder}`, serviceSlug: "", serviceName: label, label, description: null, included: true, sortOrder })) };
}

function fallbacks(): CatalogPackage[] {
  const websites = WEBSITE_PACKAGES.map((pkg) => fallbackPackage({ slug: `website-${pkg.id}`, name: pkg.name, category: "websites", description: pkg.description, priceCents: Number(pkg.price.replace(/\D/g, "")) * 100, featured: pkg.featured, features: pkg.features,ctaLabel:`See the ${pkg.price} package`, ctaRoute: `/website-intake?package=website-${pkg.id}`, publicRoute: "/services" }));
  websites.push(fallbackPackage({slug:"website-custom",name:"Custom Built Website",category:"websites",description:"An original website designed and written around your business.",priceCents:150000,startingAt:true,features:["Original custom visual design","Custom website development","Conversion-focused lead forms","Search-ready foundation","Analytics and conversion tracking"],ctaLabel:"Start a Custom Website",ctaRoute:"/website-intake?package=website-custom",publicRoute:"/services"}));
  const ai = Object.values(AI_OPERATOR_PLANS).map((pkg) => fallbackPackage({ slug: `ai-operator-${pkg.id}`, name: pkg.id === "custom" ? "Custom AI Business Operator" : pkg.name, category: "ai", description: pkg.description, priceCents: Number(pkg.price.replace(/\D/g, "")) * 100, setupFeeCents: Number(pkg.setup.replace(/\D/g, "")) * 100, recurring: true, startingAt: pkg.id === "custom", featured: pkg.id === "growth", features: pkg.features,ctaLabel:pkg.id==="custom"?"Let's Talk":"Get Started", ctaRoute: `/get-started?plan=ai-operator-${pkg.id}`, publicRoute: "/services/ai-business-operator" }));
  const audience = audienceFallback.map(([slug,name,subtitle,price,featured,features]) => fallbackPackage({ slug, name, category: "marketing", subtitle, priceCents: price, recurring: true, startingAt: slug === "audience-custom", featured, features,ctaLabel:slug==="audience-growth"?"Grow My Business":slug==="audience-full-service"?"Run My Marketing":slug==="audience-custom"?"Build My Custom Plan":"Get Started", ctaRoute: `/contact?service=grow-your-audience&plan=${slug}`, publicRoute: "/services/grow-your-audience" }));
  const business=fallbackPackage({slug:"run-your-business-custom",name:"Custom Business System",category:"business-systems",subtitle:"Your business, your system",description:"A complete operating platform built around your business.",priceCents:0,features:["CRM, customers and pipeline","Scheduling and calendar","Projects, tasks and progress","Dashboard and real-time analytics","Workflow automation","Custom integrations"],ctaRoute:"/contact?service=run-your-business&plan=run-your-business-custom",publicRoute:"/services/run-your-business"}); business.pricingMode="custom_quote"; business.billingType="custom_quote";
  return [...websites, ...ai, ...audience,business];
}

function feature(row: Row): PackageFeature | null {
  const service = (Array.isArray(row.service) ? row.service[0] : row.service) as Row | null;
  if (!service) return null;
  return { relationshipId: String(row.id ?? ""), serviceId: String(service.id ?? ""), serviceSlug: String(service.slug ?? ""), serviceName: String(service.name ?? ""), label: String(row.feature_label || service.name || ""), description: row.feature_description ? String(row.feature_description) : null, included: row.included !== false, sortOrder: Number(row.sort_order ?? 0) };
}

function packageFromRow(row: Row): CatalogPackage {
  const relationships = (row.service_package_relationships as Row[] | null) ?? [];
  return { id: String(row.id), slug: String(row.slug), name: String(row.name), category: String(row.catalog_category || "other"), subtitle: String(row.subtitle || ""), shortDescription: String(row.short_description || ""), description: String(row.description || ""), pricingMode: String(row.pricing_mode || "fixed") as PricingMode, priceCents: Number(row.from_cents || 0), setupFeeCents: Number(row.setup_fee_cents || 0), billingType: String(row.billing_type || "one_time") as CatalogPackage["billingType"], billingInterval: String(row.billing_interval || "monthly"), badge: row.badge ? String(row.badge) : null, featured: row.featured === true, mostPopular: row.most_popular === true, active: row.status === "active" && row.public_enabled === true, sortOrder: Number(row.position || 0), ctaLabel: String(row.cta_label || "Get Started"), ctaRoute: String(row.cta_route || row.public_route || "/contact"), publicRoute: row.public_route ? String(row.public_route) : null, imageUrl: row.image_url ? String(row.image_url) : row.image_path ? `/api/catalog-media/${row.id}` : null, imagePath: row.image_path ? String(row.image_path) : null, imageAlt: row.image_alt ? String(row.image_alt) : null, iconKey: row.icon_key ? String(row.icon_key) : null, metaTitle: row.meta_title ? String(row.meta_title) : null, metaDescription: row.meta_description ? String(row.meta_description) : null, frontendLocations: Array.isArray(row.frontend_locations) ? row.frontend_locations.map(String) : [], features: relationships.map(feature).filter((item): item is PackageFeature => !!item).sort((a,b) => a.sortOrder-b.sortOrder) };
}

const fields = "id,slug,name,catalog_category,subtitle,short_description,description,pricing_mode,from_cents,setup_fee_cents,billing_type,billing_interval,badge,featured,most_popular,status,public_enabled,position,cta_label,cta_route,public_route,image_url,image_path,image_alt,icon_key,meta_title,meta_description,frontend_locations,service_package_relationships(id,included,feature_label,feature_description,sort_order,service:catalog_items!service_id(id,slug,name))";

export async function loadPublicPackages(category?: string): Promise<CatalogPackage[]> {
  if (supabaseConfigured()) {
    let query = supabaseAdmin().from("catalog_items").select(fields).eq("offer_kind", "package").eq("status", "active").eq("public_enabled", true).is("archived_at", null).order("position");
    if (category) query = query.eq("catalog_category", category);
    const { data, error } = await query;
    if (!error && data?.length) return (data as unknown as Row[]).map(packageFromRow);
  }
  return fallbacks().filter((pkg) => !category || pkg.category === category);
}

export async function getPublicPackage(slug: string | null | undefined, category?: string): Promise<CatalogPackage | null> {
  if (!slug) return null;
  const normalized = ({ starter:"website-starter",classic:"website-classic",professional:"website-professional",ecommerce:"website-ecommerce",growth:"ai-operator-growth",operator:"ai-operator-operator",custom:"ai-operator-custom" } as Record<string,string>)[slug] ?? slug;
  return (await loadPublicPackages(category)).find((pkg) => pkg.slug === normalized) ?? null;
}
