import { existsSync } from "node:fs";
import path from "node:path";
import { cwd } from "node:process";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  IconAiChip,
  IconArrowRight,
  IconBadgeCheck,
  IconBot,
  IconBrain,
  IconCart,
  IconChart,
  IconChecklist,
  IconCode,
  IconCpu,
  IconDashboard,
  IconDownload,
  IconMapPin,
  IconNetwork,
  IconRocket,
  IconSparkle,
  IconUsers,
} from "@/components/Icons";
import { CONCEPT_SHEET_PATH } from "@/lib/central-texas-ai/config";
import { InitiativeForms } from "./InitiativeForms";
import styles from "./initiative.module.css";

export const metadata: Metadata = {
  title: { absolute: "Central Texas AI Business Modernization Initiative | Tomorrow’s Tech AI" },
  description:
    "The Central Texas AI Business Modernization Initiative helps small and rural businesses explore practical AI, automation, digital modernization, and workforce training opportunities.",
  alternates: { canonical: "/central-texas-ai" },
  openGraph: {
    title: "Central Texas AI Business Modernization Initiative",
    description:
      "A proposed regional pilot helping Central Texas businesses explore practical AI, modernization, and workforce training.",
    url: "https://tomorrowstechai.com/central-texas-ai",
    images: ["/central-texas-ai/central-texas-initiative-hero.png"],
  },
};

const benefits = [
  ["Increase Efficiency", "Automate repetitive tasks and streamline operations.", IconCpu],
  ["Strengthen Your Team", "Train owners and employees on practical AI and digital tools.", IconUsers],
  ["Improve Profitability", "Save time, reduce operating friction, and create new opportunities for growth.", IconChart],
  ["Stay Competitive", "Adopt modern technology to meet changing customer and market demands.", IconBrain],
  ["Support Central Texas", "Build a stronger, more resilient local economy.", IconMapPin],
] as const;

type SupportItem = {
  title: string;
  Icon: typeof IconAiChip;
  copy: string;
  /** Only the two cards that are easy to confuse carry a focus list. */
  focus?: { label: string; items: string[]; tone: "ai" | "ops" };
};

const support: SupportItem[] = [
  { title: "AI Readiness Assessments", Icon: IconAiChip, copy: "A structured review of current operations, tools, and where AI could realistically help." },
  { title: "Business Modernization Plans", Icon: IconChecklist, copy: "A prioritized, practical roadmap sized to each business." },
  {
    title: "AI & Automation Implementation",
    Icon: IconBot,
    copy: "Putting practical AI to work — answering, assisting, and taking repetitive tasks off the team.",
    focus: { label: "Customer-facing & task AI", tone: "ai", items: ["AI receptionists", "Customer service AI", "AI assistants", "Repetitive task automation", "Intelligent workflow actions", "Practical AI deployment"] },
  },
  {
    title: "CRM & Workflow Improvement",
    Icon: IconDashboard,
    copy: "Organizing how leads, work, and information move through the business.",
    focus: { label: "Internal operations", tone: "ops", items: ["Lead tracking", "Customer pipelines", "Internal processes", "Scheduling", "Task routing", "Operational visibility", "Business process organization"] },
  },
  { title: "Workforce Training", Icon: IconUsers, copy: "Hands-on training so owners and employees can use new tools with confidence." },
  { title: "90-Day Impact Tracking", Icon: IconChart, copy: "Measuring time saved, process gains, and outcomes after implementation." },
];

const industries = [
  ["Trades & Contractors", IconCode],
  ["Retail & E-Commerce", IconCart],
  ["Professional Services", IconDashboard],
  ["Health & Wellness", IconBadgeCheck],
  ["Pool & Home Services", IconSparkle],
  ["Telecom & Infrastructure", IconNetwork],
  ["Hospitality & Tourism", IconUsers],
  ["Agriculture & Rural Business", IconMapPin],
  ["And More", IconRocket],
] as const;

const process = [
  ["Express Interest", "Complete a short form to tell us about your business."],
  ["AI Readiness Assessment", "We review your current operations and opportunities."],
  ["Modernization Plan", "A custom modernization plan is created for your business."],
  ["Implementation & Training", "We help put the tools in place and train your team."],
  ["Measure Results", "Track progress and real business impact over 90 days."],
] as const;

