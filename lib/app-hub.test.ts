import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveAdminUserByEmail: vi.fn(), getRolesForAdminUser: vi.fn(), recordAdminLogin: vi.fn(), verifyPassword: vi.fn(),
}));
vi.mock("@/lib/admin-users", () => mocks);
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");

import { appHubOrigins, clearSessionCookies, frameAncestorsPolicy, setSessionCookie } from "./app-hub";
import { proxy } from "../proxy";
import { POST as login } from "../app/api/login/route";
import { POST as logout } from "../app/api/logout/route";

const cookieOf = (response: Response) => response.headers.get("set-cookie") ?? "";

describe("App Hub settings", () => {
  it("reads the App Hub address list; anything malformed is dropped", () => {
    expect(appHubOrigins({ APP_HUB_ORIGINS: " https://apphub.mcciapune.com/ , http://127.0.0.1:4000,javascript:x, https://a.com/path " } as never))
      .toEqual(["https://apphub.mcciapune.com", "http://127.0.0.1:4000"]);
    expect(appHubOrigins({} as never)).toEqual([]);
  });

  it("allows framing only by the App Hub, and sends nothing at all when none is set (live behaviour unchanged)", () => {
    expect(frameAncestorsPolicy({ APP_HUB_ORIGINS: "https://apphub.mcciapune.com" } as never)).toBe("frame-ancestors 'self' https://apphub.mcciapune.com");
    expect(frameAncestorsPolicy({} as never)).toBeNull();
  });
});

describe("session cookie", () => {
  it("inside the App Hub: third-party-safe (None, Secure, Partitioned) and remembered for the token's life", () => {
    const response = NextResponse.json({});
    setSessionCookie(response, "tok", true);
    const cookie = cookieOf(response);
    expect(cookie).toMatch(/mccia_admin_session=tok/);
    expect(cookie).toMatch(/SameSite=none/i);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Partitioned/);
    expect(cookie).toMatch(/Max-Age=34560000/);
    expect(cookie).toMatch(/HttpOnly/);
  });

  it("on its own: a browser-session Lax cookie, exactly as before", () => {
    const response = NextResponse.json({});
    setSessionCookie(response, "tok", false);
    const cookie = cookieOf(response);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/Partitioned|Max-Age|Expires/i);
  });

  it("log out clears both kinds", async () => {
    const response = NextResponse.json({});
    clearSessionCookies(response);
    const all = response.headers.getSetCookie().join("\n");
    expect(all).toMatch(/mccia_admin_session=;.*Partitioned/);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect((await logout()).headers.getSetCookie()).toHaveLength(2);
  });
});

function req(body: unknown) {
  return new NextRequest("http://localhost/api/login", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.1.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) });
}

describe("POST /api/login from inside the App Hub", () => {
  beforeEach(() => {
    mocks.findActiveAdminUserByEmail.mockResolvedValue({ id: "u1", fullName: "Vedshri Dikkar", passwordHash: "hash" });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRolesForAdminUser.mockResolvedValue([{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is remembered inside the App Hub when an App Hub is configured", async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");
    vi.stubEnv("APP_HUB_ORIGINS", "https://apphub.mcciapune.com");
    expect(cookieOf(await login(req({ email: "vedshrid@mcciapune.com", password: "x", embedded: true })))).toMatch(/Partitioned/);
  });

  it("ignores the embedded flag when no App Hub is configured", async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");
    vi.stubEnv("APP_HUB_ORIGINS", "");
    expect(cookieOf(await login(req({ email: "vedshrid@mcciapune.com", password: "x", embedded: true })))).not.toMatch(/Partitioned|Max-Age/);
  });

  it("a normal sign-in stays a browser-session cookie even with an App Hub configured", async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");
    vi.stubEnv("APP_HUB_ORIGINS", "https://apphub.mcciapune.com");
    expect(cookieOf(await login(req({ email: "vedshrid@mcciapune.com", password: "x" })))).not.toMatch(/Partitioned|Max-Age/);
  });
});

describe("proxy keeps the App Hub context on the way to sign-in", () => {
  it("carries embed=1 and the email to /login", async () => {
    const response = await proxy(new NextRequest("http://localhost/?embed=1&email=vedshrid@mcciapune.com"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("embed")).toBe("1");
    expect(location.searchParams.get("email")).toBe("vedshrid@mcciapune.com");
  });

  it("a normal visit is unchanged", async () => {
    expect((await proxy(new NextRequest("http://localhost/"))).headers.get("location")).toBe("http://localhost/login");
  });
});
