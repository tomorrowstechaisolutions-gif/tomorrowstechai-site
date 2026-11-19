import { buildReviewRequestEmail, DEFAULT_REVIEW_URL, REVIEW_SLOTS } from "@/lib/reviews/email-content";
import type { SystemEmailDef } from "../types";

export const REVIEW_EMAILS: SystemEmailDef[] = [
  {
    key: "reviews.request", module: "Reviews", name: "Ask for a Google review", audience: "client",
    trigger: "You press Ask for a review on a client's page.",
    slots: REVIEW_SLOTS,
    vars: [
      { name: "greeting", label: "\"Hi Dana,\" (or \"Hi,\" with no name)", sample: "Hi Dana," },
      { name: "first_name", label: "Client's first name", sample: "Dana" },
      { name: "business_name", label: "Client business", sample: "Hill Country Roofing" },
    ],
    preview: (copy) => buildReviewRequestEmail({ name: "Dana Ortiz", businessName: "Hill Country Roofing", url: DEFAULT_REVIEW_URL }, copy),
  },
];
