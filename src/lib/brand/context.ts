import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrand } from "@/lib/content/brand";

/**
 * The single approved context seam for Content Studio, Social Center, Email,
 * Websites, Proposals, Apps and future AI features. Consumers ask for one
 * brand by id; they never keep their own copy of its voice or terminology.
 */
export async function getApprovedBrandContext(sb: SupabaseClient, brandId?: string | null) {
  const brand = await getBrand(sb, brandId);
  if (!brand) return null;
  return {
    id: brand.id,
    name: brand.name,
    tagline: brand.tagline,
    tone: brand.tone,
    audience: brand.audience,
    services: brand.services,
    primaryCta: brand.primaryCta ?? brand.ctaStyle,
    differentiators: brand.differentiators,
    approvedTerminology: brand.preferredPhrases,
    restrictedTerminology: brand.prohibitedPhrases,
    claimsRequiringApproval: brand.claimsRequiringApproval,
    colors: brand.colors,
  };
}
