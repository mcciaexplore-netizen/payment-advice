import { describe, expect, it } from "vitest";
import { sentBackStatus } from "./send-back-status";

const now = new Date("2026-09-04T12:00:00.000Z");

describe("sentBackStatus", () => {
  it("does not mark exactly seven days as stale", () => {
    expect(sentBackStatus(new Date("2026-08-28T12:00:00.000Z"), new Date("2026-09-11T12:00:00.000Z"), now))
      .toMatchObject({ daysAgo: 7, label: "Sent back 7 days ago", isStale: false, isExpired: false });
  });

  it("marks more than seven days as stale", () => {
    expect(sentBackStatus(new Date("2026-08-27T12:00:00.000Z"), new Date("2026-09-10T12:00:00.000Z"), now))
      .toMatchObject({ daysAgo: 8, isStale: true, isExpired: false });
  });

  it("marks an elapsed edit-token expiry independently", () => {
    expect(sentBackStatus(new Date("2026-08-20T12:00:00.000Z"), new Date("2026-09-03T12:00:00.000Z"), now))
      .toMatchObject({ daysAgo: 15, isStale: true, isExpired: true });
  });
});
