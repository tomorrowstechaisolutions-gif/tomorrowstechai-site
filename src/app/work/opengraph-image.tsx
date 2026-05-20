import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "Work · TomorrowsTech AI";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "Work",
    title: "Things we've built.",
    subtitle:
      "Websites, apps, brands, and promotional video. Field House Gym, Mintline Wellness, Held, and more.",
  });
}
