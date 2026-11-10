import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption at rest for OAuth tokens.
 *
 * Same format and key as src/lib/zoom/crypto.ts (enc:v1:<iv>:<tag>:<body>,
 * key = sha256(INTEGRATION_ENCRYPTION_KEY)), so one key protects every
 * integration. The `label` only shapes the error message, so a failure says
 * which connection needs to be redone.
 */

const PREFIX = "enc:v1:";

function key(label: string): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      `INTEGRATION_ENCRYPTION_KEY is not set (or is shorter than 32 characters). ${label} tokens are never stored unencrypted.`
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptionConfigured(): boolean {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  return Boolean(raw && raw.length >= 32);
}

export function encryptSecret(plain: string, label = "Integration"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(label), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${body.toString("base64url")}`;
}

export function decryptSecret(stored: string | null, label = "Integration"): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) throw new Error(`Stored ${label} credential is not encrypted. Reconnect ${label}.`);
  const [ivPart, tagPart, bodyPart] = stored.slice(PREFIX.length).split(":");
  if (!ivPart || !tagPart || !bodyPart) throw new Error(`Stored ${label} credential is malformed. Reconnect ${label}.`);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(label), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(bodyPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(`Stored ${label} credential could not be decrypted — the encryption key changed. Reconnect ${label}.`);
  }
}
