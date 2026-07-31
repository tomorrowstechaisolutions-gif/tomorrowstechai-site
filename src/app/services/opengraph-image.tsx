import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "Services · TomorrowsTech AI";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return generateOgImage({
    eyebrow: "Services",
    title: "AI for the operations teams that actually run the work.",
    subtitle:
      "Modern websites with private operations systems behind them—CRM, dashboards, apps, workflows, and AI.",
  });
}
