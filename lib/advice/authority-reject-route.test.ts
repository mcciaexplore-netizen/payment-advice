import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const performSendBack = vi.fn();
  const notifySentBack = vi.fn();
  return { limit, select, performSendBack, notifySentBack };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/advice/send-back", () => ({ performSendBack: mocks.performSendBack }));
vi.mock("@/lib/email/notify", () => ({ notifySentBack: mocks.notifySentBack }));

import { POST } from "../../app/api/authority-approval/[token]/reject/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";
const pending = {
  id: ADVICE_ID,
  serialNo: "MCCIA/2026-27/0001",
  submittedByName: "Priya Sharma",
  submittedByEmail: "priya@example.com",
  payeeName: "Acme Supplies",
  amount: "1250.00",
  authorityApprovedAt: null,
  authorityRejectedAt: null,
  authorityTokenExpiresAt: null,
  recommendingAuthorityId: "22222222-2222-4222-8222-222222222222",
};

function req(body: unknown) {
  return new NextRequest("http://localhost/api/authority-approval/t/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/authority-approval/[token]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.performSendBack.mockResolvedValue("new-edit-token");
  });

  it("404s when the token doesn't match any advice", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const res = await POST(req({ remarks: "Please fix the amount" }), {
      params: Promise.resolve({ token: "bad-token" }),
    });
    expect(res.status).toBe(404);
    expect(mocks.performSendBack).not.toHaveBeenCalled();
  });

  it("409s when already actioned (double-action prevention)", async () => {
    mocks.limit.mockResolvedValueOnce([{ ...pending, authorityApprovedAt: new Date() }]);
    const res = await POST(req({ remarks: "Please fix the amount" }), {
      params: Promise.resolve({ token: "t" }),
    });
    expect(res.status).toBe(409);
    expect(mocks.performSendBack).not.toHaveBeenCalled();
  });

  it("400s when remarks are missing", async () => {
    mocks.limit.mockResolvedValueOnce([pending]);
    const res = await POST(req({}), { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(400);
    expect(mocks.performSendBack).not.toHaveBeenCalled();
  });

  it("reuses the existing send-back/edit-token flow and notifies the submitter as the authority", async () => {
    mocks.limit
      .mockResolvedValueOnce([pending]) // advice lookup
      .mockResolvedValueOnce([{ authorityName: "Asha Rao" }]); // authority name lookup
    const res = await POST(req({ remarks: "Please fix the amount" }), {
      params: Promise.resolve({ token: "t" }),
    });
    expect(res.status).toBe(200);

    expect(mocks.performSendBack).toHaveBeenCalledWith(
      expect.objectContaining({
        adviceId: ADVICE_ID,
        remarks: "Please fix the amount",
        actor: "Asha Rao",
        authorityRejection: true,
      }),
    );

    expect(mocks.notifySentBack).toHaveBeenCalledWith(
      expect.objectContaining({
        serialNo: pending.serialNo,
        sentBackBy: "Asha Rao",
        remarks: "Please fix the amount",
        editLink: expect.stringContaining("/edit/new-edit-token"),
      }),
      pending.submittedByEmail,
    );
  });
});
