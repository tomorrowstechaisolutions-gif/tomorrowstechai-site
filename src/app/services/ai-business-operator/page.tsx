import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  IconAiChip,
  IconArrowRight,
  IconBadgeCheck,
  IconBot,
  IconCalendar,
  IconChart,
  IconChecklist,
  IconDashboard,
  IconMail,
  IconMegaphone,
  IconPhoneCall,
  IconPlay,
  IconPlug,
  IconRocket,
  IconSparkle,
  IconStar,
  IconUsers,
} from "@/components/Icons";
import styles from "./operator.module.css";

export const metadata: Metadata = {
  title: "AI Business Operator | Business Automation",
  description:
    "Tomorrow’s Tech AI installs and manages AI-powered systems for service businesses, including lead capture, automated follow-up, appointment booking, CRM, reviews, customer communication and business automation.",
  keywords: [
    "AI business automation",
    "AI for small business",
    "AI for contractors",
    "AI lead follow up",
    "automated appointment booking",
    "AI receptionist",
    "service business CRM",
    "local business automation",
    "AI business systems",
  ],
  alternates: { canonical: "/services/ai-business-operator" },
  openGraph: {
    title: "AI Business Operator | Tomorrow’s Tech AI",
    description:
      "A managed AI operating system that captures leads, follows up, books appointments and keeps your service business moving.",
    url: "https://tomorrowstechai.com/services/ai-business-operator",
    type: "website",
  },
};

const features = [
  { Icon: IconBot, title: "AI Chat & Voice", body: "Answers chats, texts and website questions 24/7" },
  { Icon: IconUsers, title: "Lead Capture", body: "Never lose a lead again" },
  { Icon: IconMail, title: "Automatic Follow-Up", body: "SMS and email campaigns that convert" },
  { Icon: IconCalendar, title: "Appointment Booking", body: "Fills your calendar automatically" },
  { Icon: IconDashboard, title: "CRM Pipeline", body: "Keep track of every lead and customer" },
  { Icon: IconStar, title: "Review Requests", body: "Get more 5-star reviews" },
  { Icon: IconPhoneCall, title: "Missed-Call Text Back", body: "Instantly responds to missed calls" },
  { Icon: IconChecklist, title: "Estimate Follow-Up", body: "Turn more quotes into jobs" },
  { Icon: IconSparkle, title: "Customer Reminders", body: "Reduce no-shows" },
  { Icon: IconMail, title: "AI Email Responses", body: "Professional, on-brand communication" },
  { Icon: IconMegaphone, title: "Social Media Posting", body: "Keep your business active" },
  { Icon: IconChart, title: "Reporting Dashboard", body: "See your growth in real time" },
];

const benefits = [
  { Icon: IconUsers, title: "Capture More Leads", body: "Never let an inquiry disappear" },
  { Icon: IconCalendar, title: "Book More Appointments", body: "Respond while customers are still interested" },
  { Icon: IconMail, title: "Improve Follow-Up", body: "Stay in touch automatically" },
  { Icon: IconStar, title: "Build More Reviews", body: "Create consistent review-request workflows" },
];

const plans = [
  {
    id: "starter",
    name: "AI Starter",
    price: "$199",
    setup: "$299 setup",
    includes: ["AI chat", "Missed-call text back", "Lead capture", "Basic follow-up", "Professional website included when applicable"],
    cta: "Get Started",
  },
  {
    id: "growth",
    name: "AI Growth",
    price: "$399",
    setup: "$749 setup",
    featured: true,
    includes: ["Everything in Starter", "CRM & pipeline management", "Appointment booking", "Review requests", "Enhanced follow-up automation", "Basic social media posting"],
    cta: "Get Started",
  },
  {
    id: "operator",
    name: "AI Operator",
    price: "$699",
    setup: "$1,499 setup",
    includes: ["Everything in Growth", "Advanced automation", "Estimate follow-up", "Customer reminders", "AI email responses", "Expanded reporting", "Priority support"],
    cta: "Get Started",
  },
  {
    id: "custom",
    name: "Custom",
    price: "$999",
    prefix: "Starting at",
    setup: "$2,500+ setup",
    includes: ["Custom workflow design", "Custom integrations", "API connections", "Advanced reporting", "Dedicated support", "Scalable automation architecture"],
    cta: "Let’s Talk",
  },
];

