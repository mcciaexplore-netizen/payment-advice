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
  return { limit, select, txSet, txInsert, txValues, transaction };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));

import { POST } from "../../app/api/admin/advice/[id]/receive/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";

function req() {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/receive`, {
    method: "POST",
  });
}

describe("POST /api/admin/advice/[id]/receive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the advice doesn't exist", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when the Recommending Authority hasn't approved yet", async () => {
    mocks.limit.mockResolvedValueOnce([
      { status: "SUBMITTED", authorityApprovedAt: null, financeReceivedAt: null },
    ]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when already marked received (double-action prevention)", async () => {
    mocks.limit.mockResolvedValueOnce([
      { status: "SUBMITTED", authorityApprovedAt: new Date(), financeReceivedAt: new Date() },
    ]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("marks received and writes a FINANCE_RECEIVED audit entry when authority-approved and not yet received", async () => {
    mocks.limit.mockResolvedValueOnce([
      { status: "SUBMITTED", authorityApprovedAt: new Date(), financeReceivedAt: null },
    ]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ financeReceivedAt: expect.any(Date) }),
    );
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "FINANCE_RECEIVED", actor: "ADMIN" }),
    );
  });
});
