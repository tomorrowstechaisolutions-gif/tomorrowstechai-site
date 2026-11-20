import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cronAuthorized } from "../guard";

const SECRET = "s3cret-value-for-tests";

const req = (authorization?: string) =>
  new Request("https://example.test/api/cron/x", {
    headers: authorization === undefined ? {} : { authorization },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cronAuthorized", () => {
  it("accepts the right bearer token", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(cronAuthorized(req(`Bearer ${SECRET}`))).toBe(true);
  });

  it("rejects a wrong token, including one of the same length", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(cronAuthorized(req("Bearer nope"))).toBe(false);
    expect(cronAuthorized(req(`Bearer ${"x".repeat(SECRET.length)}`))).toBe(false);
    expect(cronAuthorized(req(`Bearer ${SECRET}x`))).toBe(false);
  });

  it("rejects a missing or empty header", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(cronAuthorized(req())).toBe(false);
    expect(cronAuthorized(req(""))).toBe(false);
    expect(cronAuthorized(req("Bearer "))).toBe(false);
  });

  it("requires the exact Bearer prefix", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(cronAuthorized(req(SECRET))).toBe(false);
    expect(cronAuthorized(req(`bearer ${SECRET}`))).toBe(false);
    expect(cronAuthorized(req(`Bearer  ${SECRET}`))).toBe(false);
    expect(cronAuthorized(req(`Basic ${SECRET}`))).toBe(false);
  });

  it("fails closed when CRON_SECRET is unset or empty", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(cronAuthorized(req("Bearer "))).toBe(false);
    expect(cronAuthorized(req("Bearer anything"))).toBe(false);
    expect(cronAuthorized(req())).toBe(false);

    vi.unstubAllEnvs();
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(req("Bearer undefined"))).toBe(false);
  });

  it("says no, rather than throwing, when character and byte lengths differ", () => {
    // Same number of characters as the token, more bytes.
    vi.stubEnv("CRON_SECRET", "é".repeat(4));
    expect(cronAuthorized(req("Bearer abcd"))).toBe(false);
  });
});
