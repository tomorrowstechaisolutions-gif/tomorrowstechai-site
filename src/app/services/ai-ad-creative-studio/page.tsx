import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  IconAiChip,
  IconArrowRight,
  IconBadgeCheck,
  IconBrush,
  IconChart,
  IconChecklist,
  IconDashboard,
  IconMegaphone,
  IconSparkle,
} from "@/components/Icons";
import styles from "./studio.module.css";

const COVER = "/ai-solutions/ai-ad-creative-studio-cover.png";

export const metadata: Metadata = {
  title: "AI Ad Creative Studio",
  description: "Turn services, packages, and offers into polished, on-brand image ads with catalog-backed copy, reusable templates, approvals, and multi-format exports.",
  alternates: { canonical: "/services/ai-ad-creative-studio" },
  openGraph: {
    title: "AI Ad Creative Studio | Tomorrow’s Tech AI",
    description: "Professional, on-brand image ads generated from your real catalog and brand system.",
    url: "https://tomorrowstechai.com/services/ai-ad-creative-studio",
    type: "website",
    images: [{ url: COVER, width: 1254, height: 1254, alt: "AI Ad Creative Studio" }],
  },
  twitter: { card: "summary_large_image", images: [COVER] },
};

const formats = [
  ["1:1", "1200 × 1200", "Square posts and ads"],
  ["4:5", "1080 × 1350", "Portrait social creative"],
  ["9:16", "1080 × 1920", "Stories, Reels, and Shorts"],
  ["1.91:1", "1200 × 628", "Landscape campaigns"],
  ["Website", "1600 × 900", "Landing-page hero creative"],
];

const capabilities = [
  { Icon: IconDashboard, title: "Catalog-backed", body: "Names, prices, features, and calls to action come from your approved service catalog—not made-up copy." },
  { Icon: IconBrush, title: "Consistently branded", body: "Your logo, palette, visual direction, and messaging system stay connected to every creative." },
  { Icon: IconAiChip, title: "Reusable templates", body: "Repeat proven layouts across new services and campaigns without rebuilding from zero." },
  { Icon: IconChecklist, title: "Approval controlled", body: "Drafts stay separate from approved assets, with a clear history of what was generated and used." },
  { Icon: IconChart, title: "Cost accountable", body: "Generation records retain their source snapshot, provider, model, and known cost for honest reporting." },
  { Icon: IconMegaphone, title: "Ready for channels", body: "Download PNG, WebP, or JPEG files sized for social, paid media, and your website." },
];

const steps = [
  ["01", "Select", "Choose a live service, package, or custom offer."],
  ["02", "Customize", "Set the message, audience, visual direction, template, and formats."],
  ["03", "Generate", "AI creates the artwork while the system composes exact, readable offer copy."],
  ["04", "Approve", "Review, download, archive, or assign the approved image as the official catalog creative."],
];

export default function AiAdCreativeStudioPage() {
  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "AI Ad Creative Studio",
    serviceType: "AI-powered advertising creative production",
    provider: { "@type": "Organization", name: "Tomorrow’s Tech AI", url: "https://tomorrowstechai.com" },
    url: "https://tomorrowstechai.com/services/ai-ad-creative-studio",
    image: `https://tomorrowstechai.com${COVER}`,
    description: "A branded system for creating, reviewing, and managing multi-format image advertisements from real service and package catalog data.",
  };

  return <main className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />

    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}><IconSparkle size={15}/> AI Ad Creative Studio</span>
        <h1>Professional Ads.<br/><em>Built From<br/>Your Business.</em></h1>
        <p className={styles.lead}>Turn real services, packages, and offers into polished, on-brand image ads—without losing control of your message.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/contact?service=ai-ad-creative-studio">Build My Ad System <IconArrowRight size={17}/></Link>
          <Link className={styles.secondary} href="#how-it-works">See How It Works</Link>
        </div>
        <div className={styles.proof}>
          <span><IconBadgeCheck size={17}/> Real catalog data</span>
          <span><IconBadgeCheck size={17}/> Brand controlled</span>
          <span><IconBadgeCheck size={17}/> Human approval</span>
        </div>
      </div>
      <div className={styles.cover}>
        <Image src={COVER} alt="AI Ad Creative Studio service cover" width={1254} height={1254} priority sizes="(max-width: 850px) 92vw, 48vw" />
      </div>
    </section>

    <section className={styles.statement}>
      <IconAiChip size={34}/><div><span>More than an image generator</span><h2>A connected creative production system.</h2></div>
      <p>Your offers, brand rules, templates, approvals, assets, and generation history live in one operating workflow.</p>
    </section>

    <section className={styles.section} id="how-it-works">
      <Heading eyebrow="A controlled workflow" title="From Catalog to Campaign in Four Steps" body="Fast enough for daily marketing. Structured enough to trust with your brand." />
      <div className={styles.steps}>{steps.map(([n,title,body])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    <section className={`${styles.section} ${styles.capabilitySection}`}>
      <Heading eyebrow="What is included" title="Everything Needed to Produce Better Creative" body="The studio connects generation to the business information that makes an advertisement accurate and usable." />
      <div className={styles.capabilities}>{capabilities.map(({Icon,title,body})=><article key={title}><span><Icon size={24}/></span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    <section className={styles.section}>
      <Heading eyebrow="One creative system" title="Every Format Your Campaign Needs" body="Create the selected sizes together so a campaign looks intentional everywhere it appears." />
      <div className={styles.formats}>{formats.map(([ratio,size,use])=><article key={ratio}><strong>{ratio}</strong><span>{size}</span><p>{use}</p></article>)}</div>
    </section>

    <section className={styles.control}>
      <div>
        <span className={styles.eyebrow}>Built correctly from day one</span>
        <h2>Your creative stays connected to the service it represents.</h2>
        <p>Every generation can retain the source offer, the version used, its approval status, and its official catalog assignment. When an offer changes, the studio can show that an older creative needs attention.</p>
      </div>
      <Image src={COVER} alt="Tomorrow’s Tech AI Ad Creative Studio dashboard and example ads" width={1254} height={1254} sizes="(max-width: 850px) 88vw, 38vw" />
    </section>

    <section className={styles.finalCta}>
      <span className={styles.eyebrow}>Create. Launch. Grow. Repeat.</span>
      <h2>Ready to Build Your Creative Engine?</h2>
      <p>We’ll scope your catalog, brand system, templates, output formats, generation allowance, and approval workflow before pricing the build.</p>
      <Link className={styles.primary} href="/contact?service=ai-ad-creative-studio">Start With a Creative Systems Call <IconArrowRight size={17}/></Link>
    </section>
  </main>;
}

function Heading({eyebrow,title,body}:{eyebrow:string;title:string;body:string}) {
  return <div className={styles.heading}><span>{eyebrow}</span><h2>{title}</h2><p>{body}</p></div>;
}
