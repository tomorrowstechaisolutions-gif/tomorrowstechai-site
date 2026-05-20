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

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "TomorrowsTech AI",
  alternateName: "Tomorrowstek LLC",
  url: "https://tomorrowstechai.com",
  logo: "https://tomorrowstechai.com/logo.png",
  description:
    "AI command centers, Smartsheet workflows, and custom AI systems for construction, contractors, and field operations businesses.",
  founder: {
    "@type": "Person",
    name: "John Hockinson",
  },
  sameAs: ["https://www.linkedin.com/in/johnhockinson/"],
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
