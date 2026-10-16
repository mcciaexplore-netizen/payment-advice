import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ head: vi.fn(), get: vi.fn() }));
vi.mock("@vercel/blob", () => ({ head: mocks.head, get: mocks.get }));

import { POST } from "@/app/api/invoice-autofill/route";

const originalApiKey = process.env.GEMINI_API_KEY;
let ipCounter = 0;
const json = (body: unknown, ip = `198.18.0.${++ipCounter}`) => new Request("http://localhost/api/invoice-autofill", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
  body: JSON.stringify(body),
});
const VALID = { pathname: "pending-uploads/batch/TAX_INVOICE-invoice.pdf" };

describe("invoice auto-fill route", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  it("missing Gemini key: 503 with a generic message that names no env var or local path", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await POST(json(VALID));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ autoFill: null, error: "Invoice auto-fill is not available right now. Please fill the form manually." });
    expect(JSON.stringify(body)).not.toMatch(/GEMINI|BLOB_READ_WRITE_TOKEN|\.env|payment-advice\//);
  });

  it("does not reveal invalid paths or try to read them", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const response = await POST(json({ pathname: "pending-uploads/batch/OTHER-document.pdf" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ autoFill: null, error: "The uploaded invoice reference is invalid. Attach the file again." });
    expect(mocks.head).not.toHaveBeenCalled();
  });

  it("accepts Blob paths only: a direct multipart file upload is rejected without reading it", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const form = new FormData();
    form.set("file", new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" }));
    const response = await POST(new Request("http://localhost/api/invoice-autofill", { method: "POST", body: form, headers: { "x-forwarded-for": "198.18.1.1" } }));
    expect(response.status).toBe(400);
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("rejects a stored file over 10 MB or of the wrong type before reading it", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.head.mockResolvedValueOnce({ size: 11 * 1024 * 1024, contentType: "application/pdf" });
    expect((await POST(json(VALID))).status).toBe(400);
    mocks.head.mockResolvedValueOnce({ size: 1000, contentType: "text/html" });
    expect((await POST(json(VALID))).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("never buffers more than 10 MB even if the metadata understates the size", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.head.mockResolvedValueOnce({ size: 1000, contentType: "application/pdf" });
    const chunk = new Uint8Array(4 * 1024 * 1024);
    mocks.get.mockResolvedValueOnce({ statusCode: 200, stream: new ReadableStream({ start(controller) { for (let i = 0; i < 3; i++) controller.enqueue(chunk); controller.close(); } }) });
    const response = await POST(json(VALID));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Invoice reading failed. Try again with a clearer PDF or image, or fill the form manually.");
  });

  it("rate limits per IP with 429 (20 per 10 minutes per instance)", async () => {
    delete process.env.GEMINI_API_KEY;
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await POST(json(VALID, "198.18.9.9"))).status);
    expect(statuses.slice(0, 20).every((status) => status === 503)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
