import {
  IconArrowRight,
  IconBrush,
  IconCalendar,
  IconChart,
  IconChecklist,
  IconMegaphone,
  IconRocket,
  IconUsers,
} from "@/components/Icons";
import styles from "./growAudience.module.css";

const STEPS = [
  { Icon: IconChecklist, title: "Plan", body: "Strategy & goals" },
  { Icon: IconBrush, title: "Create", body: "Content & graphics" },
  { Icon: IconCalendar, title: "Schedule", body: "Automate posting" },
  { Icon: IconRocket, title: "Publish", body: "Go live across channels" },
  { Icon: IconMegaphone, title: "Reach", body: "Get seen by the right people" },
  { Icon: IconUsers, title: "Convert", body: "Turn engagement into leads" },
  { Icon: IconChart, title: "Grow", body: "Track, improve, repeat" },
] as const;

export function MarketingProcess() {
  return (
    <section
      id="how-it-works"
      className={`${styles.section} ${styles.processSection}`}
      aria-labelledby="our-process"
    >
      <div className={styles.sectionHead}>
        <span className={styles.eyebrow}>Our Process</span>
        <h2 id="our-process">From Content to Customers</h2>
        <p>
          A proven system to grow your audience and turn attention into real
          business.
        </p>
      </div>

      <ol className={styles.processTrack}>
        {STEPS.map(({ Icon, title, body }, i) => (
          <li className={styles.processCell} key={title}>
            <article
              className={styles.processStep}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <b className={styles.stepNum} aria-hidden="true">
                {i + 1}
              </b>
              <Icon size={21} />
              <b>{title}</b>
              <small>{body}</small>
            </article>
            {i < STEPS.length - 1 && (
              <IconArrowRight size={17} className={styles.flowArrow} />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
