import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const txExecute = vi.fn();
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ execute: txExecute, update: txUpdate, insert: txInsert }),
  );
  const getAdminSession = vi.fn();
  return {
    txExecute,
    txUpdateSet,
    txInsertValues,
    transaction,
    getAdminSession,
  };
});

vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));

import { POST } from "../../app/api/admin/advice/[id]/gst-settlements/route";

const ADVICE_ID = "44444444-4444-4444-8444-444444444444";

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/gst-settlements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function lockedRow(overrides: Record<string, unknown> = {}) {
  return {
    rows: [{
      payment_mode: "NEFT",
      is_advance: false,
      gst_amount: "1800.00",
      verified_at: new Date(),
      status: "SUBMITTED",
      gst_settled: false,
      ...overrides,
    }],
  };
}

describe("POST /api/admin/advice/[id]/gst-settlements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSession.mockResolvedValue({
      adminUserId: "admin-1",
      fullName: "Sunil Salunke",
      roles: ["PAYMENT_ADVICE"],
      recommendingAuthorityId: null,
    });
    mocks.txExecute.mockResolvedValue(lockedRow());
  });

  it("marks the advice settled with the signed-in actor/time and no amount or remarks", async () => {
    const response = await POST(request({ settled: true }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      gstSettled: true,
      gstSettledBy: "Sunil Salunke",
    }));
    expect(body).not.toHaveProperty("amount");
    expect(body).not.toHaveProperty("remarks");
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      gstSettled: true,
      gstSettledBy: "Sunil Salunke",
      gstSettledAt: expect.any(Date),
    }));
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: "GST_SETTLEMENT_RECORDED",
      actor: "Sunil Salunke",
      details: { gstSettled: true },
    }));
  });

  it("accepts only the explicit Yes value", async () => {
    const response = await POST(request({ settled: false }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("remains available after the main payment has reached its terminal state", async () => {
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ status: "APPROVED" }));
    const response = await POST(request({ settled: true }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(response.status).toBe(200);
  });

  it("does not allow the actor/time to be overwritten once settled", async () => {
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ gst_settled: true }));
    const response = await POST(request({ settled: true }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(response.status).toBe(409);
    expect(mocks.txUpdateSet).not.toHaveBeenCalled();
  });

  it("is unavailable for Advance even when its payment mode is NEFT", async () => {
    mocks.txExecute.mockResolvedValueOnce(
      lockedRow({ payment_mode: "NEFT", is_advance: true, gst_amount: null }),
    );
    const response = await POST(request({ settled: true }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(response.status).toBe(409);
  });

  it("is unavailable for regular Cash Voucher", async () => {
    mocks.txExecute.mockResolvedValueOnce(
      lockedRow({ payment_mode: "CASH", gst_amount: null }),
    );
    const response = await POST(request({ settled: true }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(response.status).toBe(409);
  });

  it("is unavailable when the submitted GST amount is zero", async () => {
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ gst_amount: "0.00" }));
    const response = await POST(request({ settled: true }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(response.status).toBe(409);
  });
});
