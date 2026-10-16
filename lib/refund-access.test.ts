import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRefundNo } from "@/lib/serial";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], select: vi.fn(), insertValues: vi.fn(async () => undefined), render: vi.fn(async () => Buffer.from("%PDF-refund")) }));
vi.mock("@/lib/db", () => {
  const chain = () => { const node: Record<string, unknown> = {}; for (const m of ["from", "where"]) node[m] = () => node; node.limit = async () => mocks.rows; return node; };
  mocks.select.mockImplementation(chain);
  return { db: { select: mocks.select, insert: () => ({ values: mocks.insertValues }) } };
});
vi.mock("@/lib/pdf/render-refund-request", () => ({ renderRefundRequestPdf: mocks.render }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import { GET as pdf } from "@/app/api/refund/[id]/pdf/route";
import RefundSubmittedPage from "@/app/refund/submitted/[id]/page";

const ID = "99999999-9999-4999-8999-999999999999";
const ROW = { id: ID, serialNo: "REF/MCCIA/2026-27/0007", submittedByName: "Test Submitter", totalAmount: "1180.30", documents: [{ type: "EMAIL_COPY", fileName: "mail.pdf", blobPathname: "pending-uploads/x", blobUrl: "https://secret.blob", sizeBytes: 1 }] };
const call = (id: string, query = "") => pdf(new NextRequest(`http://localhost/api/refund/${id}/pdf${query}`), { params: Promise.resolve({ id }) });

describe("Refund PDF and confirmation page access", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rows = [ROW]; });
  afterEach(() => vi.unstubAllEnvs());

  it("both are 404 while the flag is off, without querying the (possibly missing) table", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "");
    expect((await call(ID)).status).toBe(404);
    await expect(RefundSubmittedPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("malformed and unknown ids are 404", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    expect((await call("1 or 1=1")).status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
    mocks.rows = [];
    expect((await call(ID)).status).toBe(404);
    await expect(RefundSubmittedPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("a saved request renders from the DB, with the serial as filename, audit entry, and no Blob URLs passed to the PDF", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    const response = await call(ID, "?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="REF-MCCIA-2026-27-0007.pdf"');
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ serialNo: "REF/MCCIA/2026-27/0007", documents: [{ type: "EMAIL_COPY", fileName: "mail.pdf" }] }));
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ refundRequestId: ID, action: "REFUND_REQUEST_PDF_GENERATED" }));
  });
});

describe("formatRefundNo", () => {
  it("zero-pads to 4 digits on its own REF/MCCIA series", () => {
    expect(formatRefundNo("2026-27", 7)).toBe("REF/MCCIA/2026-27/0007");
    expect(formatRefundNo("2026-27", 12345)).toBe("REF/MCCIA/2026-27/12345");
  });
});
