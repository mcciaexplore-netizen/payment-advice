import { describe, expect, it } from "vitest";
import { isEditTokenExpired, sentBackStatus } from "./send-back-status";

const now = new Date("2026-09-04T12:00:00.000Z");

describe("isEditTokenExpired", () => {
  it("treats missing and elapsed expirations as expired", () => {
    expect(isEditTokenExpired(null, now)).toBe(true);
    expect(isEditTokenExpired(new Date("2026-09-04T11:59:59.999Z"), now)).toBe(true);
  });

  it("keeps a future expiration valid", () => {
    expect(isEditTokenExpired(new Date("2026-09-04T12:00:00.001Z"), now)).toBe(false);
  });
});

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
