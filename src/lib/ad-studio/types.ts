export const AD_FORMATS = {
  square: { label: "Square", width: 1200, height: 1200, aiSize: "1024x1024" },
  portrait: { label: "Portrait", width: 1080, height: 1350, aiSize: "1024x1536" },
  story: { label: "Story", width: 1080, height: 1920, aiSize: "1024x1536" },
  landscape: { label: "Landscape", width: 1200, height: 628, aiSize: "1536x1024" },
  website: { label: "Website", width: 1600, height: 900, aiSize: "1536x1024" },
} as const;

export type AdFormat = keyof typeof AD_FORMATS;

export type CatalogSnapshot = {
  id: string;
  kind: "service" | "package" | "custom";
  name: string;
  slug: string;
  description: string;
  price: string;
  features: string[];
  cta: string;
  route: string | null;
  updatedAt: string;
};

export type CreativeBrief = {
  headline: string;
  subheadline: string;
  features: string[];
  cta: string;
  templateKey: string;
  visualConcept?: string;
  imageStyle?: string;
  audience?: string;
  objective?: string;
};
