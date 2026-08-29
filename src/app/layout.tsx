import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PointerFX } from "@/components/fx/PointerFX";
import { SoundEffects } from "@/components/fx/UiSound";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DeferredUI } from "@/components/DeferredUI";
import { ChromeGate } from "@/components/ChromeGate";
import { MetaPixel } from "@/components/MetaPixel";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Tomorrow’s Tech AI — We build modern businesses",
    template: "%s · Tomorrow’s Tech AI",
  },
  description:
    "We build the complete digital foundation of a modern business — brand, website, ecommerce, CRM, admin dashboard, automation and AI, in one connected system.",
  keywords: [
    "business website design",
    "complete business system",
    "brand website ecommerce CRM",
    "custom admin dashboard",
    "AI command center",
    "custom business operating platform",
    "website with admin dashboard",
    "custom CRM platform",
    "business operations website",
    "Smartsheet AI",
    "Claude MCP integration",
    "construction AI",
    "field operations software",
    "AI for contractors",
    "operations automation",
    "Smartsheet consulting",
    "local AI deployment",
    "program management consulting",
  ],
  authors: [{ name: "John Hockinson" }],
  creator: "John Hockinson",
  publisher: "Tomorrow’s Tech AI",
  metadataBase: new URL("https://tomorrowstechai.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Tomorrow’s Tech AI — We build modern businesses",
    description:
      "We build the complete digital foundation of a modern business — brand, website, ecommerce, CRM, admin dashboard, automation and AI, in one connected system.",
    url: "https://tomorrowstechai.com",
    siteName: "Tomorrow’s Tech AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tomorrow’s Tech AI — We build modern businesses",
    description:
      "We build the complete digital foundation of a modern business — brand, website, ecommerce, CRM, admin dashboard, automation and AI, in one connected system.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const clientReviews = [
  {
    "@type": "Review",
    reviewRating: {
      "@type": "Rating",
      ratingValue: "5",
      bestRating: "5",
    },
    author: {
      "@type": "Person",
      name: "Christina Bills",
      jobTitle: "Owner",
      worksFor: {
        "@type": "Organization",
        name: "The Field House Gym",
      },
    },
    reviewBody:
      "John did an amazing job building what I described, he really understood The Field House, my brand, and it really showed thru his work.",
    datePublished: "2026-05-19",
  },
  {
    "@type": "Review",
    reviewRating: {
      "@type": "Rating",
      ratingValue: "5",
      bestRating: "5",
    },
    author: {
      "@type": "Person",
      name: "Dr. Marlow Griggs, MD",
      jobTitle: "Founder",
      worksFor: {
        "@type": "Organization",
        name: "Mintline Wellness",
      },
    },
    reviewBody:
      "John's attention to detail was amazing. He asked all the right questions. Our location is still in its early stages, but will be using Tomorrow’s Tech AI again.",
    datePublished: "2026-05-19",
  },
];

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Tomorrow’s Tech AI",
  alternateName: "Tomorrowstek LLC",
  url: "https://tomorrowstechai.com",
  logo: "https://tomorrowstechai.com/brand/icon-512.png",
  image: "https://tomorrowstechai.com/brand/icon-512.png",
  description:
    "We build the complete digital foundation of a modern business — brand, website, ecommerce, CRM, admin dashboard, automation and AI, in one connected system.",
  founder: {
    "@type": "Person",
    name: "John Hockinson",
    jobTitle: "Founder",
    image:
      "https://tomorrowstechai.com/about/john-hockinson-portrait.png",
    sameAs: "https://www.linkedin.com/in/johnhockinson/",
  },
  priceRange: "$$$",
  address: {
    "@type": "PostalAddress",
    addressRegion: "TX",
    addressCountry: "US",
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "Customer Service",
    email: "john@tomorrowstechai.com",
    url: "https://tomorrowstechai.com/contact",
    availableLanguage: "English",
  },
  areaServed: {
    "@type": "Country",
    name: "United States",
  },
  serviceType: [
    "Custom Business Operating Platforms",
    "Custom CRM and Business Admin Systems",
    "AI Command Centers",
    "Smartsheet Consulting",
    "Custom AI Workflows",
    "Custom AI App Development",
    "Local AI Deployment",
    "Operations Automation",
    "Program Management Consulting",
    "Website Design & Build",
    "Video Production",
    "Contractor Lead Automation",
  ],
  sameAs: [
    "https://www.linkedin.com/in/johnhockinson/",
    "https://www.youtube.com/@TomorrowsTechAISolution",
    "https://myheldapp.com",
    "https://tomorrowstek.com",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5.0",
    reviewCount: clientReviews.length.toString(),
    bestRating: "5",
    worstRating: "1",
  },
  review: clientReviews,
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Tomorrow’s Tech AI",
  url: "https://tomorrowstechai.com",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://tomorrowstechai.com/blog?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* GA Consent Mode v2 default: deny everything until user opts in via CookieConsent banner */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('consent', 'default', {
                'analytics_storage': 'denied',
                'ad_storage': 'denied',
                'ad_user_data': 'denied',
                'ad_personalization': 'denied',
                'wait_for_update': 500
              });
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {/* Decorative interaction layer — marketing pages only. It has no
            job on the paid landing page or in the admin, and skipping it
            keeps both leaner. */}
        <ChromeGate>
          <PointerFX />
          <SoundEffects />
        </ChromeGate>
        <ChromeGate>
          <Header />
        </ChromeGate>
        <main className="flex-1">{children}</main>
        <ChromeGate>
          <Footer />
        </ChromeGate>
        <DeferredUI />
        <MetaPixel />
        {/* SMS opt-in chat widget required for A2P 10DLC consent collection.
            Suppressed on /business-launch (its form collects SMS consent
            itself, and a second chat bubble competes with the single CTA) and
            in /admin. It still loads on every other page of the site. */}
        <ChromeGate>
          <Script
            src="https://widgets.leadconnectorhq.com/loader.js"
            data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
            data-widget-id="6a68bd33b0ee6ed3ac662935"
            data-source="WEB_USER"
            strategy="afterInteractive"
          />
        </ChromeGate>
        <SpeedInsights />
      </body>
      <GoogleAnalytics gaId="G-1N0MZPDTF5" />
    </html>
  );
}
