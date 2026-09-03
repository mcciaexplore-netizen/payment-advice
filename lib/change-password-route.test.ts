import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const txSet = vi.fn(() => ({ where: vi.fn() }));
  const txUpdate = vi.fn(() => ({ set: txSet }));
  const txValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txValues }));
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
    cb({ update: txUpdate, insert: txInsert }),
  );
  return {
    limit,
    select,
    txSet,
    txUpdate,
    txInsert,
    txValues,
    transaction,
    getAdminSession: vi.fn(),
    verifyPassword: vi.fn(),
    hashPassword: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/admin-users", () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: mocks.hashPassword,
}));

import { POST } from "../app/api/account/change-password/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/account/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  currentPassword: "old-correct-password",
  newPassword: "brand-new-password",
  confirmPassword: "brand-new-password",
};

const activeUser = {
  id: "admin-1",
  fullName: "Sunil Salunke",
  email: "sunils@mcciapune.com",
  passwordHash: "$2a$12$existinghash",
  role: "PAYMENT_ADVICE",
  isActive: true,
};

describe("POST /api/account/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401s when there is no signed-in session", async () => {
    mocks.getAdminSession.mockResolvedValueOnce(null);
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("400s when the new password is shorter than 8 characters", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "admin-1" });
    const res = await POST(req({ ...VALID_BODY, newPassword: "short1", confirmPassword: "short1" }));
    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("400s when the confirmation doesn't match the new password", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "admin-1" });
    const res = await POST(req({ ...VALID_BODY, confirmPassword: "something-else" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/match/i);
  });

  it("400s when the new password is the same as the current password", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "admin-1" });
    const res = await POST(
      req({ currentPassword: "same-password", newPassword: "same-password", confirmPassword: "same-password" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/different/i);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("404s when the session's user id no longer resolves to an active account", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "admin-1" });
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("401s with a clear error and makes no change when the current password is wrong", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "admin-1" });
    mocks.limit.mockResolvedValueOnce([activeUser]);
    mocks.verifyPassword.mockResolvedValueOnce(false);
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/current password/i);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("hashes and stores the new password, and writes an ADMIN_PASSWORD_CHANGED audit entry with no password material in it", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "admin-1" });
    mocks.limit.mockResolvedValueOnce([activeUser]);
    mocks.verifyPassword.mockResolvedValueOnce(true);
    mocks.hashPassword.mockResolvedValueOnce("$2a$12$brandnewhash");

    const res = await POST(req(VALID_BODY));

    expect(res.status).toBe(200);
    expect(mocks.verifyPassword).toHaveBeenCalledWith("old-correct-password", "$2a$12$existinghash");
    expect(mocks.hashPassword).toHaveBeenCalledWith("brand-new-password");
    expect(mocks.txSet).toHaveBeenCalledWith({ passwordHash: "$2a$12$brandnewhash" });

    expect(mocks.txValues).toHaveBeenCalledTimes(1);
    const auditRow = mocks.txValues.mock.calls[0][0];
    expect(auditRow.action).toBe("ADMIN_PASSWORD_CHANGED");
    expect(auditRow.actor).toBe("Sunil Salunke <sunils@mcciapune.com>");
    expect(auditRow.paymentAdviceId).toBeNull();
    expect(JSON.stringify(auditRow)).not.toMatch(/old-correct-password|brand-new-password|existinghash|brandnewhash/);
  });

  it("works the same way for an AUTHORITY-role session — this route is not role-gated", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "authority-1" });
    mocks.limit.mockResolvedValueOnce([
      { ...activeUser, id: "authority-1", role: "AUTHORITY", fullName: "Aniruddha Brahma", email: "aniruddhab@mcciapune.com" },
    ]);
    mocks.verifyPassword.mockResolvedValueOnce(true);
    mocks.hashPassword.mockResolvedValueOnce("$2a$12$anotherhash");
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
  });
});