const industries = [
  { name: "Pool Companies", image: "/work/poolbusinessai.webp" },
  { name: "HVAC", image: "/industries/contractors-home-services.webp", position: "54% 48%" },
  { name: "Roofers", image: "/industries/contractors-home-services.webp", position: "78% 45%" },
  { name: "Tower Companies", image: "/industries/professional-services.webp" },
  { name: "Plumbers", image: "/industries/contractors-home-services.webp", position: "38% 65%" },
  { name: "Electricians", image: "/hero-building.webp" },
  { name: "Landscapers", image: "/industries/real-estate-property.webp" },
  { name: "Auto & Service", image: "/work/aegisfleet.webp" },
  { name: "Contractors", image: "/industries/contractors-home-services.webp" },
  { name: "Other Local Services", image: "/industries/retail-ecommerce.webp" },
];

const steps = [
  { title: "We Learn Your Business", body: "We review your workflow, leads, scheduling and customer communication." },
  { title: "We Build Your System", body: "We configure the website, CRM, AI, automations and integrations." },
  { title: "We Launch It", body: "Your system begins capturing, responding and following up." },
  { title: "We Manage It", body: "Tomorrow’s Tech AI monitors and improves the system with you." },
];

const trust = [
  { Icon: IconBadgeCheck, title: "Managed by Tomorrow’s Tech AI", body: "We build, monitor and improve the system with you." },
  { Icon: IconUsers, title: "Built for Service Businesses", body: "Designed around real calls, estimates, jobs and customers." },
  { Icon: IconPlug, title: "Custom Automation", body: "Workflows configured around the way your business actually runs." },
  { Icon: IconRocket, title: "Human Support Included", body: "Real help is part of the service—not an extra add-on." },
];

