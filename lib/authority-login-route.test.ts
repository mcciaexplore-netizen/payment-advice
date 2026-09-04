import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAdminUserByEmail: vi.fn(), getRolesForAdminUser: vi.fn(), recordAdminLogin: vi.fn(), verifyPassword: vi.fn(),
}));
vi.mock("@/lib/admin-users", () => mocks);
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");

import { POST } from "../app/api/authority/login/route";

function req() { return new NextRequest("http://localhost/api/authority/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "authority@example.com", password: "secret" }) }); }

describe("POST /api/authority/login", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects a valid Finance account with no AUTHORITY role from the separate Authority login", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "1", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "ALL", recommendingAuthorityId: null }]);
    expect((await POST(req())).status).toBe(403);
  });
  it("rejects an account whose AUTHORITY role has no linked authority", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "1", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "AUTHORITY", recommendingAuthorityId: null }]);
    expect((await POST(req())).status).toBe(403);
  });
  it("sets a session for an account whose AUTHORITY role is linked to one authority", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "1", fullName: "Asha Rao", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "AUTHORITY", recommendingAuthorityId: "authority-1" }]);
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mccia_admin_session=");
    expect(mocks.recordAdminLogin).toHaveBeenCalledWith("1");
  });
  it("sets a session carrying both roles for a dual-role account (AUTHORITY + ALL)", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "chintamani-1", fullName: "Chintamani Shrotri", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([
      { role: "AUTHORITY", recommendingAuthorityId: "authority-1" },
      { role: "ALL", recommendingAuthorityId: null },
    ]);
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mccia_admin_session=");
  });
});
