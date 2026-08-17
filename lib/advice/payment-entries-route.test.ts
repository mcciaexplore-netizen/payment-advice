import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  const txExecute = vi.fn();
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn<(values: Record<string, unknown>) => { where: typeof txUpdateWhere }>(
    () => ({ where: txUpdateWhere }),
  );
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ execute: txExecute, insert: txInsert, update: txUpdate }),
  );

  const notifyPaymentEntry = vi.fn();
  const getAdminSession = vi.fn(
    async (): Promise<{ adminUserId: string; fullName: string; adminRole: string } | null> => ({
      adminUserId: "admin-1",
      fullName: "Sunil Salunke",
      adminRole: "PAYMENT_ADVICE",
    }),
  );

  return {
    limit,
    select,
    txExecute,
    txInsert,
    txInsertValues,
    txUpdate,
    txUpdateSet,
    transaction,
    notifyPaymentEntry,
    getAdminSession,
  };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("@/lib/email/notify", () => ({ notifyPaymentEntry: mocks.notifyPaymentEntry }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));

import { POST } from "../../app/api/admin/advice/[id]/payment-entries/route";

const ADVICE_ID = "22222222-2222-4222-8222-222222222222";

const verifiedNeft = {
  paymentMode: "NEFT",
  serialNo: "MCCIA/2026-27/0050",
  cashVoucherNo: null,
  submittedByName: "Priya Sharma",
  submittedByEmail: "priya@example.com",
  payeeName: "Acme Supplies",
  formDate: "2026-08-01",
  verifiedAt: new Date(),
};

function lockedRow(overrides: Partial<{ bill_passed_for: string | null; total_paid: string; status: string }> = {}) {
  return { rows: [{ bill_passed_for: "1000.00", total_paid: "0.00", status: "SUBMITTED", ...overrides }] };
}

function req(body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/payment-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/admin/advice/[id]/payment-entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSession.mockResolvedValue({
      adminUserId: "admin-1",
      fullName: "Sunil Salunke",
      adminRole: "PAYMENT_ADVICE",
    });
  });

  it("401s when not signed in", async () => {
    mocks.getAdminSession.mockResolvedValueOnce(null);
    const res = await POST(req({ amount: 100, remarks: "test" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("404s when the advice doesn't exist", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req({ amount: 100, remarks: "test" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s for a Cash advice — Record a Payment is NEFT-only", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verifiedNeft, paymentMode: "CASH" }]);
    const res = await POST(req({ amount: 100, remarks: "test" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when not yet verified", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verifiedNeft, verifiedAt: null }]);
    const res = await POST(req({ amount: 100, remarks: "test" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s when remarks are missing", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    const res = await POST(req({ amount: 100, remarks: "" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s when amount is not positive", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    const res = await POST(req({ amount: 0, remarks: "GST portion" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s inside the transaction if the row somehow no longer exists", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    mocks.txExecute.mockResolvedValueOnce({ rows: [] });
    const res = await POST(req({ amount: 100, remarks: "test" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(404);
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it("409s inside the transaction if it was already fully settled by a concurrent request (race safety)", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ status: "APPROVED" }));
    const res = await POST(req({ amount: 100, remarks: "test" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it("400s when bill_passed_for was never saved", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ bill_passed_for: null }));
    const res = await POST(req({ amount: 100, remarks: "test" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it("400s when the amount exceeds the remaining balance (bill_passed_for minus prior entries, not the raw Total)", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ bill_passed_for: "1000.00", total_paid: "800.00" }));
    const res = await POST(req({ amount: 300, remarks: "too much" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("200.00");
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it("records a partial payment: updates total_paid, does NOT dual-write status/approvedAt/approvedByName, and emails isFinal:false", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ bill_passed_for: "1000.00", total_paid: "0.00" }));
    const res = await POST(req({ amount: 400, remarks: "Basic Amount paid now" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isFinal).toBe(false);
    expect(data.totalPaid).toBe("400.00");
    expect(data.remaining).toBe("600.00");

    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentAdviceId: ADVICE_ID,
        amount: "400.00",
        remarks: "Basic Amount paid now",
        paidBy: "Sunil Salunke",
      }),
    );
    const updateCall = mocks.txUpdateSet.mock.calls.find((call) =>
      Object.prototype.hasOwnProperty.call(call[0], "totalPaid"),
    );
    expect(updateCall?.[0]).toEqual(
      expect.objectContaining({ totalPaid: "400.00" }),
    );
    expect(updateCall?.[0]).not.toHaveProperty("status");
    expect(updateCall?.[0]).not.toHaveProperty("approvedAt");
    expect(updateCall?.[0]).not.toHaveProperty("approvedByName");

    expect(mocks.notifyPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ isFinal: false, entryAmount: "400.00" }),
      verifiedNeft.submittedByEmail,
      ADVICE_ID,
    );
  });

  it("records the final payment: dual-writes status/approvedAt/approvedByName and emails isFinal:true", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    mocks.txExecute.mockResolvedValueOnce(lockedRow({ bill_passed_for: "1000.00", total_paid: "600.00" }));
    const res = await POST(req({ amount: 400, remarks: "GST portion recovered, paying now" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isFinal).toBe(true);
    expect(data.totalPaid).toBe("1000.00");
    expect(data.remaining).toBe("0.00");

    const updateCall = mocks.txUpdateSet.mock.calls.find((call) =>
      Object.prototype.hasOwnProperty.call(call[0], "totalPaid"),
    );
    expect(updateCall?.[0]).toEqual(
      expect.objectContaining({
        totalPaid: "1000.00",
        status: "APPROVED",
        approvedAt: expect.any(Date),
        approvedByName: "Sunil Salunke",
      }),
    );

    expect(mocks.notifyPaymentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ isFinal: true }),
      verifiedNeft.submittedByEmail,
      ADVICE_ID,
    );
  });

  it("writes a PAYMENT_ENTRY_RECORDED audit_log row", async () => {
    mocks.limit.mockResolvedValueOnce([verifiedNeft]);
    mocks.txExecute.mockResolvedValueOnce(lockedRow());
    await POST(req({ amount: 250, remarks: "First installment" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    const auditCall = mocks.txInsertValues.mock.calls.find(
      (call) => call[0]?.action === "PAYMENT_ENTRY_RECORDED",
    );
    expect(auditCall).toBeDefined();
    expect(auditCall?.[0]).toEqual(
      expect.objectContaining({ paymentAdviceId: ADVICE_ID, actor: "Sunil Salunke" }),
    );
  });
});
