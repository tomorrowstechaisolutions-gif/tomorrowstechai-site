import Link from "next/link";
import { IconArrowRight, IconBadgeCheck } from "@/components/Icons";
import { MarketingDashboardPreview } from "./MarketingDashboardPreview";
import styles from "./growAudience.module.css";

const TRUST = ["More Reach", "More Leads", "Real Business Growth"] as const;

export function GrowAudienceHero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>Grow Your Audience</span>
        <h1>
          More Visibility.
          <br />
          <em>More Customers.</em>
        </h1>
        <p className={styles.heroLead}>
          Social media. Content. Campaigns. Lead generation. Reputation. All
          managed from one powerful platform.
        </p>
        <div className={styles.heroActions}>
          <Link
            href="/contact?service=grow-your-audience"
            className={styles.primary}
          >
            Grow My Business <IconArrowRight size={17} />
          </Link>
          <Link href="#how-it-works" className={styles.secondary}>
            See How It Works
          </Link>
        </div>
        <div className={styles.heroTrust}>
          {TRUST.map((item) => (
            <span key={item}>
              <IconBadgeCheck size={18} />
              {item}
            </span>
          ))}
        </div>
      </div>

      <MarketingDashboardPreview />
    </section>
  );
}
