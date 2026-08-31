/**
 * What each channel actually needs, in one place.
 *
 * The generator is told the real constraint per platform rather than being
 * left to guess — an Instagram caption and a LinkedIn post are not the same
 * text with a different label, and a Reel script is not a post at all.
 * `truncatesAt` is where the platform hides the rest behind "more", which is
 * the number that decides whether a hook works.
 */

export type ContentType =
  | "social_post" | "reel_script" | "short_script" | "blog" | "email"
  | "ad_copy" | "landing_copy" | "google_business" | "hashtags"
  | "image_concept" | "video_concept" | "other";

export type Platform =
  | "facebook" | "instagram" | "linkedin" | "tiktok" | "youtube"
  | "google_business" | "blog" | "email";

export type FormatSpec = {
  key: string;
  label: string;
  contentType: ContentType;
  platform: Platform | null;
  /** What the model is told about length and shape. */
  guidance: string;
  truncatesAt?: number;
  hashtags: boolean;
};

export const FORMATS: FormatSpec[] = [
  {
    key: "facebook_post",
    label: "Facebook post",
    contentType: "social_post",
    platform: "facebook",
    guidance:
      "80-160 words. The first 125 characters carry the hook on their own — everything after is hidden behind \"See more\". Conversational, one idea, one clear next step.",
    truncatesAt: 125,
    hashtags: false,
  },
  {
    key: "instagram_caption",
    label: "Instagram caption",
    contentType: "social_post",
    platform: "instagram",
    guidance:
      "60-120 words. First line is the hook and must work alone. Line breaks between thoughts. Ends with a question or a next step.",
    truncatesAt: 125,
    hashtags: true,
  },
  {
    key: "linkedin_post",
    label: "LinkedIn post",
    contentType: "social_post",
    platform: "linkedin",
    guidance:
      "120-220 words. Opens with a specific observation, not a platitude. Short paragraphs, one line each. Professional but not corporate. No 'thoughts?' sign-off.",
    truncatesAt: 210,
    hashtags: true,
  },
  {
    key: "reel_script",
    label: "Reel / TikTok script",
    contentType: "reel_script",
    platform: "instagram",
    guidance:
      "20-40 seconds spoken. Write it as timed beats: a 3-second hook, 3-4 points, a close. Mark each beat with its on-screen text. Spoken register, contractions, short sentences.",
    hashtags: true,
  },
  {
    key: "youtube_short",
    label: "YouTube Short script",
    contentType: "short_script",
    platform: "youtube",
    guidance:
      "Under 60 seconds spoken. Hook in the first 2 seconds. One idea only. End on the payoff, not on a request to subscribe.",
    hashtags: false,
  },
  {
    key: "google_business",
    label: "Google Business post",
    contentType: "google_business",
    platform: "google_business",
    guidance:
      "Under 1,500 characters, ideally 80-120 words. Local and concrete — name the service and the area served. One call to action.",
    truncatesAt: 1500,
    hashtags: false,
  },
  {
    key: "email",
    label: "Email",
    contentType: "email",
    platform: "email",
    guidance:
      "Subject line under 50 characters, then 120-200 words of body. Written to one person, not a list. One ask.",
    hashtags: false,
  },
  {
    key: "blog",
    label: "Blog post",
    contentType: "blog",
    platform: "blog",
    guidance:
      "600-900 words with a title and subheadings. Answers a real question someone would type into a search box. Concrete examples over adjectives.",
    hashtags: false,
  },
  {
    key: "ad_copy",
    label: "Ad copy",
    contentType: "ad_copy",
    platform: "facebook",
    guidance:
      "Primary text 400-700 characters with the hook in the first 125. Headline 40 characters or fewer. One clear offer.",
    truncatesAt: 125,
    hashtags: false,
  },
];

export const FORMAT_BY_KEY: Record<string, FormatSpec> = Object.fromEntries(
  FORMATS.map((f) => [f.key, f])
);

export const GOALS = [
  { key: "awareness", label: "Awareness" },
  { key: "lead_generation", label: "Lead generation" },
  { key: "sales", label: "Sales" },
  { key: "education", label: "Education" },
  { key: "engagement", label: "Engagement" },
  { key: "retargeting", label: "Retargeting" },
  { key: "announcement", label: "Announcement" },
  { key: "seo", label: "SEO" },
  { key: "client_communication", label: "Client communication" },
];

export const TONES = [
  "Professional", "Educational", "Direct", "Promotional",
  "Technical", "Friendly", "Bold",
];

export const AUDIENCES = [
  "Small business owners",
  "Contractors",
  "Construction",
  "Roofing",
  "HVAC and plumbing",
  "Pool service",
  "Landscaping",
  "Professional services",
  "Ecommerce",
  "General business",
];

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  generating: "Generating",
  needs_review: "Needs review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  archived: "Archived",
};

export const TYPE_LABELS: Record<ContentType, string> = {
  social_post: "Social post",
  reel_script: "Reel script",
  short_script: "Short script",
  blog: "Blog",
  email: "Email",
  ad_copy: "Ad copy",
  landing_copy: "Landing copy",
  google_business: "Google Business",
  hashtags: "Hashtags",
  image_concept: "Image concept",
  video_concept: "Video concept",
  other: "Other",
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_business: "Google Business",
  blog: "Blog",
  email: "Email",
};
