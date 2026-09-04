import { describe, expect, it, vi } from "vitest";

vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");

import { createAdminSessionToken, decodeAdminSessionToken, hasFinanceRole, hasRole } from "./auth";

describe("decodeAdminSessionToken — multi-role payloads", () => {
  it("round-trips a single-role session exactly as before (no behavior change for the common case)", async () => {
    const token = await createAdminSessionToken({
      adminUserId: "u1",
      fullName: "Sunil Salunke",
      roles: ["PAYMENT_ADVICE"],
      recommendingAuthorityId: null,
    });
    const decoded = await decodeAdminSessionToken(token);
    expect(decoded).toEqual({
      adminUserId: "u1",
      fullName: "Sunil Salunke",
      roles: ["PAYMENT_ADVICE"],
      recommendingAuthorityId: null,
    });
  });

  it("round-trips a dual-role session (AUTHORITY + ALL), same shape Chintamani's account uses", async () => {
    const token = await createAdminSessionToken({
      adminUserId: "u2",
      fullName: "Chintamani Shrotri",
      roles: ["AUTHORITY", "ALL"],
      recommendingAuthorityId: "authority-1",
    });
    const decoded = await decodeAdminSessionToken(token);
    expect(decoded?.roles).toEqual(["AUTHORITY", "ALL"]);
    expect(decoded?.recommendingAuthorityId).toBe("authority-1");
  });

  it("rejects a token with an empty roles array", async () => {
    const token = await createAdminSessionToken({
      adminUserId: "u3",
      fullName: "Nobody",
      roles: [],
      recommendingAuthorityId: null,
    });
    expect(await decodeAdminSessionToken(token)).toBeNull();
  });

  it("rejects a token containing an unknown role string", async () => {
    const token = await createAdminSessionToken({
      adminUserId: "u4",
      fullName: "Someone",
      // @ts-expect-error — deliberately invalid for this test
      roles: ["SUPERUSER"],
      recommendingAuthorityId: null,
    });
    expect(await decodeAdminSessionToken(token)).toBeNull();
  });

  it("rejects AUTHORITY-role sessions missing recommendingAuthorityId", async () => {
    const token = await createAdminSessionToken({
      adminUserId: "u5",
      fullName: "Someone",
      roles: ["AUTHORITY"],
      recommendingAuthorityId: null,
    });
    expect(await decodeAdminSessionToken(token)).toBeNull();
  });

  it("rejects non-AUTHORITY sessions that carry a recommendingAuthorityId anyway", async () => {
    const token = await createAdminSessionToken({
      adminUserId: "u6",
      fullName: "Someone",
      roles: ["ALL"],
      recommendingAuthorityId: "should-not-be-set",
    });
    expect(await decodeAdminSessionToken(token)).toBeNull();
  });

  it("rejects a stale single-role token shape (adminRole, not roles) from before this migration", async () => {
    // Simulates a JWT signed by the old single-role code — same "reject
    // stale format, force fresh login" convention this file already
    // documents for the original shared-password format.
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode("test-secret-at-least-this-long-for-hs256");
    const staleToken = await new SignJWT({
      adminUserId: "u7",
      fullName: "Someone",
      adminRole: "PAYMENT_ADVICE",
      recommendingAuthorityId: null,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);
    expect(await decodeAdminSessionToken(staleToken)).toBeNull();
  });
});

describe("hasRole / hasFinanceRole", () => {
  it("hasRole is true only when the role is present in the list", () => {
    expect(hasRole({ roles: ["PAYMENT_ADVICE"] }, "PAYMENT_ADVICE")).toBe(true);
    expect(hasRole({ roles: ["PAYMENT_ADVICE"] }, "AUTHORITY")).toBe(false);
    expect(hasRole({ roles: ["AUTHORITY", "ALL"] }, "AUTHORITY")).toBe(true);
    expect(hasRole({ roles: ["AUTHORITY", "ALL"] }, "ALL")).toBe(true);
  });

  it("hasRole is false for a null/undefined session — never throws", () => {
    expect(hasRole(null, "ALL")).toBe(false);
    expect(hasRole(undefined, "ALL")).toBe(false);
  });

  it("hasFinanceRole is false for an AUTHORITY-only session", () => {
    expect(hasFinanceRole({ roles: ["AUTHORITY"] })).toBe(false);
  });

  it("hasFinanceRole is true for a dual-role session (AUTHORITY + ALL)", () => {
    expect(hasFinanceRole({ roles: ["AUTHORITY", "ALL"] })).toBe(true);
  });

  it("hasFinanceRole is true for any single Finance role", () => {
    expect(hasFinanceRole({ roles: ["PAYMENT_ADVICE"] })).toBe(true);
    expect(hasFinanceRole({ roles: ["CASH_VOUCHER"] })).toBe(true);
    expect(hasFinanceRole({ roles: ["ALL"] })).toBe(true);
  });
});
