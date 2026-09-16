import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  performVendorReviewAction: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/advice/vendor-review", () => ({
  performVendorReviewAction: mocks.performVendorReviewAction,
}));

import { POST } from "../../app/api/admin/vendor-review/[id]/route";

const adviceId = "11111111-1111-4111-8111-111111111111";
const vendorId = "22222222-2222-4222-8222-222222222222";

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/vendor-review/${adviceId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

describe("Finance Vendor Review API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSession.mockResolvedValue({
      adminUserId: "admin-id",
      fullName: "Sunil Salunke",
      roles: ["PAYMENT_ADVICE"],
      recommendingAuthorityId: null,
    });
    mocks.performVendorReviewAction.mockResolvedValue({
      ok: true,
      vendorId,
      companyName: "CANONICAL VENDOR",
      payeeAddress: "Pune",
      vendorCreated: false,
    });
  });

  it("rejects signed-out requests", async () => {
    mocks.getAdminSession.mockResolvedValue(null);
    const response = await POST(request({ action: "link", vendorId }), {
      params: Promise.resolve({ id: adviceId }),
    });
    expect(response.status).toBe(401);
    expect(mocks.performVendorReviewAction).not.toHaveBeenCalled();
  });

  it("rejects non-Finance dashboard roles", async () => {
    mocks.getAdminSession.mockResolvedValue({
      adminUserId: "authority-id",
      fullName: "Authority User",
      roles: ["AUTHORITY"],
      recommendingAuthorityId: "authority-record-id",
    });
    const response = await POST(request({ action: "link", vendorId }), {
      params: Promise.resolve({ id: adviceId }),
    });
    expect(response.status).toBe(403);
    expect(mocks.performVendorReviewAction).not.toHaveBeenCalled();
  });

  it("validates the selected vendor id", async () => {
    const response = await POST(request({ action: "link", vendorId: "not-a-uuid" }), {
      params: Promise.resolve({ id: adviceId }),
    });
    expect(response.status).toBe(400);
    expect(mocks.performVendorReviewAction).not.toHaveBeenCalled();
  });

  it("attributes a link to the signed-in Finance user and client IP", async () => {
    const response = await POST(request({ action: "link", vendorId }), {
      params: Promise.resolve({ id: adviceId }),
    });
    expect(response.status).toBe(200);
    expect(mocks.performVendorReviewAction).toHaveBeenCalledWith({
      adviceId,
      action: { action: "link", vendorId },
      actor: "Sunil Salunke",
      ipAddress: "203.0.113.10",
    });
  });

  it("accepts a corrected canonical name and optional address for creation", async () => {
    await POST(
      request({ action: "create", companyName: "  Correct Vendor  ", address: "  Pune  " }),
      { params: Promise.resolve({ id: adviceId }) },
    );
    expect(mocks.performVendorReviewAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: { action: "create", companyName: "Correct Vendor", address: "Pune" },
      }),
    );
  });

  it("returns transaction conflicts without masking the message", async () => {
    mocks.performVendorReviewAction.mockResolvedValue({
      ok: false,
      status: 409,
      error: "This submission is already linked to a vendor.",
    });
    const response = await POST(request({ action: "link", vendorId }), {
      params: Promise.resolve({ id: adviceId }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This submission is already linked to a vendor.",
    });
  });
});
