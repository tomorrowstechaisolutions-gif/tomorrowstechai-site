import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

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
  metadataBase: new URL("https://tomorrowstechai.com"),
  openGraph: {
    title: "TomorrowsTech AI — AI for construction & field ops",
    description:
      "AI command centers and operational systems for construction, contractors, and field operations.",
    url: "https://tomorrowstechai.com",
    siteName: "TomorrowsTech AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TomorrowsTech AI — AI for construction & field ops",
    description:
      "AI command centers and operational systems for real businesses.",
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
        <div className="classification-bar">
          TomorrowsTech AI &nbsp;//&nbsp; Operations · Live
        </div>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
