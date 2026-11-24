import { decodeJwt } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** App Hub sign-ins last up to 400 days, so on every use the account is
 * looked up again. A fake DB returns whatever account state each test sets. */
const state = vi.hoisted(() => ({ user: null as unknown, grants: [] as unknown[], queries: 0 }));
vi.stubEnv("AUTH_SECRET", "test-secret-at-least-this-long-for-hs256");
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      state.queries += 1;
      const node: Record<string, unknown> = {};
      node.from = () => node;
      node.where = () => node;
      node.limit = () => Promise.resolve(state.user ? [state.user] : []);
      return node;
    },
  },
}));
vi.mock("@/lib/admin-users", () => ({ getRolesForAdminUser: async () => state.grants }));

import { createAdminSessionToken, decodeAdminSessionToken } from "./auth";
import { refreshAppHubSession, sessionPayloadFor } from "./app-hub-session";

const SELF = { role: "SELF", recommendingAuthorityId: null, scopeValue: null };
const appHubSession = { adminUserId: "u1", fullName: "Vedshri Dikkar", roles: ["SELF" as const], recommendingAuthorityId: null, appHub: true as const };

beforeEach(() => {
  state.user = { id: "u1", fullName: "Vedshri Dikkar", isActive: true };
  state.grants = [SELF];
  state.queries = 0;
});

describe("App Hub sign-in lifetime", () => {
  it("an App Hub token lasts 400 days; a normal one still 7", async () => {
    const days = async (session: object) => {
      const { iat, exp } = decodeJwt(await createAdminSessionToken(session as never));
      return Math.round((exp! - iat!) / 86400);
    };
    expect(await days(appHubSession)).toBe(400);
    expect(await days({ ...appHubSession, appHub: undefined })).toBe(7);
  });

  it("the App Hub mark survives the round trip; normal tokens carry none", async () => {
    expect((await decodeAdminSessionToken(await createAdminSessionToken(appHubSession)))?.appHub).toBe(true);
    const { appHub: _drop, ...normal } = appHubSession;
    void _drop;
    expect(await decodeAdminSessionToken(await createAdminSessionToken(normal))).toEqual(normal);
  });
});

describe("refreshAppHubSession", () => {
  it("a normal session is returned as is, with no database query", async () => {
    const normal = { adminUserId: "u1", fullName: "A", roles: ["ALL" as const], recommendingAuthorityId: null };
    expect(await refreshAppHubSession(normal)).toBe(normal);
    expect(await refreshAppHubSession(null)).toBeNull();
    expect(state.queries).toBe(0);
  });

  it("an active account keeps its App Hub session", async () => {
    expect(await refreshAppHubSession(appHubSession)).toEqual(appHubSession);
  });

  it("a switched-off or deleted account is signed out at once", async () => {
    state.user = { id: "u1", fullName: "Vedshri Dikkar", isActive: false };
    expect(await refreshAppHubSession(appHubSession)).toBeNull();
    state.user = null;
    expect(await refreshAppHubSession(appHubSession)).toBeNull();
  });

  it("an account left with no role is signed out", async () => {
    state.grants = [];
    expect(await refreshAppHubSession(appHubSession)).toBeNull();
  });

  it("role changes apply straight away: the token's old roles are never trusted", async () => {
    const staleFinance = { ...appHubSession, roles: ["ALL" as const, "SELF" as const] };
    expect((await refreshAppHubSession(staleFinance))?.roles).toEqual(["SELF"]);
    state.grants = [SELF, { role: "AUTHORITY", recommendingAuthorityId: "ra-1", scopeValue: null }];
    expect(await refreshAppHubSession(appHubSession)).toMatchObject({ roles: ["SELF", "AUTHORITY"], recommendingAuthorityId: "ra-1", appHub: true });
  });

  it("sessionPayloadFor builds the same shape the logins use", () => {
    expect(sessionPayloadFor({ id: "u1", fullName: "X" }, [{ role: "CASH_RECEIPT", recommendingAuthorityId: null, scopeValue: "SB Road Office" }] as never))
      .toEqual({ adminUserId: "u1", fullName: "X", roles: ["CASH_RECEIPT"], recommendingAuthorityId: null, branchScope: "SB Road Office" });
  });
});

import { NextRequest } from "next/server";
import { proxy } from "../proxy";

describe("proxy re-checks App Hub sign-ins on every request", () => {
  const visit = async (path: string, session: object) =>
    proxy(new NextRequest(`http://localhost${path}`, { headers: { cookie: `mccia_admin_session=${await createAdminSessionToken(session as never)}` } }));

  it("an active App Hub user opens the Payment Desk", async () => {
    expect((await visit("/", appHubSession)).headers.get("location")).toBeNull();
  });

  it("a switched-off user with a still-valid App Hub token is sent to sign in", async () => {
    state.user = { id: "u1", fullName: "Vedshri Dikkar", isActive: false };
    expect((await visit("/", appHubSession)).headers.get("location")).toBe("http://localhost/login");
  });

  it("Finance taken away: an old App Hub token saying Finance no longer opens Finance Admin", async () => {
    expect((await visit("/admin", { ...appHubSession, roles: ["ALL", "SELF"] })).headers.get("location")).toBe("http://localhost/admin/login");
  });
});
