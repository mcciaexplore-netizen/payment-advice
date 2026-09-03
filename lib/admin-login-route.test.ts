import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAdminUserByEmail: vi.fn(),
  recordAdminLogin: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/admin-users", () => mocks);
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");

import { POST } from "../app/api/admin/login/route";

// Distinct IP per call — the route's rate limiter is a module-level Map
// keyed by IP that persists across tests in this file, so reusing one IP
// would make later tests fail from earlier tests' failed attempts, not
// from what they're actually asserting.
let ipCounter = 0;
function req(body: unknown) {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

const activeUser = {
  id: "admin-1",
  fullName: "Sunil Salunke",
  email: "sunil@mcciapune.com",
  passwordHash: "$2a$12$realhashvalue",
  role: "PAYMENT_ADVICE",
  isActive: true,
};

describe("POST /api/admin/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401s when the email doesn't match any admin_users row, still calling verifyPassword against a dummy hash (timing-safe, no email-enumeration signal)", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValueOnce(null);
    mocks.verifyPassword.mockResolvedValueOnce(false);
    const res = await POST(req({ email: "nobody@mcciapune.com", password: "whatever" }));
    expect(res.status).toBe(401);
    expect(mocks.verifyPassword).toHaveBeenCalledWith("whatever", expect.any(String));
    expect(mocks.recordAdminLogin).not.toHaveBeenCalled();
  });

  it("401s when the password is wrong for a real user", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValueOnce(activeUser);
    mocks.verifyPassword.mockResolvedValueOnce(false);
    const res = await POST(req({ email: "sunil@mcciapune.com", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(mocks.recordAdminLogin).not.toHaveBeenCalled();
  });

  it("401s with a generic message that doesn't distinguish 'no such email' from 'wrong password'", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValueOnce(null);
    mocks.verifyPassword.mockResolvedValueOnce(false);
    const res1 = await POST(req({ email: "nobody@mcciapune.com", password: "x" }));
    const body1 = await res1.json();

    mocks.findActiveAdminUserByEmail.mockResolvedValueOnce(activeUser);
    mocks.verifyPassword.mockResolvedValueOnce(false);
    const res2 = await POST(req({ email: "sunil@mcciapune.com", password: "wrong" }));
    const body2 = await res2.json();

    expect(body1.error).toBe(body2.error);
  });

  it("401s and skips the bcrypt compare entirely when email/password aren't strings", async () => {
    const res = await POST(req({ email: 123, password: null }));
    expect(res.status).toBe(401);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("signs in a real active user, records last_login_at, and sets the session cookie", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValueOnce(activeUser);
    mocks.verifyPassword.mockResolvedValueOnce(true);
    const res = await POST(req({ email: "SUNIL@mcciapune.com", password: "correct-password" }));
    expect(res.status).toBe(200);
    expect(mocks.recordAdminLogin).toHaveBeenCalledWith("admin-1");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("mccia_admin_session=");
    expect(setCookie).toContain("HttpOnly");
    const body = await res.json();
    expect(body).toEqual({ ok: true, fullName: "Sunil Salunke", role: "PAYMENT_ADVICE" });
  });

  it("refuses an authority account at the Finance Admin login", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValueOnce({ ...activeUser, role: "AUTHORITY", recommendingAuthorityId: "authority-1" });
    mocks.verifyPassword.mockResolvedValueOnce(true);
    const res = await POST(req({ email: "authority@mcciapune.com", password: "correct-password" }));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
