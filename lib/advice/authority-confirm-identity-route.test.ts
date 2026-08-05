import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const values = vi.fn();
  const insert = vi.fn(() => ({ values }));
  return { limit, select, values, insert };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, insert: mocks.insert } }));

import { POST } from "../../app/api/authority-approval/[token]/confirm-identity/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORITY_ID = "22222222-2222-4222-8222-222222222222";
const pending = {
  id: ADVICE_ID,
  authorityApprovedAt: null,
  authorityRejectedAt: null,
  authorityTokenExpiresAt: null,
  recommendingAuthorityId: AUTHORITY_ID,
};

function req(token: string, body: unknown) {
  return new NextRequest(`http://localhost/api/authority-approval/${token}/confirm-identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/authority-approval/[token]/confirm-identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the token doesn't match any advice", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req("bad-token", { email: "x@y.com" }), {
      params: Promise.resolve({ token: "bad-token" }),
    });
    expect(res.status).toBe(404);
  });

  it("409s when already approved (nothing left to confirm)", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...pending, authorityApprovedAt: new Date() }]);
    const res = await POST(req("t", { email: "x@y.com" }), { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(409);
  });

  it("409s when the link has expired", async () => {
    mocks.limit.mockResolvedValueOnce([
      { ...pending, authorityTokenExpiresAt: new Date(Date.now() - 1000) },
    ]);
    const res = await POST(req("t", { email: "x@y.com" }), { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(409);
  });

  it("429s and skips the email check entirely once 5 failures already happened in the last 15 minutes", async () => {
    mocks.limit
      .mockResolvedValueOnce([pending]) // advice lookup
      .mockResolvedValueOnce([{ count: 5 }]); // recent-failure count
    const res = await POST(req("t", { email: "correct@mcciapune.com" }), {
      params: Promise.resolve({ token: "t" }),
    });
    expect(res.status).toBe(429);
    // Never even got to reading the authority's email or comparing it
    expect(mocks.limit).toHaveBeenCalledTimes(2);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("400s on a malformed/missing email", async () => {
    mocks.limit
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ count: 0 }]);
    const res = await POST(req("t", { email: "not-an-email" }), {
      params: Promise.resolve({ token: "t" }),
    });
    expect(res.status).toBe(400);
  });

  it("503s with a generic message when this advice's authority has no email on file, and does not count it as a failed attempt", async () => {
    mocks.limit
      .mockResolvedValueOnce([pending]) // advice lookup
      .mockResolvedValueOnce([{ count: 0 }]) // recent-failure count
      .mockResolvedValueOnce([{ email: null }]); // authority lookup
    const res = await POST(req("t", { email: "someone@mcciapune.com" }), {
      params: Promise.resolve({ token: "t" }),
    });
    expect(res.status).toBe(503);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("401s with a generic, non-leaking error on a wrong email, and writes a distinct AUTHORITY_IDENTITY_CHECK_FAILED audit row with the attempted email", async () => {
    mocks.limit
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ email: "real.authority@mcciapune.com" }]);
    const res = await POST(req("t", { email: "guess@evil.com" }), {
      params: Promise.resolve({ token: "t" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("That email doesn't match our records for this approval.");
    expect(body.error).not.toContain("real.authority@mcciapune.com");
    expect(mocks.insert).toHaveBeenCalledWith(expect.anything());
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentAdviceId: ADVICE_ID,
        action: "AUTHORITY_IDENTITY_CHECK_FAILED",
        actor: "Unverified visitor",
        details: { attemptedEmail: "guess@evil.com" },
      }),
    );
  });

  it("matches case-insensitively and ignores surrounding whitespace, and sets the per-token session cookie on success", async () => {
    mocks.limit
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ email: "Real.Authority@McciaPune.com" }]);
    const res = await POST(req("my-token-abc", { email: "  real.authority@mcciapune.com  " }), {
      params: Promise.resolve({ token: "my-token-abc" }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.insert).not.toHaveBeenCalled();
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("mccia_authority_identity_my-token-abc=1");
    expect(setCookie).toContain("HttpOnly");
    // Deliberately a session cookie (no Expires/Max-Age) — cleared when the
    // browser closes, not persisted indefinitely.
    expect(setCookie).not.toMatch(/Max-Age|Expires/i);
  });
});
