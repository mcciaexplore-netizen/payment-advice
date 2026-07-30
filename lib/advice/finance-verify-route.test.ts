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
  const notifyVerified = vi.fn();
  return { limit, select, txSet, txInsert, txValues, transaction, notifyVerified };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("@/lib/email/notify", () => ({ notifyVerified: mocks.notifyVerified }));

import { POST, PATCH } from "../../app/api/admin/advice/[id]/verify/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";

const receivedNeft = {
  serialNo: "MCCIA/2026-27/0001",
  submittedByName: "Priya Sharma",
  submittedByEmail: "priya@example.com",
  payeeName: "Acme Supplies",
  amount: "1250.00",
  formDate: "2026-07-28",
  paymentMode: "NEFT",
  financeReceivedAt: new Date(),
  verifiedAt: null,
};

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/advice/[id]/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the advice doesn't exist", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req({ verifiedBy: "Sunil Salunke" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when not yet marked Received & In Process", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...receivedNeft, financeReceivedAt: null }]);
    const res = await POST(req({ verifiedBy: "Sunil Salunke" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when already verified (double-action prevention)", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...receivedNeft, verifiedAt: new Date() }]);
    const res = await POST(req({ verifiedBy: "Sunil Salunke" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s for a name outside the fixed 4-person list", async () => {
    mocks.limit.mockResolvedValueOnce([receivedNeft]);
    const res = await POST(req({ verifiedBy: "Someone Else" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("verifies, writes an audit entry with the verifier as actor, and emails the submitter with the NEFT document label", async () => {
    mocks.limit.mockResolvedValueOnce([receivedNeft]);
    const res = await POST(req({ verifiedBy: "Abha Khatavkar" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedAt: expect.any(Date), verifiedBy: "Abha Khatavkar" }),
    );
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VERIFIED", actor: "Abha Khatavkar" }),
    );
    expect(mocks.notifyVerified).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedBy: "Abha Khatavkar", documentLabel: "Payment Advice" }),
      receivedNeft.submittedByEmail,
    );
  });

  it("rejects the old 'Aabha Khatavkar' misspelling — the authoritative list spells it 'Abha'", async () => {
    mocks.limit.mockResolvedValueOnce([receivedNeft]);
    const res = await POST(req({ verifiedBy: "Aabha Khatavkar" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("uses the Cash Payment Voucher document label for a Cash advice", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...receivedNeft, paymentMode: "CASH" }]);
    await POST(req({ verifiedBy: "Vaidehi Marathe" }), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(mocks.notifyVerified).toHaveBeenCalledWith(
      expect.objectContaining({ documentLabel: "Cash Payment Voucher" }),
      receivedNeft.submittedByEmail,
    );
  });
});

const verifiedRow = { verifiedAt: new Date(), verifiedBy: "Sunil Salunke" };

function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/verify`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/advice/[id]/verify — name correction only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the advice doesn't exist", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await PATCH(patchReq({ verifiedBy: "Vaidehi Marathe" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when not yet verified — nothing to correct", async () => {
    mocks.limit.mockResolvedValueOnce([{ verifiedAt: null, verifiedBy: null }]);
    const res = await PATCH(patchReq({ verifiedBy: "Vaidehi Marathe" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s for a name outside the fixed 4-person list", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedRow]);
    const res = await PATCH(patchReq({ verifiedBy: "Someone Else" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when the submitted name is already the recorded one — a no-op, not a correction", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedRow]);
    const res = await PATCH(patchReq({ verifiedBy: "Sunil Salunke" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("corrects verifiedBy only, leaves verifiedAt untouched, logs old+new name, and does not re-notify", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedRow]);
    const res = await PATCH(patchReq({ verifiedBy: "Vaidehi Marathe" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(200);
    const setArg = (mocks.txSet.mock.calls as unknown as [Record<string, unknown>][])[0][0];
    expect(setArg).toEqual(
      expect.objectContaining({ verifiedBy: "Vaidehi Marathe", updatedAt: expect.any(Date) }),
    );
    expect(setArg.verifiedAt).toBeUndefined();
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "VERIFIER_NAME_CORRECTED",
        actor: "ADMIN",
        details: { oldVerifiedBy: "Sunil Salunke", newVerifiedBy: "Vaidehi Marathe" },
      }),
    );
    expect(mocks.notifyVerified).not.toHaveBeenCalled();
  });
});
