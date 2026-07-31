import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "Work · TomorrowsTech AI";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "Work",
    title: "Work built to run the business.",
    subtitle:
      "Business operating platforms, command centers, Job Catcher, and client systems built around real operations.",
  });
}
