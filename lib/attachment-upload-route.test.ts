import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handleUpload: vi.fn(async () => ({ type: "blob.generate-client-token", clientToken: "t" })) }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));

import { POST } from "@/app/api/attachments/upload/route";

const tokenRequest = (ip: string) => new Request("http://localhost/api/attachments/upload", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": ip },
  body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "pending-uploads/x/a.pdf", clientPayload: null, multipart: false } }),
});

describe("POST /api/attachments/upload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the existing 10 MB per-file cap and PDF/JPEG/PNG types", async () => {
    await POST(tokenRequest("192.0.2.1"));
    const options = (mocks.handleUpload.mock.calls[0] as unknown as [{ onBeforeGenerateToken: (pathname: string) => Promise<unknown> }])[0];
    await expect(options.onBeforeGenerateToken("pending-uploads/x/a.pdf")).resolves.toMatchObject({ maximumSizeInBytes: 10 * 1024 * 1024, allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"] });
    await expect(options.onBeforeGenerateToken("pending-uploads/x/a.exe")).rejects.toThrow("Only PDF, JPEG, and PNG");
  });

  it("rate limits upload-token requests per IP (120 per 10 minutes per instance) with 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 121; i++) statuses.push((await POST(tokenRequest("192.0.2.50"))).status);
    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
    expect((await POST(tokenRequest("192.0.2.51"))).status).toBe(200);
  });

  it("never rate limits Blob's upload-completed callback", async () => {
    for (let i = 0; i < 130; i++) await POST(tokenRequest("192.0.2.60"));
    const callback = new Request("http://localhost/api/attachments/upload", { method: "POST", headers: { "x-forwarded-for": "192.0.2.60" }, body: JSON.stringify({ type: "blob.upload-completed", payload: {} }) });
    expect((await POST(callback)).status).toBe(200);
  });
});
