import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAdminUserByEmail: vi.fn(), recordAdminLogin: vi.fn(), verifyPassword: vi.fn(),
}));
vi.mock("@/lib/admin-users", () => mocks);
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");

import { POST } from "../app/api/authority/login/route";

function req() { return new NextRequest("http://localhost/api/authority/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "authority@example.com", password: "secret" }) }); }

describe("POST /api/authority/login", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects a valid Finance account from the separate Authority login", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "1", role: "ALL", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    expect((await POST(req())).status).toBe(403);
  });
  it("rejects an AUTHORITY row with no linked authority", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "1", role: "AUTHORITY", passwordHash: "hash", recommendingAuthorityId: null });
    mocks.verifyPassword.mockResolvedValue(true);
    expect((await POST(req())).status).toBe(403);
  });
  it("sets a session only for an AUTHORITY user linked to one authority", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "1", fullName: "Asha Rao", role: "AUTHORITY", passwordHash: "hash", recommendingAuthorityId: "authority-1" });
    mocks.verifyPassword.mockResolvedValue(true);
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mccia_admin_session=");
    expect(mocks.recordAdminLogin).toHaveBeenCalledWith("1");
  });
});
