import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const select = vi.fn(() => ({
    from: () => ({ where: () => ({ limit }) }),
  }));
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const txExecute = vi.fn();
  const txSelectWhere = vi.fn();
  const txSelect = vi.fn(() => ({
    from: () => ({ where: txSelectWhere }),
  }));
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      execute: txExecute,
      select: txSelect,
      update: txUpdate,
      insert: txInsert,
    }),
  );
  const getAdminSession = vi.fn();
  return {
    limit,
    select,
    update,
    updateSet,
    txExecute,
    txSelectWhere,
    txUpdateSet,
    txInsertValues,
    transaction,
    getAdminSession,
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, update: mocks.update, transaction: mocks.transaction },
}));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));

import { PATCH } from "../../app/api/admin/advice/[id]/route";

const ADVICE_ID = "33333333-3333-4333-8333-333333333333";
const verifiedNeft = {
  status: "SUBMITTED",
  paymentMode: "NEFT",
  amount: "11800.00",
  basicAmount: "10000.00",
  isAdvance: false,
  verifiedAt: new Date(),
};

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function lockedRow(overrides: Record<string, unknown> = {}) {
  return {
    rows: [{
      status: "SUBMITTED",
      payment_mode: "NEFT",
      is_advance: false,
      amount: "11800.00",
      basic_amount: "10000.00",
      ...overrides,
    }],
  };
}

describe("PATCH /api/admin/advice/[id] payable calculator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSession.mockResolvedValue({
      adminUserId: "admin-1",
      fullName: "Sunil Salunke",
      roles: ["PAYMENT_ADVICE"],
      recommendingAuthorityId: null,
    });
    mocks.limit.mockResolvedValue([verifiedNeft]);
    mocks.txExecute.mockResolvedValue(lockedRow());
    mocks.txSelectWhere.mockResolvedValue([{ count: 0 }]);
  });

  it("requires an authenticated Finance session", async () => {
    mocks.getAdminSession.mockResolvedValueOnce(null);
    const response = await PATCH(request({}), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("has no Bill Passed For gate and saves the required worked example as payable 9,000", async () => {
    const response = await PATCH(
      request({ arrearsAmount: null, currentTdsPercent: 10 }),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ payableAmount: "9000.00" }));
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      arrearsAmount: "0.00",
      arrearsTdsPercent: "10.00",
      currentTdsPercent: "10.00",
      payableAmount: "9000.00",
    }));
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: "PAYABLE_CALCULATION_SAVED",
      actor: "Sunil Salunke",
    }));
  });

  it("applies the one shared TDS rate to Basic and arrears", async () => {
    const response = await PATCH(
      request({ arrearsAmount: 20_000, currentTdsPercent: 10 }),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      currentTdsAmount: "1000.00",
      arrearsTdsAmount: "2000.00",
      totalTdsAmount: "3000.00",
      payableAmount: "7000.00",
    }));
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      arrearsAmount: "20000.00",
      arrearsTdsPercent: "10.00",
      currentTdsPercent: "10.00",
      payableAmount: "7000.00",
    }));
  });

  it("locks atomically once any payment entry exists", async () => {
    mocks.txSelectWhere.mockResolvedValueOnce([{ count: 1 }]);
    const response = await PATCH(
      request({ arrearsAmount: 500, currentTdsPercent: 10 }),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("locked");
    expect(mocks.txUpdateSet).not.toHaveBeenCalled();
  });

  it("uses the submitted amount as Basic for Advance and accepts the exact 31.2% option", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verifiedNeft, isAdvance: true, basicAmount: null }]);
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ is_advance: true, basic_amount: null, amount: "10000.00" }));
    const response = await PATCH(
      request({ arrearsAmount: null, currentTdsPercent: 31.2 }),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).payableAmount).toBe("6880.00");
  });

  it("rejects percentages outside the approved six options", async () => {
    const response = await PATCH(
      request({ arrearsAmount: null, currentTdsPercent: 3 }),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("preserves the regular Cash Voucher Bill Passed For save unchanged", async () => {
    mocks.limit.mockResolvedValueOnce([{
      ...verifiedNeft,
      paymentMode: "CASH",
      basicAmount: null,
      isAdvance: false,
    }]);
    const response = await PATCH(
      request({ billPassedFor: 700 }),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ billPassedFor: "700.00" }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
