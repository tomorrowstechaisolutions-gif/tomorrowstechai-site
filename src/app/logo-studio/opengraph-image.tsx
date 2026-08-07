import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "Tomorrow’s Tech Logo Studio — AI logo maker, professionally refined";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "Logo Studio",
    title: "AI logo maker. Professionally unique.",
    subtitle:
      "Create a logo in minutes. Then let our designers perfect it for your brand.",
  });
}
