import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  performSendBack: vi.fn(async () => "edit-token-abc"),
  notifySentBack: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/advice/send-back", () => ({ performSendBack: mocks.performSendBack }));
vi.mock("@/lib/email/notify", () => ({ notifySentBack: mocks.notifySentBack }));

import { POST } from "../../app/api/admin/advice/[id]/send-back/route";

const ADVICE_ID = "44444444-4444-4444-8444-444444444444";

const baseAdvice = {
  status: "SUBMITTED",
  serialNo: "MCCIA/2026-27/0060",
  cashVoucherNo: null,
  paymentMode: "NEFT",
  submittedByName: "Priya Sharma",
  submittedByEmail: "priya@example.com",
  payeeName: "Acme Supplies",
  amount: "1000.00",
};

function mockQueries(advice: typeof baseAdvice | null, entryCount: number) {
  mocks.select
    .mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(advice ? [advice] : []) }) }),
    }))
    .mockImplementationOnce(() => ({
      from: () => ({ where: () => Promise.resolve([{ count: entryCount }]) }),
    }));
}

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/send-back`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/advice/[id]/send-back — payment_entries guard", () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.performSendBack.mockClear();
    mocks.notifySentBack.mockClear();
  });

  it("409s once a payment has been recorded against the advice, even though status is still SUBMITTED", async () => {
    mockQueries(baseAdvice, 1);
    const res = await POST(req({ adminRemarks: "please fix" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toContain("payment recorded");
    expect(mocks.performSendBack).not.toHaveBeenCalled();
  });

  it("still allows Send Back when no payment has been recorded", async () => {
    mockQueries(baseAdvice, 0);
    const res = await POST(req({ adminRemarks: "please fix" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.performSendBack).toHaveBeenCalledTimes(1);
  });

  it("Cash rows (never have payment_entries) are unaffected — 0 count always allows Send Back", async () => {
    mockQueries({ ...baseAdvice, paymentMode: "CASH" }, 0);
    const res = await POST(req({ adminRemarks: "please fix" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(200);
  });
});
