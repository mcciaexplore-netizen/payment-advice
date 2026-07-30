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

import { POST } from "../../app/api/admin/advice/[id]/sanction/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";

const verified = {
  status: "SUBMITTED",
  amount: "1250.00",
  billPassedFor: "1200.00",
  verifiedAt: new Date(),
  sanctionedAt: null,
};

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/sanction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/advice/[id]/sanction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s when the advice doesn't exist", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req({ sanctionedBy: "Chintamani Shrotri" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when not yet verified", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, verifiedAt: null }]);
    const res = await POST(req({ sanctionedBy: "Chintamani Shrotri" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when already sanctioned (double-action prevention)", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, sanctionedAt: new Date() }]);
    const res = await POST(req({ sanctionedBy: "Chintamani Shrotri" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409s when status is already APPROVED even if sanctionedAt somehow lagged", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, status: "APPROVED", sanctionedAt: null }]);
    const res = await POST(req({ sanctionedBy: "Chintamani Shrotri" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s for a name outside the fixed 2-person list", async () => {
    mocks.limit.mockResolvedValueOnce([verified]);
    const res = await POST(req({ sanctionedBy: "Someone Else" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s when Bill passed for Rs. has never been saved and isn't provided in the request", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...verified, billPassedFor: null }]);
    const res = await POST(req({ sanctionedBy: "Chintamani Shrotri" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400s when billPassedFor exceeds the billed amount", async () => {
    mocks.limit.mockResolvedValueOnce([verified]);
    const res = await POST(
      req({ sanctionedBy: "Chintamani Shrotri", billPassedFor: 999999 }),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("sanctions, dual-writing status/approvedAt/approvedByName so existing readers (Excel export, PDF) keep working", async () => {
    mocks.limit.mockResolvedValueOnce([verified]);
    const res = await POST(req({ sanctionedBy: "DG" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sanctionedAt: expect.any(Date),
        sanctionedBy: "DG",
        status: "APPROVED",
        approvedAt: expect.any(Date),
        approvedByName: "DG",
      }),
    );
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SANCTIONED", actor: "DG" }),
    );
  });

  it("falls back to the already-saved billPassedFor when the request omits it", async () => {
    mocks.limit.mockResolvedValueOnce([verified]); // billPassedFor: "1200.00" already saved
    const res = await POST(req({ sanctionedBy: "DG" }), {
      params: Promise.resolve({ id: ADVICE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ billPassedFor: "1200.00" }));
  });
});
