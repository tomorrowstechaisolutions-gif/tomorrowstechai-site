import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "About · TomorrowsTech AI";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "About",
    title: "18 years inside operations.",
    subtitle:
      "Founded by John Hockinson — now building the systems he wished existed.",
  });
}
