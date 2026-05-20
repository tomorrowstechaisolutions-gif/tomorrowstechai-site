import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "FAQ · TomorrowsTech AI";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "Frequently asked",
    title: "Questions, answered.",
    subtitle:
      "Timelines, pricing, how we work, and what makes a command center different.",
  });
}
