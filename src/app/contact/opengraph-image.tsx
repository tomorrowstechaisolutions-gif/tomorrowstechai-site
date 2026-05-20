import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "Contact · TomorrowsTech AI";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "Contact",
    title: "Let's compare notes.",
    subtitle:
      "Book a discovery call. 30 minutes, no pitch, just notes.",
  });
}
