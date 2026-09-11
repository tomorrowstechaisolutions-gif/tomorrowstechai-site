import {
  IconArrowRight,
  IconBot,
  IconCalendar,
  IconChart,
  IconDashboard,
  IconFacebook,
  IconInstagram,
  IconLinkedIn,
  IconMail,
  IconMegaphone,
  IconSparkle,
  IconStar,
  IconUsers,
  IconYouTube,
} from "@/components/Icons";
import styles from "./growAudience.module.css";

/**
 * The Marketing Command Center shown in the hero — built entirely in code so it
 * reads as a real Tomorrow's Tech AI product rather than a stock screenshot.
 *
 * Every figure here is illustrative sample data for a demo account, not a claim
 * about results any customer will get.
 */

const NAV = [
  "Overview",
  "Social Accounts",
  "Content Studio",
  "Campaigns",
  "Calendar",
  "Leads",
  "Reviews",
  "Analytics",
  "Inbox",
  "Automation",
  "AI Content",
  "Settings",
] as const;

const KPIS = [
  { label: "Total Reach", value: "125,430", change: "68%", Icon: IconUsers },
  { label: "Engagement", value: "12,480", change: "52%", Icon: IconSparkle },
  { label: "New Followers", value: "4,382", change: "36%", Icon: IconStar },
  { label: "Leads Generated", value: "327", change: "82%", Icon: IconMegaphone },
] as const;

const PLATFORMS = [
  { name: "Facebook", value: "48,230", Icon: IconFacebook, tone: styles.fb },
  { name: "Instagram", value: "32,480", Icon: IconInstagram, tone: styles.ig },
  { name: "TikTok", value: "18,248", Icon: IconTikTok, tone: styles.tt },
  { name: "LinkedIn", value: "12,430", Icon: IconLinkedIn, tone: styles.li },
  { name: "YouTube", value: "8,042", Icon: IconYouTube, tone: styles.yt },
] as const;

const ACTIVITY = [
  { text: "New lead from Facebook Ad", time: "12m", Icon: IconMegaphone },
  { text: "Instagram post reached 12.4K people", time: "1h", Icon: IconChart },
  { text: "5-star review received", time: "3h", Icon: IconStar },
  { text: "New follower from Instagram", time: "5h", Icon: IconUsers },
] as const;

/** Small stand-in mark for TikTok, which the shared icon set doesn't carry. */
function IconTikTok({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 17.5a3 3 0 1 0 3-3V5c.7 2.2 2.3 3.6 4.5 3.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MarketingDashboardPreview() {
  return (
    <div
      className={styles.scene}
      role="img"
      aria-label="Example Tomorrow's Tech AI Marketing Command Center showing reach, engagement, follower and lead metrics for a sample account"
    >
      <div className={styles.sceneGlow} aria-hidden="true" />

      <div className={styles.deck}>
        <div className={styles.appShell}>
          <aside aria-hidden="true">
            <b className={styles.miniLogo}>
              <IconDashboard size={11} /> TTAI
            </b>
            {NAV.map((item, i) => (
              <span className={i === 0 ? styles.navActive : undefined} key={item}>
                <i />
                {item}
              </span>
            ))}
          </aside>

          <div className={styles.dashMain} aria-hidden="true">
            <div className={styles.dashHead}>
              <div>
                <h2>Good Morning, John</h2>
                <p>Here&rsquo;s how your audience is growing.</p>
              </div>
              <span className={styles.datePill}>
                <IconCalendar size={8} /> Last 30 Days
              </span>
            </div>

            <div className={styles.kpis}>
              {KPIS.map(({ label, value, change, Icon }) => (
                <article key={label}>
                  <span className={styles.kpiLabel}>
                    <Icon size={8} />
                    {label}
                  </span>
                  <strong>{value}</strong>
                  <em className={styles.kpiUp}>&uarr; {change}</em>
                </article>
              ))}
            </div>

            <div className={styles.board}>
              <article className={styles.chartPanel}>
                <div className={styles.panelHead}>
                  <span>Audience Growth</span>
                  <small>Last 30 Days</small>
                </div>
                <svg viewBox="0 0 340 62" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gaArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#2f97ff" stopOpacity=".45" />
                      <stop offset="1" stopColor="#2f97ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 52 L26 49 48 44 70 46 94 38 116 40 140 30 162 33 186 24 210 27 232 18 256 21 278 12 300 14 340 4 L340 62 L0 62Z"
                    fill="url(#gaArea)"
                  />
                  <path
                    d="M0 52 L26 49 48 44 70 46 94 38 116 40 140 30 162 33 186 24 210 27 232 18 256 21 278 12 300 14 340 4"
                    fill="none"
                    stroke="#4aa9ff"
                    strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <span className={styles.chartBadge}>+68%</span>
                <div className={styles.chartAxis}>
                  <span>Aug 1</span>
                  <span>Aug 8</span>
                  <span>Aug 15</span>
                  <span>Aug 22</span>
                  <span>Aug 31</span>
                </div>
              </article>

              <article className={styles.platforms}>
                <div className={styles.panelHead}>
                  <span>Top Platforms</span>
                </div>
                {PLATFORMS.map(({ name, value, Icon, tone }) => (
                  <p key={name}>
                    <Icon size={9} />
                    <span className={tone}>{name}</span>
                    <b>{value}</b>
                  </p>
                ))}
              </article>

              <article className={styles.activity}>
                <div className={styles.panelHead}>
                  <span>Recent Activity</span>
                </div>
                {ACTIVITY.map(({ text, time, Icon }) => (
                  <p key={text}>
                    <Icon size={8} />
                    {text}
                    <small>{time} ago</small>
                  </p>
                ))}
              </article>

              <article className={styles.assistant}>
                <div className={styles.panelHead}>
                  <span>
                    <IconBot size={9} /> AI Content Assistant
                  </span>
                </div>
                <p>Ask for a post and it writes the first draft.</p>
                <div className={styles.promptBox}>
                  <span>
                    Create a post about fall maintenance tips for pool owners&hellip;
                  </span>
                  <b className={styles.sendBtn}>
                    <IconArrowRight size={9} />
                  </b>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.phone} aria-hidden="true">
        <div className={styles.phoneTop} />
        <div className={styles.phoneBrand}>
          Your Brand <i>&hellip;</i>
        </div>
        <div className={styles.phoneStat}>
          <small>Total Reach</small>
          <strong>125.4K</strong>
          <em>&uarr; 68%</em>
          <div className={styles.phoneBars}>
            {[34, 48, 40, 62, 55, 78, 70, 92].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className={styles.phoneStat}>
          <small>New Leads</small>
          <strong>327</strong>
          <em>&uarr; 82%</em>
        </div>
        <div className={styles.phoneNav}>
          <IconFacebook size={11} />
          <IconInstagram size={11} />
          <IconLinkedIn size={11} />
          <IconMail size={11} />
        </div>
      </div>

      <p className={styles.script} aria-hidden="true">
        Content
        <br />
        Creates
        <br />
        <em>Opportunity.</em>
      </p>
    </div>
  );
}
