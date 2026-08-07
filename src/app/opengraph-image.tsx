import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "Tomorrow’s Tech AI — We build modern businesses";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "We build. You grow.",
    title: "We build modern businesses.",
    subtitle:
      "Brand, website, commerce, operations, software and AI — one company building it together.",
  });
}
