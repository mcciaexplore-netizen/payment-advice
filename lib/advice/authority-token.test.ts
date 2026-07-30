import { describe, expect, it } from "vitest";
import { AUTHORITY_TOKEN_TTL_MS, authorityActionError, generateAuthorityToken } from "./authority-token";

describe("generateAuthorityToken", () => {
  it("generates a URL-safe token distinct from a second call", () => {
    const a = generateAuthorityToken();
    const b = generateAuthorityToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.token.length).toBeGreaterThan(30);
  });

  it("sets expiresAt to now + the 90-day TTL", () => {
    const before = Date.now();
    const { expiresAt } = generateAuthorityToken();
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + AUTHORITY_TOKEN_TTL_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + AUTHORITY_TOKEN_TTL_MS);
  });
});

describe("authorityActionError", () => {
  const base = {
    authorityApprovedAt: null as Date | null,
    authorityRejectedAt: null as Date | null,
    authorityTokenExpiresAt: null as Date | null,
  };

  it("allows action when nothing has happened yet and the token isn't expired", () => {
    expect(authorityActionError({ ...base })).toBeNull();
  });

  it("allows action when the token has no expiry set", () => {
    expect(authorityActionError({ ...base, authorityTokenExpiresAt: null })).toBeNull();
  });

  it("blocks a second action once already approved", () => {
    expect(authorityActionError({ ...base, authorityApprovedAt: new Date() })).toMatch(
      /already been approved/,
    );
  });

  it("blocks a second action once already rejected", () => {
    expect(authorityActionError({ ...base, authorityRejectedAt: new Date() })).toMatch(
      /already been sent back/,
    );
  });

  it("prefers the approved message when both timestamps are somehow set", () => {
    const error = authorityActionError({
      ...base,
      authorityApprovedAt: new Date(),
      authorityRejectedAt: new Date(),
    });
    expect(error).toMatch(/already been approved/);
  });

  it("blocks action on an expired, not-yet-actioned token", () => {
    const error = authorityActionError({
      ...base,
      authorityTokenExpiresAt: new Date(Date.now() - 1000),
    });
    expect(error).toMatch(/expired/);
  });

  it("does not block a not-yet-expired pending token", () => {
    const error = authorityActionError({
      ...base,
      authorityTokenExpiresAt: new Date(Date.now() + 1000),
    });
    expect(error).toBeNull();
  });
});