const metrics = [
  ["25", "Businesses Assessed"],
  ["25", "Modernization Plans"],
  ["20+", "AI Implementations"],
  ["50+", "Owners & Employees Trained"],
  ["80%+", "Target Completion Rate"],
  ["90 Days", "Impact Tracking Per Business"],
] as const;

const faqs = [
  [
    "What is the Central Texas AI Business Modernization Initiative?",
    "It is a proposed regional pilot designed to help small and rural businesses assess their AI readiness, build a practical modernization plan, implement useful technology, and train their workforce.",
  ],
  [
    "Who is the program for?",
    "The initiative is intended for small businesses in Bell County and adjacent eligible rural Central Texas communities across a broad range of industries.",
  ],
  [
    "Is the program already funded?",
    "No. The initiative is currently being developed as a proposed regional pilot while Tomorrow’s Tech AI explores partnerships and appropriate economic-development funding opportunities.",
  ],
  [
    "Does expressing interest guarantee participation or free services?",
    "No. Expressions of interest help demonstrate local demand and identify businesses that may be appropriate for a future pilot. Participation, services, and any cost to businesses are subject to program development and funding.",
  ],
  [
    "Are any economic-development organizations or agencies already partners?",
    "Not at this time. Tomorrow’s Tech AI is seeking potential partners and exploring funding opportunities, which may include USDA Rural Development and EDA programs. No organization or agency has approved, endorsed, or funded the initiative.",
  ],
  [
    "Will businesses have to pay?",
    "Program structure and funding are still being developed. Participation terms will be communicated before any business commits to the program.",
  ],
  [
    "What types of AI systems could be implemented?",
    "Examples may include AI customer service, phone and reception systems, CRM automation, workflow automation, marketing tools, digital business systems, reporting, and other practical technologies based on business needs.",
  ],
  [
    "Who operates the program?",
    "Tomorrow’s Tech AI is the proposed program operator and AI implementation partner, subject to program development and funding.",
  ],
] as const;

function SectionHeading({ eyebrow, children, center = false }: { eyebrow?: string; children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`${styles.heading} ${center ? styles.center : ""}`}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h2>{children}</h2>
    </div>
  );
}

/**
 * The concept sheet is a file John drops into /public. Checked at build time
 * so the button never points at a 404: until the PDF exists, it asks for the
 * sheet through the partner form instead.
 */
const conceptSheetAvailable = existsSync(path.join(cwd(), "public", CONCEPT_SHEET_PATH));