export default function AiBusinessOperatorPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>AI automation for real businesses</div>
            <h1>Never Miss<br />Another Customer.</h1>
            <p>
              We install and manage AI systems that capture leads, follow up automatically,
              book appointments, and help your business grow — so you can focus on the work you do best.
            </p>
            <div className={styles.heroActions}>
              <Link href="/contact" className="btn-primary">
                Get a Free Demo <IconArrowRight size={16} />
              </Link>
              <Link href="#how-it-works" className={styles.secondaryButton}>
                <span className={styles.play}><IconPlay size={13} /></span>
                See How It Works
              </Link>
            </div>
            <div className={styles.benefitStrip} aria-label="Key benefits">
              {["More Leads", "More Booked Jobs", "More Revenue", "Less Stress"].map((item) => (
                <span key={item}><IconBadgeCheck size={17} />{item}</span>
              ))}
            </div>
          </div>

          <div className={styles.heroVisual}>
            <Image
              src="/industries/contractors-home-services.webp"
              alt="Service business contractor reviewing plans at a job site"
              fill
              loading="eager"
              sizes="(max-width: 900px) 100vw, 52vw"
              className={styles.heroImage}
            />
            <div className={styles.imageShade} />
            <div className={`${styles.notification} ${styles.leadCard}`}>
              <span className={styles.notificationIcon}><IconBot size={20} /></span>
              <span><strong>New Lead</strong><small>“Hi, do you offer pool maintenance?”</small><em>AI responded • 2 min ago</em></span>
            </div>
            <div className={`${styles.notification} ${styles.bookingCard}`}>
              <span className={styles.notificationIcon}><IconCalendar size={20} /></span>
              <span><strong>Appointment Booked</strong><small>Service Call</small><em>Tue, Oct 21 • 10:00 AM</em></span>
            </div>
            <div className={`${styles.notification} ${styles.reviewCard}`}>
              <span className={`${styles.notificationIcon} ${styles.starIcon}`}><IconStar size={21} /></span>
              <span><strong>New Review</strong><small>“Great service! Highly recommend!”</small><em className={styles.stars}>★★★★★</em></span>
            </div>
            <div className={styles.handwritten}>Let AI<br />work for you.</div>
          </div>
        </div>
      </section>

      <section className={`${styles.lightSection} ${styles.featuresSection}`}>
        <SectionHeading eyebrow="Your AI Business Operator" title="Everything You Need to Run and Grow Your Business" body="We set it up. We manage it. You get the results." />
        <div className={styles.featureGrid}>
          {features.map(({ Icon, title, body }) => (
            <article key={title} className={styles.featureCard}>
              <span className={styles.featureIcon}><Icon size={25} /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.lightSection} ${styles.resultsSection}`}>
        <SectionHeading eyebrow="Real Results for Real Businesses" title="Built to Help Your Business Grow" />
        <div className={styles.benefitGrid}>
          {benefits.map(({ Icon, title, body }) => (
            <article key={title} className={styles.benefitCard}>
              <Icon size={24} />
              <div><h3>{title}</h3><p>{body}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className={`${styles.lightSection} ${styles.pricingSection}`}>
        <SectionHeading eyebrow="Simple, Transparent Pricing" title="Choose the Right Plan for Your Business" />
        <div className={styles.pricingGrid}>
          {plans.map((plan) => (
            <article key={plan.name} className={`${styles.priceCard} ${plan.featured ? styles.featuredPlan : ""}`}>
              {plan.featured && <div className={styles.popular}>Most Popular</div>}
              <h3>{plan.name}</h3>
              <div className={styles.priceLine}>
                {plan.prefix && <span>{plan.prefix}</span>}
                <strong>{plan.price}</strong><b>/ month</b>
              </div>
              <p className={styles.setup}>{plan.setup}</p>
              <ul>
                {plan.includes.map((item) => <li key={item}><IconBadgeCheck size={16} />{item}</li>)}
              </ul>
              <Link href={`/get-started?plan=${plan.id}`} className={plan.featured ? "btn-primary" : styles.priceButton}>{plan.cta}</Link>
            </article>
          ))}
        </div>
        <p className={styles.pricingNote}>Plans are configured around your workflow. Final scope and pricing are confirmed before work begins.</p>
      </section>

      <section className={`${styles.lightSection} ${styles.industrySection}`}>
        <SectionHeading eyebrow="Industries We Serve" title="Built for Service Businesses Like Yours" />
        <div className={styles.industryRail}>
          {industries.map((industry) => (
            <article key={industry.name} className={styles.industryCard}>
              <Image src={industry.image} alt="" fill sizes="(max-width: 640px) 45vw, 220px" style={{ objectPosition: industry.position }} />
              <div className={styles.industryShade} />
              <h3>{industry.name}</h3>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className={`${styles.lightSection} ${styles.processSection}`}>
        <SectionHeading eyebrow="How It Works" title="We Build It. We Run It. You Grow." />
        <div className={styles.steps}>
          {steps.map((step, index) => (
            <article key={step.title} className={styles.step}>
              <span className={styles.stepNumber}>{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.dashboardSection}>
        <div className={styles.dashboardIntro}>
          <div className={styles.darkEyebrow}>Your business at a glance</div>
          <h2>See What’s Happening Across Your Business</h2>
          <p>One clear operating picture for leads, appointments, follow-up and customer activity.</p>
          <div className={styles.liveStatus}><span /> Live workflow overview</div>
        </div>
        <div className={styles.dashboardShell} aria-label="Example AI Business Operator dashboard">
          <div className={styles.dashboardTopbar}>
            <span><IconAiChip size={19} /> Business Operator</span>
            <em>Visual preview</em>
          </div>
          <div className={styles.metricGrid}>
            {["New Leads", "Appointments", "Pipeline Value", "Follow-Up Activity", "Reviews", "Website Activity"].map((label, index) => (
              <div className={styles.metricCard} key={label}>
                <span>{label}</span>
                <strong>{["Active", "On track", "Visible", "Running", "Monitored", "Live"][index]}</strong>
                <i className={styles.miniLine} style={{ "--bar": `${45 + index * 8}%` } as React.CSSProperties} />
              </div>
            ))}
          </div>
          <div className={styles.chartCard}>
            <div><strong>Business activity</strong><span>Illustrative workflow volume</span></div>
            <svg viewBox="0 0 720 180" role="img" aria-label="Illustrative activity trend line">
              <defs><linearGradient id="operatorArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity=".38"/><stop offset="1" stopColor="#3b82f6" stopOpacity="0"/></linearGradient></defs>
              <path d="M0 142 C70 130 95 136 150 105 S250 122 305 82 S410 110 465 63 S575 80 720 24 L720 180 L0 180 Z" fill="url(#operatorArea)" />
              <path d="M0 142 C70 130 95 136 150 105 S250 122 305 82 S410 110 465 63 S575 80 720 24" fill="none" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </section>

      <section className={`${styles.lightSection} ${styles.trustSection}`}>
        <SectionHeading eyebrow="Built Around Your Business" title="Built for Real Businesses" body="The technology matters. The way it is managed matters more." />
        <div className={styles.trustGrid}>
          {trust.map(({ Icon, title, body }) => (
            <article key={title} className={styles.trustCard}><Icon size={25} /><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <div className={styles.darkEyebrow}>Your next customer is already looking</div>
          <h2>Ready to Put AI to Work in Your Business?</h2>
          <p>Let us build and manage the system that captures leads, follows up, books appointments, and keeps your business moving.</p>
        </div>
        <div className={styles.finalActions}>
          <Link href="/contact" className="btn-primary">Get a Free Demo <IconArrowRight size={16} /></Link>
          <Link href="/contact" className={styles.secondaryButton}>Talk to Tomorrow’s Tech AI</Link>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className={styles.sectionHeading}>
      <div className={styles.lightEyebrow}>{eyebrow}</div>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
    </div>
  );
}
