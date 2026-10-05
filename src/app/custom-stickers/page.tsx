import type { Metadata } from "next";
import { StickerOrderBuilder } from "@/components/stickers/StickerOrderBuilder";

export const metadata: Metadata = {
  title: "Custom Business Stickers",
  description: "Design and order premium custom business stickers. Upload artwork, request a professional design, or create a concept with AI.",
  alternates: { canonical: "/custom-stickers" },
  openGraph: {
    title: "Custom Business Stickers · Tomorrow's Tech AI",
    description: "Premium custom stickers for business branding, products, packaging, vehicles, events, and more.",
    url: "https://tomorrowstechai.com/custom-stickers",
    images: [{ url: "/custom-stickers/sticker-hero.png", width: 1680, height: 945, alt: "Custom business sticker collection" }],
  },
};

export default async function CustomStickersPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const checkout = (await searchParams).checkout;
  const initialNotice = checkout === "success"
    ? "Payment received — your sticker order is confirmed. We’ll review the artwork and begin production."
    : checkout === "cancelled"
      ? "Checkout was cancelled. Your sticker order is still saved."
      : null;
  return <StickerOrderBuilder initialNotice={initialNotice} />;
}
