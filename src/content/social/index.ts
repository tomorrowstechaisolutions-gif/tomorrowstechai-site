
/**
 * Every batch of daily social posts, by slug.
 *
 * To add one: write src/content/social/<slug>.ts exporting a SocialBatch,
 * import it here and add it to the list. Deploy, then load it with
 * scripts/load-social-batch.mts. Keep old batches here: their card images
 * are served from these files for as long as the posts exist.
 */
import type { SocialBatch } from "@/lib/social/batch";
import { december2026 } from "./2026-12";

const BATCHES: SocialBatch[] = [december2026];

export const SOCIAL_BATCHES: Record<string, SocialBatch> = Object.fromEntries(BATCHES.map((b) => [b.slug, b]));

export function getBatch(slug: string): SocialBatch | null {
  return Object.hasOwn(SOCIAL_BATCHES, slug) ? SOCIAL_BATCHES[slug] : null;
}
