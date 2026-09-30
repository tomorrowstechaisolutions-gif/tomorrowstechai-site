import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  IconAiChip,
  IconArrowRight,
  IconBadgeCheck,
  IconBrain,
  IconCart,
  IconChart,
  IconChecklist,
  IconCode,
  IconCpu,
  IconDashboard,
  IconMapPin,
  IconNetwork,
  IconRocket,
  IconSparkle,
  IconUsers,
} from "@/components/Icons";
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

const support = [
  ["AI Readiness Assessments", IconAiChip],
  ["Business Modernization Plans", IconChecklist],
  ["AI & Automation Implementation", IconCpu],
  ["CRM & Workflow Improvement", IconDashboard],
  ["Workforce Training", IconUsers],
  ["90-Day Impact Tracking", IconChart],
] as const;

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
    "Does expressing interest guarantee participation?",
    "No. Expressions of interest help demonstrate local demand and identify businesses that may be appropriate for a future pilot.",
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
    "Tomorrow’s Tech AI is the proposed program operator and AI implementation partner.",
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
          <p className={styles.heroEyebrow}>Central Texas</p>
          <h1 id="initiative-title">AI Business<br />Modernization<br /><span>Initiative</span></h1>
          <p className={styles.heroLead}>Helping Central Texas small businesses modernize with practical AI, automation, digital technology, and workforce training.</p>
          <p className={styles.heroCopy}>A proposed 12-month regional pilot designed to help 25 Central Texas businesses adopt practical AI technology, train their workforce, improve operational efficiency, and prepare for the future of business.</p>
          <div className={styles.heroActions}>
            <Link href="#business-interest" className={styles.primaryButton}>Business: Express Interest <IconArrowRight /></Link>
            <Link href="#partner-interest" className={styles.secondaryButton}>Organizations: Partner With Us <IconArrowRight /></Link>
          </div>
        </div>
      </section>

      <section className={styles.kpiStrip} aria-label="Pilot highlights">
        {[
          ["25", "Local Businesses", "Pilot Program"],
          ["12 Months", "Program Duration", "Proposed pilot"],
          ["Real Results", "Measurable Impact", "Practical outcomes"],
          ["Local Workforce", "Training & Growth", "Skills that stay local"],
          ["Stronger Economy", "A More Resilient Central Texas", "Regional capacity"],
        ].map(([value, label, detail]) => (
          <div key={value}><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={`${styles.split} ${styles.aboutGrid}`}>
          <div>
            <SectionHeading eyebrow="About the initiative">Practical AI. Real Support.<br />A Stronger Central Texas.</SectionHeading>
            <p>The Central Texas AI Business Modernization Initiative is a proposed regional program led by Tomorrow’s Tech AI to support small and rural businesses with AI readiness assessments, modernization planning, implementation support, and workforce training.</p>
            <p>Our goal is to help local businesses operate more efficiently, serve their customers better, and stay competitive in a rapidly changing economy.</p>
            <Link href="#pilot" className={styles.textLink}>Learn more about the proposed pilot <IconArrowRight /></Link>
          </div>
          <div className={styles.aboutVisual}>
            <Image src="/central-texas-ai/investing-in-central-texas.png" alt="Investing in Central Texas businesses through assessments, planning, implementation, training, and impact tracking" fill sizes="(max-width: 900px) 100vw, 50vw" />
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tintSection}`}>
        <SectionHeading eyebrow="Program support" center>What Participating Businesses Receive</SectionHeading>
        <div className={styles.supportGrid}>
          {support.map(([title, Icon]) => <article key={title} className={styles.supportCard}><Icon size={28} /><h3>{title}</h3></article>)}
        </div>
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
          <SectionHeading eyebrow="The process">How It Works</SectionHeading>
          <div className={styles.processGrid}>
            {process.map(([title, copy], index) => <article key={title}><span>{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
          <div className={styles.quoteRow}>
            <blockquote>“This initiative can help our local businesses not just survive, but thrive in the next decade.”<small>A stronger Central Texas starts with stronger businesses.</small></blockquote>
            <div><Link href="#business-interest" className={styles.primaryButton}>Express Interest Now <IconArrowRight /></Link><small>Be Part of the Pilot Program</small></div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="pilot">
        <SectionHeading eyebrow="Program snapshot">Initial 12-Month Pilot</SectionHeading>
        <div className={styles.snapshotGrid}>
          <div className={styles.snapshotStats}>
            {[
              ["Pilot Size", "25 Central Texas Businesses"],
              ["Program Duration", "12 Months"],
              ["Initial Funding Target", "$250,000"],
              ["Geographic Focus", "Bell County and adjacent eligible rural Central Texas communities"],
              ["Program Operator", "Tomorrow’s Tech AI"],
            ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          <div className={styles.goalsCard}><h3>Primary Goals</h3><ul>{["Business modernization", "Practical AI adoption", "Workforce training", "Operational improvement", "Jobs created or retained where applicable", "Measurable economic impact"].map((goal) => <li key={goal}><IconBadgeCheck />{goal}</li>)}</ul><p>This is a proposed pilot. Funding has not been approved or awarded.</p></div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tintSection}`}>
        <SectionHeading eyebrow="Performance targets" center>Measuring Real Impact</SectionHeading>
        <div className={styles.metricGrid}>{metrics.map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
        <p className={styles.metricNote}>The program will also track time savings, process improvements, productivity gains, revenue opportunities, workforce outcomes, and jobs created or retained where applicable.</p>
      </section>

      <section className={`${styles.section} ${styles.partnerSection}`}>
        <div className={styles.split}>
          <div>
            <SectionHeading eyebrow="Partner with us">Building the Future of Central Texas Business Together</SectionHeading>
            <p>Tomorrow’s Tech AI is seeking partnerships with economic-development organizations, cities, counties, workforce organizations, colleges, nonprofits, and other organizations interested in helping Central Texas businesses modernize and compete.</p>
            <div className={styles.partnerActions}><Link href="#partner-interest" className={styles.primaryButton}>Become a Program Partner <IconArrowRight /></Link><Link href="/contact" className={styles.secondaryButton}>Contact Tomorrow’s Tech AI</Link></div>
          </div>
          <div className={styles.partnerAreas}><h3>Potential partnership areas</h3><ul>{["Program development", "Business recruitment", "Workforce training", "Economic-development planning", "Federal and state funding alignment", "USDA Rural Development opportunities", "EDA opportunities", "Community outreach", "Impact measurement", "Regional expansion"].map((item) => <li key={item}><IconNetwork />{item}</li>)}</ul></div>
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
