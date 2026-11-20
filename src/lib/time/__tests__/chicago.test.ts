import { describe, expect, it } from "vitest";
import { addDays, chicagoDate, chicagoDayEnd, chicagoInstant, zonedMidnightUtc } from "../chicago";
import { daysOverdue, isOverdue } from "@/lib/invoices/pricing";

describe("chicagoInstant", () => {
  it("uses UTC-6 in winter", () => {
    expect(chicagoInstant("2026-11-19", 17).toISOString()).toBe("2026-11-19T23:00:00.000Z");
    expect(zonedMidnightUtc("2026-11-19").toISOString()).toBe("2026-11-19T06:00:00.000Z");
  });

  it("uses UTC-5 in summer", () => {
    expect(chicagoInstant("2026-07-04", 17).toISOString()).toBe("2026-07-04T22:00:00.000Z");
    expect(zonedMidnightUtc("2026-07-04").toISOString()).toBe("2026-07-04T05:00:00.000Z");
  });

  it("is right on both sides of the spring change (Mar 8, 2026)", () => {
    // 1am is still standard time; 3am is already daylight time.
    expect(chicagoInstant("2026-03-08", 1).toISOString()).toBe("2026-03-08T07:00:00.000Z");
    expect(chicagoInstant("2026-03-08", 3).toISOString()).toBe("2026-03-08T08:00:00.000Z");
  });

  it("is right on both sides of the autumn change (Nov 1, 2026)", () => {
    expect(zonedMidnightUtc("2026-11-01").toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(chicagoInstant("2026-11-01", 17).toISOString()).toBe("2026-11-01T23:00:00.000Z");
  });

  it("carries minutes", () => {
    expect(chicagoInstant("2026-11-19", 9, 30).toISOString()).toBe("2026-11-19T15:30:00.000Z");
  });
});

describe("chicagoDayEnd", () => {
  it("is midnight at the start of the next Chicago day", () => {
    expect(chicagoDayEnd("2026-11-19").toISOString()).toBe("2026-11-20T06:00:00.000Z");
  });

  it("a day with a clock change is 23 or 25 hours long, not 24", () => {
    const spring = chicagoDayEnd("2026-03-08").getTime() - zonedMidnightUtc("2026-03-08").getTime();
    const autumn = chicagoDayEnd("2026-11-01").getTime() - zonedMidnightUtc("2026-11-01").getTime();
    expect(spring / 3_600_000).toBe(23);
    expect(autumn / 3_600_000).toBe(25);
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("chicagoDate", () => {
  it("is still today in Chicago after the UTC date has rolled over", () => {
    // 8pm Central on the 19th is 2am UTC on the 20th.
    expect(chicagoDate(new Date("2026-11-20T02:00:00Z"))).toBe("2026-11-19");
  });
});

describe("invoice overdue, in Central time", () => {
  const invoice = { due_date: "2026-11-19", status: "sent", total_cents: 6000, amount_paid_cents: 0 };

  it("is not overdue on the evening of the due date", () => {
    // 8pm Central on the 19th. In UTC it is already the 20th.
    const realNow = Date.now;
    Date.now = () => new Date("2026-11-20T02:00:00Z").getTime();
    try {
      expect(isOverdue(invoice)).toBe(false);
      expect(daysOverdue("2026-11-19")).toBe(0);
    } finally {
      Date.now = realNow;
    }
  });

  it("is overdue once the due date is over in Chicago", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2026-11-20T06:00:01Z").getTime();
    try {
      expect(isOverdue(invoice)).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});
