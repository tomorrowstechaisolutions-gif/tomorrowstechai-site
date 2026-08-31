import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The brand a piece of content is written in.
 *
 * This is the whole point of brand_profiles: the generator is handed ONE
 * brand's voice and never sees another's. A Proudly Texan post generated
 * from Tomorrows Tech AI's guidance would be the exact failure this table
 * exists to prevent, so the prompt is built from a single row and the row
 * is chosen before the model is called, not by it.
 */

export type BrandProfile = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tone: string | null;
  audience: string | null;
  writingGuidance: string | null;
  ctaStyle: string | null;
  preferredPhrases: string[];
  prohibitedPhrases: string[];
  colors: string[];
  isDefault: boolean;
  customerId: string | null;
};

type BrandRaw = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tone: string | null;
  audience: string | null;
  writing_guidance: string | null;
  cta_style: string | null;
  preferred_phrases: string[] | null;
  prohibited_phrases: string[] | null;
  colors: string[] | null;
  is_default: boolean;
  customer_id: string | null;
};

const SELECT =
  "id, name, slug, description, tone, audience, writing_guidance, cta_style, preferred_phrases, prohibited_phrases, colors, is_default, customer_id";

function shape(r: BrandRaw): BrandProfile {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    tone: r.tone,
    audience: r.audience,
    writingGuidance: r.writing_guidance,
    ctaStyle: r.cta_style,
    preferredPhrases: r.preferred_phrases ?? [],
    prohibitedPhrases: r.prohibited_phrases ?? [],
    colors: r.colors ?? [],
    isDefault: r.is_default,
    customerId: r.customer_id,
  };
}

export async function listBrands(sb: SupabaseClient): Promise<BrandProfile[]> {
  const { data, error } = await sb
    .from("brand_profiles")
    .select(SELECT)
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`brands: ${error.message}`);
  return (data as BrandRaw[]).map(shape);
}

export async function getBrand(
  sb: SupabaseClient,
  id?: string | null
): Promise<BrandProfile | null> {
  const query = sb.from("brand_profiles").select(SELECT).eq("active", true);
  const { data, error } = id
    ? await query.eq("id", id).maybeSingle()
    : await query.eq("is_default", true).maybeSingle();
  if (error) throw new Error(`brand: ${error.message}`);
  return data ? shape(data as BrandRaw) : null;
}

/**
 * The brand half of the system prompt.
 *
 * Everything here comes from the row. Nothing about the voice is hard-coded
 * in the route, so changing how a brand sounds is an edit to its profile
 * rather than a code change — and the same function serves every brand.
 */
export function brandSystemPrompt(brand: BrandProfile): string {
  const lines: string[] = [
    `You are writing as ${brand.name}.`,
  ];

  if (brand.description) lines.push(`\nWHAT THIS BUSINESS IS:\n${brand.description}`);
  if (brand.audience) lines.push(`\nWHO YOU ARE TALKING TO:\n${brand.audience}`);
  if (brand.tone) lines.push(`\nTONE:\n${brand.tone}`);
  if (brand.writingGuidance) lines.push(`\nWRITING GUIDANCE:\n${brand.writingGuidance}`);
  if (brand.ctaStyle) lines.push(`\nHOW YOU ASK FOR THE NEXT STEP:\n${brand.ctaStyle}`);

  if (brand.preferredPhrases.length > 0) {
    lines.push(`\nPHRASES THIS BRAND USES: ${brand.preferredPhrases.join("; ")}.`);
  }
  if (brand.prohibitedPhrases.length > 0) {
    lines.push(
      `\nNEVER USE THESE WORDS OR PHRASES — they are banned for this brand: ${brand.prohibitedPhrases.join("; ")}.`
    );
  }

  lines.push(`
HARD RULES, for every brand:
- Never invent statistics, earnings claims, testimonials, review counts or client names.
- Never promise a specific result.
- Never quote a price unless the brief gives you one.
- No emoji unless the brief asks for them. No exclamation marks. No fake urgency or invented scarcity.
- If you do not have a fact, write around it rather than making one up.`);

  return lines.join("\n");
}
