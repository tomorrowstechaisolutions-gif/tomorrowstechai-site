import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { IconAiChip, IconArrowRight, IconBadgeCheck, IconBot, IconBrain, IconCart, IconChart, IconCpu, IconDashboard, IconMegaphone, IconMonitor, IconNetwork, IconPhoneCall, IconPlay, IconRocket, IconShield, IconSparkle, IconUsers } from "@/components/Icons";
import styles from "./services.module.css";
import { loadPublicPackages } from "@/lib/catalog/public";
import { catalogPrice } from "@/lib/catalog/types";

export const metadata: Metadata = {
  title: { absolute: "Business Technology Services | Tomorrow’s Tech AI" },
  description: "Explore Tomorrow’s Tech AI services including AI business automation, business operating platforms, command centers, workflow automation, professional websites, e-commerce, and custom business systems.",
  alternates: { canonical: "/services" },
  openGraph: { title: "Business Technology Services | Tomorrow’s Tech AI", description: "Websites, AI automation, command centers and custom operating platforms built around your business.", url: "https://tomorrowstechai.com/services", type: "website" },
};
export const dynamic = "force-dynamic";

const coreServices = [
  { id: "ai-ad-creative-studio", Icon: IconSparkle, title: "AI Ad Creative Studio", description: "Create polished, on-brand image ads from your real services, packages, and offers.", features: ["Catalog-backed offer details", "Five production formats", "Reusable brand templates", "Review and approval workflow", "PNG, WebP, and JPEG exports"], href: "/services/ai-ad-creative-studio", image: "/ai-solutions/ai-ad-creative-studio-cover.png" },
  { id: "ai-business-operator", Icon: IconBot, title: "AI Business Operator", description: "Hire an AI team that works 24/7 to capture leads, follow up, book appointments, and grow your business.", features: ["AI chat & voice", "Lead capture & follow-up", "CRM & pipeline management", "Appointment booking", "Reviews, reminders & more"], href: "/services/ai-business-operator", image: "/industries/contractors-home-services.webp" },
  { id: "business-platforms", Icon: IconDashboard, title: "Business Operating Platforms", description: "All-in-one platforms to run your entire business from one place.", features: ["CRM & client management", "Scheduling & dispatch", "Invoicing & payments", "Inventory & job management", "Team & employee tools"], href: "/services/run-your-business", image: "/work/poolbusinessai.webp" },
  { id: "command-centers", Icon: IconMonitor, title: "Command Centers", description: "Real-time visibility and control across your entire business.", features: ["Live dashboards", "Reports & analytics", "Multi-location support", "Team activity tracking", "Custom integrations"], href: "#platform-preview", image: "/hero-building.webp" },
  { id: "grow-your-audience", Icon: IconMegaphone, title: "Grow Your Audience", description: "Managed social media, content, campaigns and lead generation — run from one marketing platform.", features: ["Social media management", "Professional content & graphics", "Targeted campaigns", "Lead generation & reputation", "Analytics and AI content tools"], href: "/services/grow-your-audience", image: "/industries/retail-ecommerce.webp" },
  { id: "workflow-automation", Icon: IconNetwork, title: "Workflow Automation", description: "Eliminate manual work and let your business run on autopilot.", features: ["Custom automations", "Email & SMS workflows", "AI integrations", "Third-party connections", "Save time and reduce errors"], href: "/contact", image: "/work/aegisfleet.webp" },
];

const problems = [
  { Icon: IconUsers, label: "I’m losing leads", href: "/services/ai-business-operator" }, { Icon: IconMonitor, label: "I need a website", href: "#website-packages" }, { Icon: IconCpu, label: "I need automation", href: "#workflow-automation" }, { Icon: IconBrain, label: "I need AI integrated", href: "/services/ai-business-operator" }, { Icon: IconChart, label: "I need a command center", href: "#command-centers" }, { Icon: IconDashboard, label: "I can’t see what’s happening", href: "#platform-preview" },
];

