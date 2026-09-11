import Image from "next/image";
import Link from "next/link";
import {
  IconArrowRight,
  IconChart,
  IconMegaphone,
  IconRocket,
  IconUsers,
} from "@/components/Icons";
import styles from "./growAudience.module.css";

const BENEFITS = [
  { Icon: IconMegaphone, label: "More Visibility" },
  { Icon: IconUsers, label: "More Leads" },
  { Icon: IconChart, label: "More Customers" },
  { Icon: IconRocket, label: "A Stronger Tomorrow" },
] as const;

export function MarketingCTA() {
  return (
    <section className={styles.finalCta} aria-labelledby="grow-final-cta">
      <div className={styles.finalMedia}>
        <Image
          src="/industries/contractors-home-services.webp"
          alt="A business owner on the job in Central Texas"
          fill
          sizes="(max-width: 1100px) 90vw, 22vw"
        />
        <div aria-hidden="true" />
        <b>
          A Stronger Brand
          <br />
          Builds a Bigger
          <br />
          Tomorrow
        </b>
      </div>

      <div className={styles.finalCopy}>
        <span className={styles.eyebrow}>Your Business. Our Marketing.</span>
        <h2 id="grow-final-cta">
          You Run the Business.
          <br />
          <em>We Keep Your Brand Growing.</em>
        </h2>
        <p>
          Let&rsquo;s build a real strategy that gets you seen, gets you leads,
          and helps your business grow.
        </p>
        <div className={styles.heroActions}>
          <Link
            href="/contact?service=grow-your-audience"
            className={styles.primary}
          >
            Get Started Today <IconArrowRight size={16} />
          </Link>
          <Link href="/contact" className={styles.secondary}>
            Schedule a Demo
          </Link>
        </div>
      </div>

      <div className={styles.finalBenefits}>
        {BENEFITS.map(({ Icon, label }) => (
          <span key={label}>
            <b className={styles.iconBox}>
              <Icon size={17} />
            </b>
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
