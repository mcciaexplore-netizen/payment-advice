import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/invoice-autofill/route";

const originalApiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
});

describe("invoice auto-fill route", () => {
  it("returns a clear configuration error when the Gemini secret is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await POST(
      new Request("http://localhost/api/invoice-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: "pending-uploads/batch/TAX_INVOICE-invoice.pdf" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      autoFill: null,
      error: expect.stringContaining("GEMINI_API_KEY"),
    });
  });

  it("does not reveal invalid paths or try to read them", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const response = await POST(
      new Request("http://localhost/api/invoice-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: "pending-uploads/batch/OTHER-document.pdf" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      autoFill: null,
      error: "The uploaded invoice reference is invalid. Attach the file again.",
    });
  });

  it("rejects an invalid local file upload without trying to read it", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const form = new FormData();
    form.set("file", new File(["not an invoice"], "invoice.txt", { type: "text/plain" }));
    const response = await POST(new Request("http://localhost/api/invoice-autofill", { method: "POST", body: form }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ autoFill: null, error: expect.stringContaining("PDF, JPEG, or PNG") });
  });
});
