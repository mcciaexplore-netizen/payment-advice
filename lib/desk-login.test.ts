import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAdminUserByEmail: vi.fn(), getRolesForAdminUser: vi.fn(), recordAdminLogin: vi.fn(), verifyPassword: vi.fn(),
}));
vi.mock("@/lib/admin-users", () => mocks);
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");

import { createAdminSessionToken, decodeAdminSessionToken } from "./auth";
import { DESK_PATHS, safeNextPath } from "./desk-login";
import { proxy } from "../proxy";
import { POST as login } from "../app/api/login/route";
import { POST as logout } from "../app/api/logout/route";

async function visit(path: string, roles: string[] | null) {
  const headers: Record<string, string> = {};
  if (roles) {
    const token = await createAdminSessionToken({ adminUserId: "u1", fullName: "User", roles: roles as never, recommendingAuthorityId: roles.includes("AUTHORITY") ? "ra-1" : null });
    headers.cookie = `mccia_admin_session=${token}`;
  }
  return proxy(new NextRequest(`http://localhost${path}`, { headers }));
}
const location = (response: Response) => response.headers.get("location");

describe("Payment Desk sign-in gate (proxy)", () => {
  it.each([...DESK_PATHS])("%s sends a signed-out visitor to /login, returning them afterwards", async (path) => {
    const response = await visit(path, null);
    expect(response.status).toBe(302);
    expect(location(response)).toBe(path === "/" ? "http://localhost/login" : `http://localhost/login?next=${encodeURIComponent(path)}`);
  });

  it.each([["SELF"], ["AUTHORITY"], ["ALL"], ["BRANCH"]])("%s account: the desk opens", async (role) => {
    const response = await visit("/", [role]);
    expect(response.headers.get("location")).toBeNull();
  });

  it("the sign-in page shows when signed out and sends a signed-in user on to the desk", async () => {
    expect(location(await visit("/login", null))).toBeNull();
    expect(location(await visit("/login?next=/cash-voucher", ["SELF"]))).toBe("http://localhost/cash-voucher");
    expect(location(await visit("/login?next=https://evil.example", ["SELF"]))).toBe("http://localhost/");
  });

  it("emailed links and dashboards keep their own rules", async () => {
    // Not matched by the desk gate: these never reach it (proxy matcher), and
    // the dashboards still require their own roles.
    expect(location(await visit("/authority", ["ALL"]))).toBe("http://localhost/authority/login");
    expect(location(await visit("/admin", ["SELF"]))).toBe("http://localhost/admin/login");
  });

  it("safeNextPath only ever returns a desk page", () => {
    expect(safeNextPath("/refund")).toBe("/refund");
    for (const value of [undefined, null, "", "//evil.example", "https://evil.example", "/admin", "/authority"]) expect(safeNextPath(value)).toBe("/");
  });
});

function req(body: unknown) {
  return new NextRequest("http://localhost/api/login", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) });
}
const tokenFrom = (response: Response) => response.headers.get("set-cookie")!.match(/mccia_admin_session=([^;]+)/)![1];

describe("POST /api/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs in any active account with a role, carrying every role, the authority link and the Cash Receipt branch", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "u1", fullName: "Ganesh Mate", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([
      { role: "AUTHORITY", recommendingAuthorityId: "ra-1", scopeValue: null },
      { role: "SELF", recommendingAuthorityId: null, scopeValue: null },
      { role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: "SB Road Office" },
    ]);
    const response = await login(req({ email: "ganeshm@mcciapune.com", password: "x" }));
    expect(response.status).toBe(200);
    const session = await decodeAdminSessionToken(tokenFrom(response));
    expect(session).toMatchObject({ adminUserId: "u1", roles: ["AUTHORITY", "SELF", "CASH_RECEIPT"], recommendingAuthorityId: "ra-1", branchScope: "SB Road Office" });
    expect(mocks.recordAdminLogin).toHaveBeenCalledWith("u1");
    // A browser-session cookie: closing the browser signs the person out.
    expect(response.headers.get("set-cookie")).not.toMatch(/max-age|expires/i);
  });

  it("gives the same message for an unknown email and a wrong password", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(false);
    const unknown = await login(req({ email: "nobody@x.com", password: "x" }));
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "u1", fullName: "A", passwordHash: "hash" });
    const wrong = await login(req({ email: "a@x.com", password: "bad" }));
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
    expect(unknown.headers.get("set-cookie")).toBeNull();
  });

  it("refuses an account with no role", async () => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "u1", fullName: "A", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([]);
    const response = await login(req({ email: "a@x.com", password: "x" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("log out clears the session cookie", async () => {
    expect((await logout()).headers.get("set-cookie")).toMatch(/mccia_admin_session=;/);
  });
});

import { dashboardLinksFor } from "./desk-dashboards";

describe("one sign-in opens the dashboards (no second login)", () => {
  it("the menu lists only the dashboards an account's roles allow, linked past the login pages", () => {
    expect(dashboardLinksFor(["SELF"]).map((link) => link.href)).toEqual(["/authority?role=SELF"]);
    expect(dashboardLinksFor(["ALL"]).map((link) => link.href)).toEqual(["/admin"]);
    expect(dashboardLinksFor(["AUTHORITY", "ALL", "BRANCH"]).map((link) => link.href)).toEqual(["/admin", "/authority?role=AUTHORITY", "/authority?role=BRANCH"]);
    expect(dashboardLinksFor(["CASH_RECEIPT"]).map((link) => link.href)).toEqual(["/authority?role=CASH_RECEIPT"]);
    expect(dashboardLinksFor([])).toEqual([]);
  });

  it.each([["SELF"], ["CASH_RECEIPT"], ["BRANCH"], ["DEPARTMENT"]])("a signed-in %s user opening Team Dashboard Login goes straight to the dashboard", async (role) => {
    expect(location(await visit("/team/login", [role]))).toBe(`http://localhost/authority?role=${role}`);
  });

  it("signed-in Finance and Authority users skip their login pages too; a signed-out visitor still sees them", async () => {
    expect(location(await visit("/admin/login", ["ALL"]))).toBe("http://localhost/admin");
    expect(location(await visit("/authority/login", ["AUTHORITY"]))).toBe("http://localhost/authority");
    expect(location(await visit("/team/login", null))).toBeNull();
    expect(location(await visit("/admin/login", null))).toBeNull();
  });
});

describe("every login ends when the browser closes", () => {
  it("the Payment Desk login sets its cookie through setSessionCookie (browser-session unless inside the App Hub, tested in app-hub.test.ts)", async () => {
    const source = (await import("node:fs")).readFileSync("app/api/login/route.ts", "utf8");
    expect(source).toContain("setSessionCookie(response, token,");
    expect(source).not.toMatch(/maxAge|expires/);
  });

  it.each(["app/api/admin/login/route.ts", "app/api/authority/login/route.ts", "app/api/team/login/route.ts", "app/api/cash-receipt/login/route.ts"])("%s sets the session cookie with no maxAge", async (file) => {
    const source = (await import("node:fs")).readFileSync(file, "utf8");
    expect(source).toContain("ADMIN_SESSION_COOKIE");
    expect(source).not.toMatch(/maxAge|expires/);
  });
});
