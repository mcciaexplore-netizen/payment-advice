import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const txWhere = vi.fn();
  const txSet = vi.fn(() => ({ where: txWhere }));
  const txUpdate = vi.fn(() => ({ set: txSet }));
  const txValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txValues }));
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
    cb({ update: txUpdate, insert: txInsert }),
  );
  return { limit, select, txSet, txUpdate, txValues, txInsert, transaction };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));

import { POST } from "../../app/api/authority-approval/[token]/approve/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";
const pending = {
  id: ADVICE_ID,
  authorityApprovedAt: null,
  authorityRejectedAt: null,
  authorityTokenExpiresAt: null,
  recommendingAuthorityId: "22222222-2222-4222-8222-222222222222",
};

function req(token: string) {
  return new NextRequest(`http://localhost/api/authority-approval/${token}/approve`, {
    method: "POST",
  });
}

describe("POST /api/authority-approval/[token]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the token doesn't match any advice", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req("bad-token"), { params: Promise.resolve({ token: "bad-token" }) });
    expect(res.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when already approved (double-action prevention)", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...pending, authorityApprovedAt: new Date() }]);
    const res = await POST(req("t"), { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "This Payment Advice has already been approved.",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when already rejected (double-action prevention)", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...pending, authorityRejectedAt: new Date() }]);
    const res = await POST(req("t"), { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when the link expired before any action was taken", async () => {
    mocks.limit.mockResolvedValueOnce([
      { ...pending, authorityTokenExpiresAt: new Date(Date.now() - 1000) },
    ]);
    const res = await POST(req("t"), { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("records approval and writes an AUTHORITY_APPROVED audit entry when pending and valid", async () => {
    mocks.limit
      .mockResolvedValueOnce([pending]) // advice lookup
      .mockResolvedValueOnce([{ authorityName: "Asha Rao" }]); // authority name lookup
    const res = await POST(req("t"), { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txUpdate).toHaveBeenCalledWith(expect.anything());
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ authorityApprovedAt: expect.any(Date) }),
    );
    expect(mocks.txInsert).toHaveBeenCalledWith(expect.anything());
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "AUTHORITY_APPROVED", actor: "Asha Rao" }),
    );
  });
});
