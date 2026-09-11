export const AI_OPERATOR_PLANS = {
  starter: {
    id: "starter",
    name: "AI Starter",
    price: "$199",
    setup: "$299 one-time setup",
    description: "A focused foundation for capturing and following up with new leads.",
    features: ["AI chat & missed-call text back", "Lead capture", "Basic follow-up", "Professional website included"],
  },
  growth: {
    id: "growth",
    name: "AI Growth",
    price: "$399",
    setup: "$749 one-time setup",
    description: "Everything you need to automate leads, follow up, and grow your business.",
    features: ["AI chat & missed-call text back", "Lead capture & follow-up", "CRM & pipeline management", "Appointment booking", "Review requests", "Social media posting", "Professional website included"],
  },
  operator: {
    id: "operator",
    name: "AI Operator",
    price: "$699",
    setup: "$1,499 one-time setup",
    description: "Advanced automation and managed operations for a growing service business.",
    features: ["Everything in Growth", "Advanced automation", "Estimate follow-up", "Customer reminders", "AI email responses", "Expanded reporting", "Priority support"],
  },
  custom: {
    id: "custom",
    name: "Custom",
    price: "$999+",
    setup: "$2,500+ setup",
    description: "A custom operating system designed around your workflows and integrations.",
    features: ["Custom workflow design", "Custom integrations", "API connections", "Advanced reporting", "Dedicated support", "Scalable architecture"],
  },
} as const;

export type AiOperatorPlanId = keyof typeof AI_OPERATOR_PLANS;

export function getAiOperatorPlan(value?: string | null) {
  return AI_OPERATOR_PLANS[(value && value in AI_OPERATOR_PLANS ? value : "growth") as AiOperatorPlanId];
}
