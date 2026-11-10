/** What a provider adapter receives: one post, one destination account, a live token. */
export type PublishInput = {
  accountId: string;
  accountExternalId: string;
  accessToken: string;
  /** Caption with hashtags already appended. */
  caption: string;
  title: string;
  headline: string | null;
  firstComment: string | null;
  linkUrl: string | null;
  /** A URL the provider can fetch (signed for private assets). */
  mediaUrl: string | null;
  mediaType: "none" | "image" | "video" | "carousel";
  altText: string | null;
};

export type PublishResult = { externalId: string; externalUrl: string | null; raw?: Record<string, unknown> };
