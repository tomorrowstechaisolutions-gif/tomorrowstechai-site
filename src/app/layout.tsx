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
    default: "TomorrowsTech AI — Intelligent systems for modern business",
    template: "%s · TomorrowsTech AI",
  },
  description:
    "Command Centers, Workflow Packages, AI Business Units, and Private On-Site AI Infrastructure for operations-heavy businesses. We design custom AI systems that bring operations, automation, and data into one clear command environment.",
  metadataBase: new URL("https://tomorrowstechai.com"),
  openGraph: {
    title: "TomorrowsTech AI — Intelligent systems for modern business",
    description:
      "Command Centers, Workflow Packages, AI Business Units, and Private On-Site AI Infrastructure for operations-heavy businesses.",
    url: "https://tomorrowstechai.com",
    siteName: "TomorrowsTech AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TomorrowsTech AI — Intelligent systems for modern business",
    description:
      "Custom AI systems that bring operations, automation, and data into one clear command environment.",
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
