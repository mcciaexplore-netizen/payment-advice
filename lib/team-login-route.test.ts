import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAdminUserByEmail: vi.fn(), getRolesForAdminUser: vi.fn(), recordAdminLogin: vi.fn(), verifyPassword: vi.fn(),
}));
vi.mock("@/lib/admin-users", () => mocks);
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");

import { POST } from "../app/api/team/login/route";

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
});
