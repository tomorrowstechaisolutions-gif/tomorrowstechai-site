import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "Blog · Tomorrow’s Tech AI";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "Field notes",
    title: "Operations, AI, and the systems we wish existed.",
    subtitle:
      "Written by an operator. For operators. No buzzwords.",
  });
}
