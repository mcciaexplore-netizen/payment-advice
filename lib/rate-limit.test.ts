import { describe, expect, it } from "vitest";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows `limit` requests per window per key, then limits, then resets after the window", () => {
    const isLimited = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([0, 1, 2, 3].map(() => isLimited("a", 0))).toEqual([false, false, false, true]);
    expect(isLimited("b", 0)).toBe(false);
    expect(isLimited("a", 1001)).toBe(false);
  });

  it("keeps memory bounded", () => {
    const isLimited = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    isLimited("a", 0); isLimited("b", 0); isLimited("c", 0);
    expect(isLimited("c", 0)).toBe(true);
  });

  it("reads the first x-forwarded-for address", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }))).toBe("203.0.113.1");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
