import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/refund/submit/route";

const originalNodeEnv = process.env.NODE_ENV;
const originalRefundFlag = process.env.REFUND_REQUESTS_ENABLED;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalRefundFlag === undefined) delete process.env.REFUND_REQUESTS_ENABLED;
  else process.env.REFUND_REQUESTS_ENABLED = originalRefundFlag;
});

describe("POST /api/refund/submit", () => {
  it("requires the Payee / Company Name", async () => {
    process.env.NODE_ENV = "development";
    const form = new FormData();
    form.set("submittedByName", "Test Submitter");
    form.set("submittedByEmail", "submitter@example.com");
    form.set("submittedByDepartment", "Finance");
    form.set("branch", "Tilak Road Office");
    form.set("recommendingAuthority", "Test Authority");
    form.set("payeeDetails", "   ");
    form.set("basicAmount", "100");
    form.set("gstAmount", "0");
    form.set("natureOfExpenditure", "Test refund");
    form.set("fromDate", "2026-10-01");
    form.set("documents", "[]");

    const response = await POST(new Request("http://localhost/api/refund/submit", { method: "POST", body: form }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Payee / Company Name is required" });
  });

  it("stays disabled in production until the migration owner enables the feature flag", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.REFUND_REQUESTS_ENABLED;

    const response = await POST(new Request("http://localhost/api/refund/submit", { method: "POST" }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "Refund requests are not enabled yet." });
  });
});
