import {
  IconBrain,
  IconBrush,
  IconChart,
  IconMegaphone,
  IconNetwork,
  IconStar,
  IconUsers,
} from "@/components/Icons";
import styles from "./growAudience.module.css";

const FEATURES = [
  {
    Icon: IconNetwork,
    title: "Social Center",
    body: "Manage all your accounts",
  },
  {
    Icon: IconBrush,
    title: "Content Creation",
    body: "Graphics, videos, captions, reels",
  },
  {
    Icon: IconMegaphone,
    title: "Campaigns",
    body: "Run targeted campaigns",
  },
  {
    Icon: IconUsers,
    title: "Lead Generation",
    body: "Turn followers into customers",
  },
  {
    Icon: IconStar,
    title: "Reputation",
    body: "Monitor and grow your reviews",
  },
  {
    Icon: IconChart,
    title: "Analytics",
    body: "See what’s working in real time",
  },
  {
    Icon: IconNetwork,
    title: "Automation",
    body: "Schedule and save time with AI",
  },
  {
    Icon: IconBrain,
    title: "AI Content Studio",
    body: "Get ideas, write posts, create images",
  },
] as const;

export function MarketingFeatures() {
  return (
    <section className={styles.section} aria-labelledby="everything-you-need">
      <div className={styles.sectionHead}>
        <span className={styles.eyebrow}>Everything You Need</span>
        <h2 id="everything-you-need">Complete Marketing. Real Results.</h2>
        <p>
          Create content, run campaigns, generate leads, manage your reputation
          and track your growth &mdash; all in one place.
        </p>
      </div>

      <div className={styles.featureGrid}>
        {FEATURES.map(({ Icon, title, body }) => (
          <article className={styles.feature} key={title}>
            <span className={styles.iconBox} aria-hidden="true">
              <Icon size={19} />
            </span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
