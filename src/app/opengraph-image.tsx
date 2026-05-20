import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "TomorrowsTech AI — AI for construction & field ops";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "AI for construction · field ops · contractors",
    title: "We build the systems your PMs wish existed.",
    subtitle:
      "AI command centers, Smartsheet workflows, websites, and custom AI for operations-heavy businesses.",
  });
}
