import { LAUNCH_NOTE } from "@/lib/catalog/launch";
import { getPublicPackage } from "@/lib/catalog/public";
import { catalogListPrice } from "@/lib/catalog/types";

/**
 * The line under an ad page's price that says it is a launch price and what
 * the regular price is. Renders nothing when the offer is not on a launch
 * price, or when the catalog cannot be read.
 */
export default async function LaunchLine({ slug }: { slug: string }) {
  const pkg = await getPublicPackage(slug).catch(() => null);
  const regular = pkg ? catalogListPrice(pkg) : null;
  if (!regular) return null;
  return (
    <div className="bl-pricebox-note">
      {LAUNCH_NOTE}. Regular price <strong>{regular}</strong>.
    </div>
  );
}
