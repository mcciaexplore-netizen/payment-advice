import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeAdminSessionToken } from "./auth";

const mocks = vi.hoisted(() => ({
  findActiveAdminUserByEmail: vi.fn(),
  getRolesForAdminUser: vi.fn(),
  recordAdminLogin: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/admin-users", () => mocks);
vi.mock("@/lib/cash-receipt-local-users", () => ({ findLocalCashReceiptUser: vi.fn() }));
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");
vi.stubEnv("NODE_ENV", "production");

import { POST } from "../app/api/cash-receipt/login/route";

function req() {
  return new NextRequest("http://localhost/api/cash-receipt/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com", password: "secret" }),
  });
}

function sessionTokenFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/mccia_admin_session=([^;]+)/);
  if (!match) throw new Error("No session cookie in response");
  return match[1];
}

describe("POST /api/cash-receipt/login (2026-10-07: CASH_RECEIPT only, BRANCH no longer qualifies)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a BRANCH-only account with a clear message, not a raw error", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "branch-1", fullName: "Branch User", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Bhosari Office" }]);
    const response = await POST(req());
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("This account has not been given Cash Receipt access. Contact Finance if you believe this is wrong.");
  });

  it("signs in a CASH_RECEIPT account, session carries CASH_RECEIPT role and the matching branchScope", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "cr-1", fullName: "Cash Receipt User", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: "SB Road Office" }]);
    const response = await POST(req());
    expect(response.status).toBe(200);
    const session = await decodeAdminSessionToken(sessionTokenFrom(response));
    expect(session?.roles).toEqual(["CASH_RECEIPT"]);
    expect(session?.branchScope).toBe("SB Road Office");
    expect(mocks.recordAdminLogin).toHaveBeenCalledWith("cr-1");
  });

  it("signs in a BRANCH+CASH_RECEIPT account using the CASH_RECEIPT grant's branch", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "dual-1", fullName: "Dual Grant User", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([
      { role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Bhosari Office" },
      { role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: "Bhosari Office" },
    ]);
    const response = await POST(req());
    expect(response.status).toBe(200);
    const session = await decodeAdminSessionToken(sessionTokenFrom(response));
    expect(session?.roles).toEqual(["BRANCH", "CASH_RECEIPT"]);
    expect(session?.branchScope).toBe("Bhosari Office");
  });

  it("rejects a CASH_RECEIPT grant with no scopeValue", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "cr-bad-1", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: null }]);
    expect((await POST(req())).status).toBe(403);
  });

  it("rejects an account with no roles at all", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "none-1", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([]);
    expect((await POST(req())).status).toBe(403);
  });

  it("rejects an incorrect password with a clear, generic message", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "cr-1", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(false);
    const response = await POST(req());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Incorrect email or password.");
  });
});
