import Link from "next/link";
import { IconArrowRight, IconBadgeCheck } from "@/components/Icons";
import styles from "./growAudience.module.css";
import { loadPublicPackages } from "@/lib/catalog/public";

/**
 * Plans route into the existing contact inquiry workflow, carrying the service
 * and plan as query params. ContactForm reads them and pre-fills the message,
 * so the enquiry arrives already saying which package was chosen. There is no
 * self-serve checkout for managed marketing, so none is invented here.
 */
export async function MarketingPricing() {
  const canonical=await loadPublicPackages("marketing");
  const displayPlans=canonical.map(pkg=>({id:pkg.slug,name:pkg.name.replace(/^Grow Your Audience /,""),tagline:pkg.subtitle,price:`$${(pkg.priceCents/100).toLocaleString("en-US")}`,cta:pkg.ctaLabel,featured:pkg.mostPopular||pkg.featured,from:pkg.pricingMode==="starting_at",features:pkg.features.filter(x=>x.included).map(x=>x.label),href:pkg.ctaRoute}));
  return (
    <section
      id="pricing"
      className={styles.section}
      aria-labelledby="marketing-pricing"
    >
      <div className={styles.sectionHead}>
        <span className={styles.eyebrow}>Simple, Transparent Pricing</span>
        <h2 id="marketing-pricing">Choose the Plan That Fits Your Goals</h2>
      </div>

      <div className={styles.priceGrid}>
        {displayPlans.map((plan) => {
          const featured = "featured" in plan && plan.featured;
          return (
            <article
              key={plan.id}
              className={`${styles.priceCard} ${featured ? styles.featuredCard : ""}`}
            >
              {featured && (
                <span className={styles.popularBadge}>Most Popular</span>
              )}

              <div className={styles.priceHead}>
                <h3>{plan.name}</h3>
                <p>{plan.tagline}</p>
              </div>

              <div className={styles.priceAmount}>
                {"from" in plan && plan.from && <small>Starting at</small>}
                <strong>{plan.price}</strong>
                <span>/mo</span>
              </div>

              <ul className={styles.featureList}>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <IconBadgeCheck size={14} />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`${styles.priceCta} ${featured ? styles.priceCtaFeatured : ""}`}
              >
                {plan.cta} <IconArrowRight size={15} />
              </Link>
            </article>
          );
        })}
      </div>

      <p className={styles.priceNote}>
        Every plan is managed by our team and run from your Marketing Command
        Center. Month to month &mdash; no long contract. We grow your audience
        with real content and real campaigns; we never buy followers or
        engagement.
      </p>
    </section>
  );
}
