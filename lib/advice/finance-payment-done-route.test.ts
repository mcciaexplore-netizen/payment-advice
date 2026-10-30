import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  // The write is conditional (stage still open) and returns the updated row;
  // an empty result means someone else already did it (see
  // lib/advice/finance-stage-actions.ts).
  const txReturning = vi.fn(async () => [{ id: "updated" }]);
  const txSet = vi.fn(() => ({ where: vi.fn(() => ({ returning: txReturning })) }));
  const txUpdate = vi.fn(() => ({ set: txSet }));
  const txValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txValues }));
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
    cb({ update: txUpdate, insert: txInsert }),
  );
  const notifyPaymentDone = vi.fn();
  const getAdminSession = vi.fn(
    async (): Promise<{ adminUserId: string; fullName: string; roles?: string[]; adminRole?: string; recommendingAuthorityId?: null } | null> => ({
      adminUserId: "admin-1",
      fullName: "Sunil Salunke",
      adminRole: "PAYMENT_ADVICE",
    }),
  );
  return { limit, select, txSet, txReturning, txInsert, txValues, transaction, notifyPaymentDone, getAdminSession };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("@/lib/email/notify", () => ({ notifyPaymentDone: mocks.notifyPaymentDone }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));

import { POST } from "../../app/api/admin/advice/[id]/payment-done/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";

const verified = {
  status: "SUBMITTED",
  serialNo: "MCCIA/2026-27/0001",
  submittedByName: "Priya Sharma",
  submittedByEmail: "priya@example.com",
  payeeName: "Acme Supplies",
  amount: "1250.00",
  formDate: "2026-07-28",
  paymentMode: "NEFT",
  billPassedFor: "1200.00",
  payableAmount: null,
  isAdvance: false,
  verifiedAt: new Date(),
  paymentDoneAt: null,
};

function req(body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/payment-done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/admin/advice/[id]/payment-done", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSession.mockResolvedValue({
      adminUserId: "admin-1",
      fullName: "Sunil Salunke",
      // Cash Payment Done is CASH_VOUCHER or ALL only since 2026-10-30. ALL
      // owns every mode, so these existing cases (some with an NEFT fixture
      // from before NEFT moved to payment-entries) keep their assertions.
      roles: ["ALL"],
      recommendingAuthorityId: null,
    });
  });

  it("401s when not signed in", async () => {
    mocks.getAdminSession.mockResolvedValueOnce(null);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("404s when the advice doesn't exist", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when not yet verified", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, verifiedAt: null }]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when already marked Payment Done (double-action prevention)", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, paymentDoneAt: new Date() }]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when status is already APPROVED even if paymentDoneAt somehow lagged", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, status: "APPROVED", paymentDoneAt: null }]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s when Bill passed for Rs. has never been saved and isn't provided in the request", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, billPassedFor: null }]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s when billPassedFor exceeds the billed amount", async () => {
    mocks.limit.mockResolvedValueOnce([verified]);
    const res = await POST(req({ billPassedFor: 999999 }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("marks Payment Done, auto-attributing from the session (no picker), and dual-writes status/approvedAt/approvedByName so existing readers (Excel export, PDF) keep working", async () => {
    mocks.limit.mockResolvedValueOnce([verified]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentDoneAt: expect.any(Date),
        paymentDoneBy: "Sunil Salunke",
        status: "APPROVED",
        approvedAt: expect.any(Date),
        approvedByName: "Sunil Salunke",
      }),
    );
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PAYMENT_DONE", actor: "Sunil Salunke" }),
    );
    expect(mocks.notifyPaymentDone).toHaveBeenCalledWith(
      expect.objectContaining({ displayNo: verified.serialNo, documentLabel: "Payment Advice" }),
      verified.submittedByEmail,
      ADVICE_ID,
    );
  });

  it("falls back to the already-saved billPassedFor when the request omits it", async () => {
    mocks.limit.mockResolvedValueOnce([verified]); // billPassedFor: "1200.00" already saved
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ billPassedFor: "1200.00" }));
  });

  it("uses the Cash Payment Voucher document label for a Cash advice", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, paymentMode: "CASH" }]);
    await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(mocks.notifyPaymentDone).toHaveBeenCalledWith(
      expect.objectContaining({ documentLabel: "Cash Payment Voucher" }),
      verified.submittedByEmail,
      ADVICE_ID,
    );
  });

  it("uses payable_amount for a Cash-routed Advance without writing the retired bill_passed_for field", async () => {
    mocks.limit.mockResolvedValueOnce([{
      ...verified,
      paymentMode: "CASH",
      isAdvance: true,
      advanceNo: "ADV/MCCIA/2026-27/0001",
      billPassedFor: null,
      payableAmount: "900.00",
    }]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(200);
    const setArg = (mocks.txSet.mock.calls as unknown as [Record<string, unknown>][]) [0][0];
    expect(setArg.billPassedFor).toBeUndefined();
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ payableAmount: 900 }) }),
    );
  });

  it("attributes to whichever real name is on the session, e.g. the ALL-role account", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({
      adminUserId: "admin-3",
      fullName: "MCCIA Finance (All Access)",
      roles: ["ALL"],
      recommendingAuthorityId: null,
    });
    mocks.limit.mockResolvedValueOnce([verified]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ paymentDoneBy: "MCCIA Finance (All Access)" }),
    );
  });

  it("403s for a Payment Advice account (Cash Payment Done is Cash Voucher or All only) and writes nothing", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "admin-1", fullName: "Sunil Salunke", roles: ["PAYMENT_ADVICE"], recommendingAuthorityId: null });
    mocks.limit.mockResolvedValueOnce([{ ...verified, paymentMode: "CASH" }]);
    const res = await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only a Cash Voucher account (or an All-Access account) can mark this Payment Done." });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.notifyPaymentDone).not.toHaveBeenCalled();
  });

  it("a Cash Voucher account can mark a Cash advice Payment Done", async () => {
    mocks.getAdminSession.mockResolvedValueOnce({ adminUserId: "a-2", fullName: "Abha Khatavkar", roles: ["CASH_VOUCHER"], recommendingAuthorityId: null });
    mocks.limit.mockResolvedValueOnce([{ ...verified, paymentMode: "CASH" }]);
    expect((await POST(req(), { params: Promise.resolve({ id: ADVICE_ID }) })).status).toBe(200);
  });
});
