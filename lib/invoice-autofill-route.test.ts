import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/invoice-autofill/route";

const originalApiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
});

describe("invoice auto-fill route", () => {
  it("silently falls back when the Gemini secret has not been configured", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await POST(
      new Request("http://localhost/api/invoice-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: "pending-uploads/batch/TAX_INVOICE-invoice.pdf" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ autoFill: null });
  });

  it("does not reveal invalid paths or try to read them", async () => {
    const response = await POST(
      new Request("http://localhost/api/invoice-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: "pending-uploads/batch/OTHER-document.pdf" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ autoFill: null });
  });
});
