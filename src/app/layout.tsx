import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DeferredUI } from "@/components/DeferredUI";
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
    default: "TomorrowsTech AI — AI for construction & field ops",
    template: "%s · TomorrowsTech AI",
  },
  description:
    "AI command centers, Smartsheet workflows, and custom AI systems for construction, contractors, and field operations businesses. Operations first, AI second.",
  keywords: [
    "AI command center",
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
  publisher: "TomorrowsTech AI",
  metadataBase: new URL("https://tomorrowstechai.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TomorrowsTech AI — AI for construction & field ops",
    description:
      "AI command centers and operational systems for construction, contractors, and field operations.",
    url: "https://tomorrowstechai.com",
    siteName: "TomorrowsTech AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "TomorrowsTech AI — AI for construction & field ops",
    description:
      "AI command centers and operational systems for real businesses.",
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
      "John's attention to detail was amazing. He asked all the right questions. Our location is still in its early stages, but will be using TomorrowsTech AI again.",
    datePublished: "2026-05-19",
  },
];

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "TomorrowsTech AI",
  alternateName: "Tomorrowstek LLC",
  url: "https://tomorrowstechai.com",
  logo: "https://tomorrowstechai.com/logo.png",
  image: "https://tomorrowstechai.com/logo.png",
  description:
    "AI command centers, Smartsheet workflows, custom websites, video production, and AI systems for operations-heavy businesses — construction, contractors, field operations, telecom, and service companies.",
  founder: {
    "@type": "Person",
    name: "John Hockinson",
    jobTitle: "Founder",
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
    "AI Command Centers",
    "Smartsheet Consulting",
    "Custom AI Workflows",
    "Custom AI App Development",
    "Local AI Deployment",
    "Operations Automation",
    "Program Management Consulting",
    "Website Design & Build",
    "Video Production",
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
  name: "TomorrowsTech AI",
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
        <div className="classification-bar">
          TomorrowsTech AI &nbsp;//&nbsp; Operations · Live
        </div>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <DeferredUI />
        <SpeedInsights />
      </body>
      <GoogleAnalytics gaId="G-1N0MZPDTF5" />
    </html>
  );
}