const industries = [
  { name: "Pool Companies", image: "/work/clearwater.webp", href: "/work" }, { name: "HVAC", image: "/industries/contractors-home-services.webp", href: "/contact", position: "45% 55%" }, { name: "Roofers", image: "/industries/contractors-home-services.webp", href: "/contact", position: "78% 40%" }, { name: "Tower Companies", image: "/industries/professional-services.webp", href: "/contact" }, { name: "Automotive", image: "/work/tomorrowstek.webp", href: "/work" }, { name: "Contractors", image: "/industries/contractors-home-services.webp", href: "/contact" }, { name: "Landscapers", image: "/industries/real-estate-property.webp", href: "/contact" }, { name: "Professional Services", image: "/industries/professional-services.webp", href: "/contact" },
];

const previews = [
  { label: "CRM & Leads", image: "/work/poolbusinessai.webp", position: "65% 52%" }, { label: "Scheduling & Calendar", image: "/work/held.webp", position: "50% 35%" }, { label: "Reports & Analytics", image: "/work/aegisfleet.webp", position: "78% 20%" }, { label: "Automation Workflows", image: "/work/clearwater.webp", position: "69% 45%" },
];

export default async function ServicesPage() {
  const canonicalWebsites=await loadPublicPackages("websites");
  const websiteIcons=[IconRocket,IconMonitor,IconSparkle,IconCart];
  const displayWebsiteTiers=canonicalWebsites.map((pkg,index)=>({Icon:websiteIcons[index%websiteIcons.length],name:pkg.name,tagline:pkg.subtitle||pkg.shortDescription,price:catalogPrice(pkg),href:pkg.ctaRoute,featured:pkg.mostPopular||pkg.featured,includes:pkg.features.filter(x=>x.included).map(x=>x.label),cta:pkg.ctaLabel}));
  return <div className={styles.page}>
    <section className={styles.hero}><div className={styles.heroGrid}>
      <div className={styles.heroCopy}><Eyebrow>Our Services</Eyebrow><h1>Systems That<br/><span>Run Your Business.</span></h1><p className={styles.lead}>Websites. AI Systems. Automation. Business Platforms.</p><p className={styles.sublead}>From high-converting websites to intelligent automation and complete operating systems — we build the technology behind your success.</p><div className={styles.actions}><Link href="#core-services" className={styles.primary}>Explore Our Services <IconArrowRight size={17}/></Link><Link href="https://www.youtube.com/@TomorrowsTechAISolution" className={styles.secondary} target="_blank" rel="noreferrer"><IconPlay size={18}/> Watch Video</Link></div><div className={styles.benefits}><span><IconAiChip size={18}/>More Leads</span><span><IconChart size={18}/>More Revenue</span><span><IconUsers size={18}/>A Stronger Business</span></div></div>
      <div className={styles.heroVisual} aria-label="Tomorrow’s Tech AI platform shown on a laptop"><div className={styles.laptopTop}><span/><span/><span/></div><div className={styles.screen}><Image src="/work/poolbusinessai.webp" alt="Pool Business AI operating platform interface" fill priority sizes="(max-width: 900px) 100vw, 52vw"/><div className={styles.screenShade}/><div className={styles.screenLabel}><IconDashboard size={17}/> Connected business platform</div></div><div className={styles.laptopBase}/></div>
    </div></section>

    <section id="core-services" className={styles.section}><SectionHeading eyebrow="Core Service Solutions" title="Complete Solutions for Real Businesses" body="From getting you online to full business automation — we provide everything you need to operate, grow, and scale."/><div className={styles.coreGrid}>{coreServices.map(({Icon,...service},index)=><article id={service.id} className={`${styles.coreCard} ${index===0?styles.featuredService:""}`} key={service.title}><div className={styles.cardImage}><Image src={service.image} alt="" fill sizes="(max-width: 700px) 100vw, 25vw"/><div/></div><div className={styles.coreBody}><span className={styles.iconBox}><Icon size={23}/></span><h3>{service.title}</h3><p>{service.description}</p><ul>{service.features.map(feature=><li key={feature}><IconBadgeCheck size={14}/>{feature}</li>)}</ul><Link href={service.href}>Learn More <IconArrowRight size={15}/></Link></div></article>)}</div></section>

    <section id="website-packages" className={`${styles.section} ${styles.pricingSection}`}><SectionHeading eyebrow="Website Packages" title="Choose the Right Website Package for Your Business" body="Professional, modern, and built to grow your business. Hosting is selected separately where needed."/><div className={styles.priceGrid}>{displayWebsiteTiers.map(({Icon,...tier})=><article className={`${styles.priceCard} ${tier.featured?styles.popularCard:""}`} key={tier.name}>{tier.featured&&<span className={styles.popular}>Most Popular</span>}<div className={styles.priceTitle}><span className={styles.iconBox}><Icon size={21}/></span><div><h3>{tier.name}</h3><p>{tier.tagline}</p></div></div><div className={styles.price}><strong>{tier.price}</strong><span>{tier.price.includes("/")?"":"one time"}</span></div><p className={styles.hosting}>Hosting is available as a separate managed package.</p><ul>{tier.includes.map(item=><li key={item}><IconBadgeCheck size={14}/>{item}</li>)}</ul><Link href={tier.href} className={styles.primary}>{tier.cta} <IconArrowRight size={15}/></Link></article>)}</div></section>

    <section className={`${styles.section} ${styles.problemSection}`}><SectionHeading eyebrow="What Are You Looking to Solve?" body="Click a challenge to see how we can help."/><div className={styles.problemGrid}>{problems.map(({Icon,label,href})=><Link className={styles.problemCard} href={href} key={label}><span className={styles.iconBox}><Icon size={21}/></span><b>{label}</b><IconArrowRight size={16}/></Link>)}</div></section>

    <section className={styles.section}><SectionHeading eyebrow="Industries We Serve" title="Built for Service Businesses Like Yours"/><div className={styles.industryGrid}>{industries.map(industry=><Link href={industry.href} className={styles.industryCard} key={industry.name}><Image src={industry.image} alt="" fill sizes="(max-width: 700px) 50vw, 15vw" style={{objectPosition:industry.position}}/><div/><b>{industry.name}</b><IconArrowRight size={15}/></Link>)}</div></section>

    <section id="platform-preview" className={`${styles.section} ${styles.previewSection}`}><div className={styles.previewIntro}><div><Eyebrow>Real Tools. Real Results.</Eyebrow><h2>Take a Look Inside</h2><p>Our platforms, dashboards, and automation tools give you complete control of your business.</p></div><Link href="/work" className={styles.primary}>View Platform Screenshots <IconArrowRight size={16}/></Link></div><div className={styles.previewGrid}>{previews.map(preview=><Link href="/work" className={styles.previewCard} key={preview.label}><Image src={preview.image} alt={`${preview.label} project preview`} fill sizes="(max-width: 700px) 100vw, 25vw" style={{objectPosition:preview.position}}/><div/><span>Project interface</span><b>{preview.label}</b><IconArrowRight size={16}/></Link>)}</div></section>

    <section className={styles.finalSection}><div className={styles.finalCopy}><Eyebrow>Build Smarter</Eyebrow><h2>Ready to Build a Smarter Business?</h2><p>Let’s talk about what you need. We’ll help you choose the right solution and get you up and running quickly.</p><div className={styles.actions}><Link href="/get-started?plan=custom" className={styles.primary}>Get Started Now <IconArrowRight size={16}/></Link><Link href="/contact" className={styles.secondary}><IconPhoneCall size={17}/>Talk to an Expert</Link></div></div><div className={styles.trustStrip}>{[{Icon:IconAiChip,label:"Fast Response"},{Icon:IconShield,label:"No Obligation"},{Icon:IconUsers,label:"Real Human Support"},{Icon:IconChart,label:"Built for Growth"}].map(({Icon,label})=><span key={label}><Icon size={22}/><b>{label}</b></span>)}</div></section>
  </div>;
}

function Eyebrow({children}:{children:React.ReactNode}){return <div className={styles.eyebrow}>{children}</div>}
function SectionHeading({eyebrow,title,body}:{eyebrow:string;title?:string;body?:string}){return <div className={styles.sectionHeading}><Eyebrow>{eyebrow}</Eyebrow>{title&&<h2>{title}</h2>}{body&&<p>{body}</p>}</div>}