export default function CentralTexasAiPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="initiative-title">
        <Image
          src="/central-texas-ai/central-texas-initiative-hero.png"
          alt="Central Texas skyline at sunset with the initiative identity and a Texas map"
          fill
          priority
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} />
        <div className={styles.heroInner}>
          <p className={styles.operatorLine}><span aria-hidden="true" />Proposed regional pilot operated by Tomorrow’s Tech AI</p>
          <p className={styles.heroEyebrow}>Central Texas</p>
          <h1 id="initiative-title">AI Business<br />Modernization<br /><span>Initiative</span></h1>
          <p className={styles.heroLead}>Helping Central Texas small businesses modernize with practical AI, automation, digital technology, and workforce training.</p>
          <p className={styles.heroCopy}>A proposed 12-month regional pilot designed to help 25 Central Texas businesses adopt practical AI technology, train their workforce, improve operational efficiency, and prepare for the future of business.</p>
          <div className={styles.heroActions}>
            <Link href="#business-interest" className={`${styles.primaryButton} ${styles.ctaStack}`}>
              <span className={styles.ctaKicker}>For businesses</span>
              <span className={styles.ctaLabel}>Express Interest <IconArrowRight /></span>
            </Link>
            <Link href="#partner-interest" className={`${styles.secondaryButton} ${styles.ctaStack}`}>
              <span className={styles.ctaKicker}>For organizations</span>
              <span className={styles.ctaLabel}>Partner With Us <IconArrowRight /></span>
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.kpiStrip} aria-label="Pilot highlights">
        {[
          ["25", "Local Businesses", "Proposed pilot size"],
          ["12 Months", "Program Duration", "Proposed pilot"],
          ["Real Results", "Measurable Impact", "Program goal"],
          ["Local Workforce", "Training & Growth", "Program goal"],
          ["Stronger Economy", "A More Resilient Central Texas", "Program goal"],
        ].map(([value, label, detail]) => (
          <div key={value}><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={`${styles.split} ${styles.aboutGrid}`}>
          <div>
            <SectionHeading eyebrow="About the initiative">Practical AI. Real Support.<br />A Stronger Central Texas.</SectionHeading>
            <p>The Central Texas AI Business Modernization Initiative is a proposed regional program operated by Tomorrow’s Tech AI to support small and rural businesses with AI readiness assessments, modernization planning, implementation support, and workforce training.</p>
            <p>Our goal is to help local businesses operate more efficiently, serve their customers better, and stay competitive in a rapidly changing economy.</p>
            <Link href="#pilot" className={styles.textLink}>Learn more about the proposed pilot <IconArrowRight /></Link>
          </div>
          <div className={styles.aboutVisual}>
            <Image src="/central-texas-ai/investing-in-central-texas.png" alt="Investing in Central Texas businesses through assessments, planning, implementation, training, and impact tracking" fill sizes="(max-width: 900px) 100vw, 50vw" />
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tintSection}`}>
        <SectionHeading eyebrow="Program support" center>What Participating Businesses Would Receive</SectionHeading>
        <div className={styles.supportGrid}>
          {support.map(({ title, Icon, copy, focus }) => (
            <article key={title} className={`${styles.supportCard} ${focus ? styles[`focus_${focus.tone}`] : ""}`}>
              <div className={styles.supportHead}><span className={styles.supportIcon}><Icon size={24} /></span><h3>{title}</h3></div>
              {focus ? <p className={styles.focusLabel}>{focus.label}</p> : null}
              <p className={styles.supportCopy}>{copy}</p>
              {focus ? <ul className={styles.focusList} aria-label={`${title} focus areas`}>{focus.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </article>
          ))}
        </div>
        <p className={styles.supportNote}>Proposed program support, subject to program development and funding.</p>
      </section>

      <section className={styles.section}>
        <SectionHeading eyebrow="Key benefits">Helping Local Businesses Go Further</SectionHeading>
        <div className={styles.benefitGrid}>
          {benefits.map(([title, copy, Icon]) => <article key={title} className={styles.card}><Icon size={30} /><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className={`${styles.section} ${styles.industrySection}`}>
        <SectionHeading eyebrow="Industries we support" center>Built for Real Central Texas Businesses</SectionHeading>
        <div className={styles.industryGrid}>
          {industries.map(([industry, Icon]) => <div key={industry}><Icon size={30} /><strong>{industry}</strong></div>)}
        </div>
      </section>

      <section className={styles.processSection}>
        <Image src="/central-texas-ai/industries-process-sunset.png" alt="A Central Texas sunset behind the initiative process" fill sizes="100vw" className={styles.processImage} />
        <div className={styles.processOverlay} />
        <div className={styles.processInner}>
          <SectionHeading eyebrow="The proposed process">How It Would Work</SectionHeading>
          <div className={styles.processGrid}>
            {process.map(([title, copy], index) => <article key={title}><span>{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
          <div className={styles.quoteRow}>
            <blockquote>Our aim: help local businesses not just survive, but thrive in the next decade.<small>A stronger Central Texas starts with stronger businesses.</small></blockquote>
            <div><Link href="#business-interest" className={styles.primaryButton}>Express Interest <IconArrowRight /></Link><small>Help shape the proposed pilot</small></div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="pilot">
        <SectionHeading eyebrow="Program snapshot">Proposed 12-Month Pilot</SectionHeading>
        <div className={styles.snapshotGrid}>
          <div className={styles.snapshotStats}>
            {[
              ["Pilot Size", "25 Central Texas Businesses"],
              ["Program Duration", "12 Months"],
              ["Initial Funding Target", "$250,000"],
              ["Geographic Focus", "Bell County and adjacent eligible rural Central Texas communities"],
              ["Proposed Program Operator", "Tomorrow’s Tech AI"],
            ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          <div className={styles.goalsCard}><h3>Primary Goals</h3><ul>{["Business modernization", "Practical AI adoption", "Workforce training", "Operational improvement", "Jobs created or retained where applicable", "Measurable economic impact"].map((goal) => <li key={goal}><IconBadgeCheck />{goal}</li>)}</ul><p>This is a proposed pilot. Funding has not been approved or awarded, and no agency or organization has approved or endorsed the program. Figures are initial targets, subject to program development and funding.</p></div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tintSection}`}>
        <SectionHeading eyebrow="Proposed performance targets" center>Measuring Real Impact</SectionHeading>
        <div className={styles.metricGrid}>{metrics.map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
        <p className={styles.metricNote}>All figures are proposed pilot targets, not results. The program would also track time savings, process improvements, productivity gains, revenue opportunities, workforce outcomes, and jobs created or retained where applicable.</p>
      </section>

      <section className={`${styles.section} ${styles.partnerSection}`}>
        <div className={styles.split}>
          <div>
            <SectionHeading eyebrow="Partner with us">Building the Future of Central Texas Business Together</SectionHeading>
            <p className={styles.partnerAudience}>Seeking EDC, workforce, education, nonprofit, and public-sector partners.</p>
            <p>Tomorrow’s Tech AI is seeking potential partners — economic-development corporations, cities, counties, chambers, workforce organizations, colleges, nonprofits, and public-sector organizations — to collaborate on economic development, business recruitment, workforce training, education, grant and funding alignment, community outreach, regional expansion, and business modernization.</p>
            <p className={styles.partnerDisclaimer}>No organization is currently a formal partner. Any partnership would be subject to discussion and agreement.</p>
            <div className={styles.partnerActions}><Link href="#partner-interest" className={styles.primaryButton}>Partner With Us <IconArrowRight /></Link><Link href="#executive-overview" className={styles.secondaryButton}>Executive Concept Sheet</Link></div>
          </div>
          <div className={styles.partnerAreas}><h3>Potential collaboration areas</h3><ul>{["Economic development", "Business recruitment", "Workforce training", "Education & training programs", "Grant / funding alignment", "Exploring USDA Rural Development programs", "Exploring EDA programs", "Community outreach", "Regional expansion", "Business modernization", "Impact measurement", "Program development"].map((item) => <li key={item}><IconNetwork />{item}</li>)}</ul></div>
        </div>
      </section>

      <section className={styles.section} id="executive-overview" aria-labelledby="executive-overview-title">
        <div className={styles.downloadCard}>
          <div className={styles.downloadDoc} aria-hidden="true">
            <IconDownload size={34} />
            <span>PDF</span>
          </div>
          <div className={styles.downloadBody}>
            <p className={styles.eyebrow}>For partners</p>
            <h2 id="executive-overview-title">For Economic Development &amp; Community Partners</h2>
            <p>Download the executive overview of the proposed Central Texas AI Business Modernization Initiative.</p>
            <ul className={styles.downloadMeta}>
              <li>Program structure &amp; operator</li>
              <li>Initial funding target</li>
              <li>Proposed performance targets</li>
            </ul>
          </div>
          <div className={styles.downloadActions}>
            {conceptSheetAvailable ? (
              <a href={CONCEPT_SHEET_PATH} className={styles.primaryButton} download>Download Executive Concept Sheet <IconDownload size={18} /></a>
            ) : (
              <Link href="#partner-interest" className={styles.primaryButton}>Request Executive Concept Sheet <IconArrowRight /></Link>
            )}
            <Link href="#partner-interest" className={styles.secondaryButton}>Partner With Us <IconArrowRight /></Link>
            <small>Proposed pilot · subject to program development and funding</small>
          </div>
        </div>
      </section>

      <InitiativeForms />

      <section className={styles.section}>
        <SectionHeading eyebrow="Answers for businesses and partners" center>Frequently Asked Questions</SectionHeading>
        <div className={styles.faqs}>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <section className={styles.finalCta}>
        <IconRocket size={34} />
        <h2>Let’s Build a Stronger Central Texas</h2>
        <p>Whether you’re a local business owner, economic-development organization, workforce partner, educator, or community leader, we want to hear from you.</p>
        <div><Link href="#business-interest" className={styles.primaryButton}>Businesses: Express Interest</Link><Link href="#partner-interest" className={styles.secondaryButton}>Organizations: Partner With Us</Link></div>
        <a href="https://tomorrowstechai.com">tomorrowstechai.com</a>
      </section>
    </div>
  );
}
