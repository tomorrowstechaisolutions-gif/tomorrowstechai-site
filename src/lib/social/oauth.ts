import "server-only";
import { encryptionConfigured } from "@/lib/security/secrets";
import { linkedinAuthUrl, linkedinConfigured } from "./providers/linkedin";
import { metaAuthUrl, metaConfigured } from "./providers/meta";
import type { SocialProvider } from "./accounts";

export const SOCIAL_PROVIDERS: SocialProvider[] = ["meta", "linkedin"];

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as string[]).includes(value);
}

/** Must match the redirect URL registered in the Meta / LinkedIn developer app exactly. */
export function socialRedirectUri(provider: SocialProvider, origin: string): string {
  const explicit = provider === "meta" ? process.env.META_REDIRECT_URI : process.env.LINKEDIN_REDIRECT_URI;
  if (explicit) return explicit;
  // Use the host this request was actually served on (www in production), not
  // NEXT_PUBLIC_SITE_URL: that is the apex, which 308s to www and would not
  // match the URL registered with the provider. Start and callback both run on
  // the same host, so the value sent in both legs of the exchange is identical.
  return `${origin.replace(/\/+$/, "")}/api/social/oauth/${provider}/callback`;
}

export function providerConfigured(provider: SocialProvider): boolean {
  return provider === "meta" ? metaConfigured() : linkedinConfigured();
}

export function providerAuthUrl(provider: SocialProvider, state: string, redirectUri: string): string {
  return provider === "meta" ? metaAuthUrl(state, redirectUri) : linkedinAuthUrl(state, redirectUri);
}

/** Public-safe setup status for the Connect dialog. Never includes a value. */
export type SocialProviderStatus = { provider: SocialProvider; configured: boolean; missing: string[] };

export function socialProviderStatus(): SocialProviderStatus[] {
  const need = (keys: string[]) => keys.filter((key) => !process.env[key]);
  const encryption = encryptionConfigured() ? [] : ["INTEGRATION_ENCRYPTION_KEY"];
  return [
    { provider: "meta", configured: metaConfigured() && !encryption.length, missing: [...need(["META_APP_ID", "META_APP_SECRET"]), ...encryption] },
    { provider: "linkedin", configured: linkedinConfigured() && !encryption.length, missing: [...need(["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]), ...encryption] },
  ];
}
