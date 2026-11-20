import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptSecret, encryptSecret, openSecret, sealSecret } from "../secrets";

const KEY = "0123456789abcdef0123456789abcdef-test-key";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  if (saved === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
  else process.env.INTEGRATION_ENCRYPTION_KEY = saved;
  vi.restoreAllMocks();
});

describe("sealSecret / openSecret", () => {
  it("encrypts with a key and reads back the same value", () => {
    const sealed = sealSecret("ya29.token-value", "Google");
    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain("ya29.token-value");
    expect(openSecret(sealed, "Google")).toBe("ya29.token-value");
  });

  it("reads a value stored before encryption as it is", () => {
    expect(openSecret("plain-legacy-token")).toBe("plain-legacy-token");
  });

  it("does not encrypt twice", () => {
    const once = sealSecret("abc");
    expect(sealSecret(once)).toBe(once);
  });

  it("passes empty values through as null", () => {
    expect(sealSecret(null)).toBeNull();
    expect(sealSecret("")).toBeNull();
    expect(openSecret(null)).toBeNull();
    expect(openSecret(undefined)).toBeNull();
  });

  it("stores the value as it is when no key is configured, rather than failing", () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    expect(sealSecret("abc")).toBe("abc");
  });

  it("returns null, not an exception, when the key has changed", () => {
    const sealed = sealSecret("abc");
    process.env.INTEGRATION_ENCRYPTION_KEY = "a-completely-different-key-of-enough-length";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(openSecret(sealed, "Google")).toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it("stays compatible with the strict helpers", () => {
    expect(decryptSecret(sealSecret("abc"))).toBe("abc");
    expect(openSecret(encryptSecret("abc"))).toBe("abc");
  });
});
