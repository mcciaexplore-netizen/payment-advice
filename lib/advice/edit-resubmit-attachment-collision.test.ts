import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORITY_ID = "22222222-2222-4222-8222-222222222222";
const EDIT_TOKEN = "existing-edit-token";
const OLD_PATH = "advices/MCCIA/2026-27/0001/TAX_INVOICE-invoice.pdf";
const NEW_PATH = "pending-uploads/batch/TAX_INVOICE-invoice-random.pdf";

const mocks = vi.hoisted(() => {
  const del = vi.fn(async () => {});
  const head = vi.fn(async (pathname: string) => ({
    pathname, url: `https://blob.example.test/${pathname}`, size: 14, contentType: "application/pdf",
  }));
  const get = vi.fn(async () => ({
    statusCode: 200 as const,
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("%PDF-1.4\n%EOF"));
        controller.close();
      },
    }),
  }));
  const where = vi.fn();
  const select = vi.fn(() => ({ from: vi.fn(() => ({ where })) }));
  const txValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txValues }));
  const txDelete = vi.fn(() => ({ where: vi.fn() }));
  const txUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
    cb({ update: txUpdate, delete: txDelete, insert: txInsert }),
  );
  return { del, head, get, where, select, transaction, txValues };
});

vi.mock("@vercel/blob", () => ({ del: mocks.del, head: mocks.head, get: mocks.get }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("@/lib/email/notify", () => ({ notifyAuthorityApproval: vi.fn() }));

import { POST } from "../../app/api/edit/[token]/route";

function queryResult<T>(rows: T[]) {
  const promise = Promise.resolve(rows) as Promise<T[]> & { limit: () => Promise<T[]> };
  promise.limit = vi.fn(() => Promise.resolve(rows));
  return promise;
}

const advice = {
  id: ADVICE_ID,
  serialNo: "MCCIA/2026-27/0001",
  status: "SENT_BACK",
  editToken: EDIT_TOKEN,
  editTokenExpiresAt: new Date(Date.now() + 3_600_000),
  revisionCount: 0,
  adminRemarks: "Correct it",
  financialYear: "2026-27",
  paymentMode: "NEFT",
  isAdvance: false,
  cashVoucherNo: null,
  advanceNo: null,
};

function buildFormData() {
  const fd = new FormData();
  Object.entries({
    submittedByName: "Priya Sharma",
    submittedByEmail: "priya@example.com",
    submittedByDepartment: "Applied AI Studio",
    recommendingAuthorityId: AUTHORITY_ID,
    payeeName: "Acme Supplies",
    payeeAddress: "Pune",
    billNo: "INV-101",
    billDate: "2026-07-01",
    amount: "1500",
    basicAmount: "1500",
    gstAmount: "0",
    natureOfExpenditure: "Corrected",
    enclosures: "Invoice",
    specialRemarks: "Corrected",
    paymentMode: "NEFT",
    bankAccountNo: "1234567890",
    bankIfsc: "HDFC0001234",
    beneficiaryName: "Acme Supplies",
    formDate: "2026-07-01",
    cashVoucherItems: "[]",
    advanceParticulars: "[]",
    isAdvance: "false",
  }).forEach(([key, value]) => fd.set(key, value));
  fd.set("uploadedAttachments", JSON.stringify([{
    docType: "TAX_INVOICE",
    fileName: "invoice.pdf",
    blobPathname: NEW_PATH,
    blobUrl: `https://blob.example.test/${NEW_PATH}`,
    sizeBytes: 14,
  }]));
  return fd;
}

describe("POST /api/edit/[token] — direct-upload replacement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where
      .mockImplementationOnce(() => queryResult([advice]))
      .mockImplementationOnce(() => queryResult([
        { id: "a1", paymentAdviceId: ADVICE_ID, docType: "TAX_INVOICE", blobPathname: OLD_PATH },
        { id: "a2", paymentAdviceId: ADVICE_ID, docType: "APPROVAL_BUDGET", blobPathname: "old-approval.pdf" },
      ]))
      .mockImplementationOnce(() => queryResult([{ authorityName: "Asha Rao", email: null }]));
  });

  it("stores already-uploaded Blob metadata and deletes the replaced old blob", async () => {
    const req = new NextRequest(`http://localhost/api/edit/${EDIT_TOKEN}`, {
      method: "POST",
      body: buildFormData(),
    });
    const res = await POST(req, { params: Promise.resolve({ token: EDIT_TOKEN }) });
    expect(res.status).toBe(200);
    const inserted = mocks.txValues.mock.calls
      .map(([arg]) => arg)
      .find((arg) => Array.isArray(arg) && arg[0]?.docType === "TAX_INVOICE");
    expect(inserted[0]).toMatchObject({ fileName: "invoice.pdf", blobPathname: NEW_PATH });
    expect(mocks.head).toHaveBeenCalledWith(NEW_PATH);
    expect(mocks.del).toHaveBeenCalledWith(OLD_PATH);
  });
});
