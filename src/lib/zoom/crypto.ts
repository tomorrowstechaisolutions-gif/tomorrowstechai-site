import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption at rest for OAuth tokens.
 *
 * integration_credentials is already unreadable to every session (RLS on, no
 * policy). This is the second wall: a database dump, a backup, or a stray
 * service-role query does not hand anyone a working Zoom token without also
 * having the server's key.
 *
 * AES-256-GCM with a random 96-bit IV per value, stored as
 *   enc:v1:<iv b64url>:<tag b64url>:<ciphertext b64url>
 *
 * The key comes from INTEGRATION_ENCRYPTION_KEY — any long random string; it
 * is hashed to 32 bytes so a 64-char hex key and a passphrase both work.
 * Rotating the key means reconnecting Zoom, which is a ten-second job.
 */

const PREFIX = "enc:v1:";

function key(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set (or is shorter than 32 characters). "
      + "Zoom tokens are never stored unencrypted."
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptionConfigured(): boolean {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  return Boolean(raw && raw.length >= 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${body.toString("base64url")}`;
}

export function decryptSecret(stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) {
    // Refuse plaintext rather than silently accept it: a Zoom token that is
    // not encrypted was not written by this module.
    throw new Error("Stored Zoom credential is not encrypted. Reconnect Zoom.");
  }
  const [ivPart, tagPart, bodyPart] = stored.slice(PREFIX.length).split(":");
  if (!ivPart || !tagPart || !bodyPart) throw new Error("Stored Zoom credential is malformed. Reconnect Zoom.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(bodyPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Stored Zoom credential could not be decrypted — the encryption key changed. Reconnect Zoom."
    );
  }
}
