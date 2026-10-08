import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeAdminSessionToken } from "./auth";

const mocks = vi.hoisted(() => ({
  findActiveAdminUserByEmail: vi.fn(), getRolesForAdminUser: vi.fn(), recordAdminLogin: vi.fn(), verifyPassword: vi.fn(),
}));
vi.mock("@/lib/admin-users", () => mocks);
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");

import { POST } from "../app/api/team/login/route";

function sessionTokenFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/mccia_admin_session=([^;]+)/);
  if (!match) throw new Error("No session cookie in response");
  return match[1];
}

function req() { return new NextRequest("http://localhost/api/team/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "team@example.com", password: "secret" }) }); }

describe("POST /api/team/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an Authority-only account", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "authority-1", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "AUTHORITY", recommendingAuthorityId: "ra-1", scopeValue: null }]);
    expect((await POST(req())).status).toBe(403);
  });

  it("signs in a Branch account", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "branch-1", fullName: "Branch User", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Bhosari Office" }]);
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mccia_admin_session=");
    expect(mocks.recordAdminLogin).toHaveBeenCalledWith("branch-1");
  });

  it("signs in one account carrying both Branch and Department grants", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "tejas-1", fullName: "Tejaskumar Narute", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([
      { role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Hadapsar Office" },
      { role: "DEPARTMENT", recommendingAuthorityId: null, scopeValue: "AGRICULTURE" },
    ]);
    expect((await POST(req())).status).toBe(200);
  });

  it("signs in a SELF (individual-scope, 2026-10) account, needing no scopeValue unlike Branch/Department", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "dnyaneshwar-1", fullName: "DNYANESHWAR BANDRE", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }]);
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(mocks.recordAdminLogin).toHaveBeenCalledWith("dnyaneshwar-1");
  });

  it("signs in a CASH_RECEIPT-only account (2026-10-07) - previously rejected, now allowed - and the session carries branchScope so the same login also works for Cash Receipt", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "cr-only-1", fullName: "Cash Receipt Only", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: "SB Road Office" }]);
    const response = await POST(req());
    expect(response.status).toBe(200);
    const session = await decodeAdminSessionToken(sessionTokenFrom(response));
    expect(session?.roles).toEqual(["CASH_RECEIPT"]);
    expect(session?.branchScope).toBe("SB Road Office");
  });

  it("a SELF + CASH_RECEIPT account's Team Dashboard session also carries branchScope from the CASH_RECEIPT grant", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "dual-1", fullName: "Dual Grant User", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([
      { role: "SELF", recommendingAuthorityId: null, scopeValue: null },
      { role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: "SB Road Office" },
    ]);
    const response = await POST(req());
    const session = await decodeAdminSessionToken(sessionTokenFrom(response));
    expect(session?.roles).toEqual(["SELF", "CASH_RECEIPT"]);
    expect(session?.branchScope).toBe("SB Road Office");
  });

  it("a BRANCH-only account's Team Dashboard session carries no branchScope (unchanged - BRANCH is not a Cash Receipt grant)", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "branch-2", fullName: "Branch User", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Bhosari Office" }]);
    const response = await POST(req());
    const session = await decodeAdminSessionToken(sessionTokenFrom(response));
    expect(session?.branchScope).toBeUndefined();
  });

  it("rejects a CASH_RECEIPT grant with no scopeValue the same way BRANCH/DEPARTMENT already require one", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "cr-bad-1", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: null }]);
    expect((await POST(req())).status).toBe(403);
  });
});
