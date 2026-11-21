import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));

import { GET } from "../app/api/session/route";

describe("GET /api/session", () => {
  it("says nothing but signedIn:false when signed out", async () => {
    state.session = null;
    const response = await GET();
    expect(await response.json()).toEqual({ signedIn: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns the caller's own name and only their dashboards", async () => {
    state.session = { adminUserId: "u1", fullName: "MANDAR MARATHE", roles: ["BRANCH"], recommendingAuthorityId: null };
    expect(await (await GET()).json()).toEqual({
      signedIn: true,
      fullName: "MANDAR MARATHE",
      dashboards: [{ href: "/authority?role=BRANCH", title: "Team Dashboard", description: "Track your own and your team's submissions" }],
    });
  });
});
