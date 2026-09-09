import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(), performFinalReject: vi.fn(), limit: vi.fn(),
  where: vi.fn(), from: vi.fn(), select: vi.fn(),
}));
mocks.where.mockImplementation(() => ({ limit: mocks.limit }));
mocks.from.mockImplementation(() => ({ where: mocks.where }));
mocks.select.mockImplementation(() => ({ from: mocks.from }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/advice/reject", () => ({ performFinalReject: mocks.performFinalReject }));

import { POST } from "../../app/api/admin/advice/[id]/reject/route";

const id = "11111111-1111-4111-8111-111111111111";
const advice = { id, serialNo: "MCCIA/2026-27/0055", cashVoucherNo: null, advanceNo: null, isAdvance: false, paymentMode: "NEFT", submittedByName: "Sonal", submittedByEmail: "sonal@example.com", payeeName: "Vendor", amount: "1000.00" };
const request = (body: unknown) => new NextRequest(`http://localhost/api/admin/advice/${id}/reject`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("Finance Admin final Reject API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getAdminSession.mockResolvedValue({ fullName: "Sunil", roles: ["PAYMENT_ADVICE"] }); mocks.limit.mockResolvedValue([advice]); });
  it("requires remarks", async () => { const response = await POST(request({ remarks: " " }), { params: Promise.resolve({ id }) }); expect(response.status).toBe(400); expect(mocks.performFinalReject).not.toHaveBeenCalled(); });
  it("blocks server-side when the atomic action reports payment/closed state", async () => { mocks.performFinalReject.mockResolvedValue(null); const response = await POST(request({ remarks: "Duplicate" }), { params: Promise.resolve({ id }) }); expect(response.status).toBe(409); });
  it("records an eligible rejection as the signed-in Finance user", async () => { mocks.performFinalReject.mockResolvedValue(new Date("2026-09-09T10:00:00Z")); const response = await POST(request({ remarks: "Duplicate" }), { params: Promise.resolve({ id }) }); expect(response.status).toBe(200); expect(mocks.performFinalReject).toHaveBeenCalledWith(expect.objectContaining({ actor: "Sunil", remarks: "Duplicate", advice })); });
});
