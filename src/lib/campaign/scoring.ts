import { HIGH_INTENT_SERVICES } from "./config";
import type { ScoreReason } from "@/lib/supabase/types";

export type ScoreInput = {
  currentWebsite?: "yes" | "no" | null;
  timeline?: string | null;
  services?: string[];
  phone?: string | null;
  businessName?: string | null;
  businessType?: string | null;
};

/**
 * Transparent lead scoring. Every point is attributable to a named reason
 * that's shown next to the score in the admin, so it can be argued with.
 *
 * The score PRIORITIZES leads. It never rejects one, never hides one, and
 * never changes a lead's status on its own.
 */
export function scoreLead(input: ScoreInput): {
  score: number;
  reasons: ScoreReason[];
} {
  const reasons: ScoreReason[] = [];
  const services = input.services ?? [];

  if (input.currentWebsite === "no") {
    reasons.push({ label: "No website today — nothing to replace", points: 25 });
  } else if (input.currentWebsite === "yes") {
    reasons.push({ label: "Already has a website — rebuild, not a first build", points: 5 });
  }

  switch (input.timeline) {
    case "Immediately":
      reasons.push({ label: "Wants to start immediately", points: 25 });
      break;
    case "Within 30 days":
      reasons.push({ label: "Starting within 30 days", points: 16 });
      break;
    case "1-3 months":
      reasons.push({ label: "Starting in 1–3 months", points: 6 });
      break;
    case "Just researching":
      reasons.push({ label: "Just researching", points: 0 });
      break;
  }

  if (input.phone && input.phone.replace(/\D/g, "").length >= 10) {
    reasons.push({ label: "Phone number provided", points: 10 });
  }

  if (input.businessName && input.businessName.trim().length > 1) {
    reasons.push({ label: "Named an existing business", points: 5 });
  }

  const extraServices = Math.max(0, services.length - 1);
  if (extraServices > 0) {
    const points = Math.min(15, extraServices * 4);
    reasons.push({
      label: `Needs ${services.length} services, not just a website`,
      points,
    });
  }

  const highIntent = services.filter((s) => HIGH_INTENT_SERVICES.includes(s));
  if (highIntent.length > 0) {
    reasons.push({
      label: `Asked for ${highIntent.join(", ")} — upsell path`,
      points: Math.min(20, highIntent.length * 7),
    });
  }

  if (services.includes("E-commerce")) {
    reasons.push({ label: "Wants e-commerce — larger build", points: 5 });
  }

  const raw = reasons.reduce((sum, r) => sum + r.points, 0);
  return { score: Math.max(0, Math.min(100, raw)), reasons };
}

export function scoreBand(score: number): {
  label: string;
  tone: "hot" | "warm" | "cool";
} {
  if (score >= 65) return { label: "Hot", tone: "hot" };
  if (score >= 35) return { label: "Warm", tone: "warm" };
  return { label: "Cool", tone: "cool" };
}
