import Link from "next/link";
import { IconArrowRight, IconBadgeCheck } from "@/components/Icons";
import styles from "./growAudience.module.css";

/**
 * Plans route into the existing contact inquiry workflow, carrying the service
 * and plan as query params. ContactForm reads them and pre-fills the message,
 * so the enquiry arrives already saying which package was chosen. There is no
 * self-serve checkout for managed marketing, so none is invented here.
 */
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Stay Active",
    price: "$199",
    cta: "Get Started",
    features: [
      "2 social platforms",
      "8 posts per month",
      "Custom graphics",
      "Captions & hashtags",
      "Content scheduling",
      "Monthly analytics",
      "Basic dashboard",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Build Your Audience",
    price: "$399",
    cta: "Grow My Business",
    featured: true,
    features: [
      "3 social platforms",
      "16 posts per month",
      "Campaign creation",
      "Lead generation",
      "Reputation monitoring",
      "Analytics dashboard",
      "Monthly strategy",
    ],
  },
  {
    id: "full-service",
    name: "Full Service",
    tagline: "We Run Your Marketing",
    price: "$699",
    cta: "Run My Marketing",
    features: [
      "Up to 5 platforms",
      "24 posts per month",
      "Campaign management",
      "Lead generation",
      "Review & reputation management",
      "Comment/message monitoring",
      "Advanced automation",
      "Ongoing strategy & support",
    ],
  },
  {
    id: "custom",
    name: "Custom Growth System",
    tagline: "For Serious Growth",
    price: "$999",
    from: true,
    cta: "Build My Custom Plan",
    features: [
      "Paid advertising (FB/IG/Google)",
      "Landing pages",
      "CRM integration",
      "Email & SMS campaigns",
      "Advanced AI automation",
      "Multiple locations",
      "Higher content volume",
      "Custom strategy & support",
    ],
  },
] as const;

export function MarketingPricing() {
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
        {PLANS.map((plan) => {
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
                href={`/contact?service=grow-your-audience&plan=${plan.id}`}
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
