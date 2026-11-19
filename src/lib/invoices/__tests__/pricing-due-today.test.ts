import { describe, expect, it } from "vitest";
import {
  dueTodayCents,
  invoiceSettled,
  recurringStartUnix,
  recurringStartsLater,
} from "../pricing";

// 18 Nov 2026, mid-morning in Chicago.
const NOW = new Date("2026-11-18T16:00:00Z");

const base = {
  status: "sent",
  total_cents: 0,
  amount_paid_cents: 0,
  recurring_cents: 4900,
  recurring_starts_on: "2026-11-17" as string | null,
};

describe("a monthly-only invoice", () => {
  it("charges the first month today when the start date has arrived", () => {
    expect(dueTodayCents(base, NOW)).toBe(4900);
    expect(invoiceSettled(base)).toBe(false);
  });

  it("charges the first month today when there is no start date", () => {
    expect(dueTodayCents({ ...base, recurring_starts_on: null }, NOW)).toBe(4900);
  });

  it("charges nothing today when the start date is ahead", () => {
    const later = { ...base, recurring_starts_on: "2026-12-01" };
    expect(recurringStartsLater(later, NOW)).toBe(true);
    expect(dueTodayCents(later, NOW)).toBe(0);
    expect(invoiceSettled(later)).toBe(false);
  });

  it("is settled once its subscription has taken money or been stamped paid", () => {
    expect(invoiceSettled({ ...base, status: "partial", amount_paid_cents: 4900 })).toBe(true);
    expect(invoiceSettled({ ...base, status: "paid" })).toBe(true);
    expect(dueTodayCents({ ...base, status: "paid" }, NOW)).toBe(0);
  });
});

describe("a one-time line plus monthly from a later date", () => {
  const inv = { ...base, total_cents: 4900, recurring_starts_on: "2026-12-01" };

  it("charges only the one-time balance today", () => {
    expect(dueTodayCents(inv, NOW)).toBe(4900);
  });

  it("adds the first month once the start date has passed unpaid", () => {
    expect(dueTodayCents(inv, new Date("2026-12-03T16:00:00Z"))).toBe(9800);
  });

  it("starts the monthly charge at noon UTC on the start date", () => {
    expect(recurringStartUnix(inv, NOW)).toBe(Date.parse("2026-12-01T12:00:00Z") / 1000);
    expect(recurringStartUnix(base, NOW)).toBeNull();
  });

  it("is settled when paid", () => {
    expect(invoiceSettled({ ...inv, status: "paid", amount_paid_cents: 4900 })).toBe(true);
  });
});

describe("the calendar is Chicago's", () => {
  it("still counts the evening of the 30th as before the 1st", () => {
    // 04:00 UTC on 1 Dec is 22:00 on 30 Nov in Chicago.
    const lateEvening = new Date("2026-12-01T04:00:00Z");
    expect(recurringStartsLater({ recurring_cents: 4900, recurring_starts_on: "2026-12-01" }, lateEvening)).toBe(true);
  });
});

describe("a plain one-time invoice", () => {
  it("is unchanged", () => {
    const inv = { status: "partial", total_cents: 10000, amount_paid_cents: 4000, recurring_cents: 0, recurring_starts_on: null };
    expect(dueTodayCents(inv, NOW)).toBe(6000);
    expect(invoiceSettled(inv)).toBe(false);
    expect(invoiceSettled({ ...inv, amount_paid_cents: 10000 })).toBe(true);
  });
});
