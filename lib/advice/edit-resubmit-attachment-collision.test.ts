import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for: resubmitting via /api/edit/[token] with a
 * replacement attachment that shares the exact filename of the one it's
 * replacing used to 500, because the Blob pathname is deterministic
 * (`advices/{serialNo}/{docType}-{fileName}`) and collides with the file
 * already sitting at that path. Fixed by passing `addRandomSuffix: true`
 * to `put()`. This test simulates Vercel Blob's real collision behavior
 * (throw unless addRandomSuffix/allowOverwrite is set) rather than just
 * asserting the option was passed, so it would actually fail against the
 * pre-fix code.
 */

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORITY_ID = "22222222-2222-4222-8222-222222222222";
const EDIT_TOKEN = "existing-edit-token";
const EXISTING_TAX_INVOICE_PATHNAME = "advices/MCCIA/2026-27/0001/TAX_INVOICE-invoice.pdf";
const EXISTING_APPROVAL_BUDGET_PATHNAME = "advices/MCCIA/2026-27/0001/APPROVAL_BUDGET-approval.pdf";

const mocks = vi.hoisted(() => {
  const blobStore = new Set<string>([
    "advices/MCCIA/2026-27/0001/TAX_INVOICE-invoice.pdf",
    "advices/MCCIA/2026-27/0001/APPROVAL_BUDGET-approval.pdf",
  ]);
  let suffixCounter = 0;

  const put = vi.fn(
    async (
      pathname: string,
      _file: unknown,
      options?: { addRandomSuffix?: boolean; allowOverwrite?: boolean },
    ) => {
      let finalPathname = pathname;
      if (blobStore.has(pathname) && !options?.allowOverwrite) {
        if (!options?.addRandomSuffix) {
          throw new Error(
            "Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it. Or `addRandomSuffix: true` to generate a unique filename.",
          );
        }
        finalPathname = `${pathname}-${++suffixCounter}`;
      }
      blobStore.add(finalPathname);
      return { pathname: finalPathname, url: `https://blob.example.test/${finalPathname}` };
    },
  );
  const del = vi.fn(async () => {});

  const where = vi.fn();
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  const txValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txValues }));
  const txDeleteWhere = vi.fn();
  const txDelete = vi.fn(() => ({ where: txDeleteWhere }));
  const txSetWhere = vi.fn();
  const txSet = vi.fn(() => ({ where: txSetWhere }));
  const txUpdate = vi.fn(() => ({ set: txSet }));
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
    cb({ update: txUpdate, delete: txDelete, insert: txInsert }),
  );

  const notifyAuthorityApproval = vi.fn();

  return {
    put,
    del,
    where,
    from,
    select,
    transaction,
    txValues,
    txInsert,
    notifyAuthorityApproval,
    blobStore,
  };
});

vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("@/lib/email/notify", () => ({ notifyAuthorityApproval: mocks.notifyAuthorityApproval }));

import { POST } from "../../app/api/edit/[token]/route";

function queryResult<T>(rows: T[]) {
  const promise = Promise.resolve(rows) as Promise<T[]> & { limit: () => Promise<T[]> };
  promise.limit = vi.fn(() => Promise.resolve(rows));
  return promise;
}

function pdfFile(name: string) {
  return new File(["%PDF-1.4\n%EOF"], name, { type: "application/pdf" });
}

const advice = {
  id: ADVICE_ID,
  serialNo: "MCCIA/2026-27/0001",
  status: "SENT_BACK",
  editToken: EDIT_TOKEN,
  editTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
  revisionCount: 0,
};

const existingAttachments = [
  { id: "a1", paymentAdviceId: ADVICE_ID, docType: "TAX_INVOICE", blobPathname: EXISTING_TAX_INVOICE_PATHNAME },
  { id: "a2", paymentAdviceId: ADVICE_ID, docType: "APPROVAL_BUDGET", blobPathname: EXISTING_APPROVAL_BUDGET_PATHNAME },
];

function buildFormData(taxInvoiceFileName: string) {
  const fd = new FormData();
  fd.set("editToken", EDIT_TOKEN);
  fd.set("submittedByName", "Priya Sharma");
  fd.set("submittedByEmail", "priya@example.com");
  fd.set("submittedByDepartment", "Applied AI Studio");
  fd.set("recommendingAuthorityId", AUTHORITY_ID);
  fd.set("verifiedByName", "Verifier Name");
  fd.set("payeeName", "Acme Supplies");
  fd.set("payeeAddress", "123 Test Street, Pune");
  fd.set("billNo", "INV-101");
  fd.set("billDate", "2026-07-01");
  fd.set("amount", "1500.00");
  fd.set("natureOfExpenditure", "Corrected on resubmission");
  fd.set("paymentMode", "NEFT");
  fd.set("bankAccountNo", "1234567890");
  fd.set("bankIfsc", "HDFC0001234");
  fd.set("beneficiaryName", "Acme Supplies");
  fd.set("formDate", "2026-07-01");
  fd.set("cashVoucherItems", "[]");
  fd.append("attachment_TAX_INVOICE", pdfFile(taxInvoiceFileName));
  return fd;
}

describe("POST /api/edit/[token] — replacement attachment with a colliding filename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blobStore.clear();
    mocks.blobStore.add(EXISTING_TAX_INVOICE_PATHNAME);
    mocks.blobStore.add(EXISTING_APPROVAL_BUDGET_PATHNAME);
    mocks.where
      .mockImplementationOnce(() => queryResult([advice])) // advice lookup by editToken
      .mockImplementationOnce(() => queryResult(existingAttachments)) // existing attachments
      .mockImplementationOnce(() => queryResult([{ authorityName: "Asha Rao" }])); // authority name lookup
  });

  it("succeeds (no 500) and stores a non-colliding blob path when the replacement file reuses the original filename", async () => {
    const formData = buildFormData("invoice.pdf"); // same name as the existing TAX_INVOICE attachment
    const req = new NextRequest("http://localhost/api/edit/" + EDIT_TOKEN, {
      method: "POST",
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ token: EDIT_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.serialNo).toBe(advice.serialNo);

    // The fix: put() is called with addRandomSuffix so the collision that
    // would 500 pre-fix never happens.
    expect(mocks.put).toHaveBeenCalledWith(
      EXISTING_TAX_INVOICE_PATHNAME,
      expect.anything(),
      expect.objectContaining({ addRandomSuffix: true }),
    );

    // The persisted row points at the actual (disambiguated) pathname Blob
    // returned, not the colliding deterministic one — this is what every
    // attachment-serving route later fetches by.
    const insertedRows = mocks.txValues.mock.calls
      .map(([arg]) => arg)
      .find((arg) => Array.isArray(arg) && arg[0]?.docType === "TAX_INVOICE");
    expect(insertedRows).toBeDefined();
    const newTaxInvoiceRow = insertedRows[0];
    expect(newTaxInvoiceRow.fileName).toBe("invoice.pdf");
    expect(newTaxInvoiceRow.blobPathname).not.toBe(EXISTING_TAX_INVOICE_PATHNAME);
    expect(newTaxInvoiceRow.blobPathname).toContain(EXISTING_TAX_INVOICE_PATHNAME);

    // The superseded old attachment's blob is still cleaned up afterward —
    // replace-on-resubmit behavior is unchanged, just no longer collides.
    expect(mocks.del).toHaveBeenCalledWith(EXISTING_TAX_INVOICE_PATHNAME);
  });

  it("would have 500'd without addRandomSuffix (sanity check that the mock reproduces the original bug)", async () => {
    mocks.put.mockImplementationOnce(async (pathname: string) => {
      if (mocks.blobStore.has(pathname)) {
        throw new Error(
          "Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it. Or `addRandomSuffix: true` to generate a unique filename.",
        );
      }
      mocks.blobStore.add(pathname);
      return { pathname, url: `https://blob.example.test/${pathname}` };
    });

    const formData = buildFormData("invoice.pdf");
    const req = new NextRequest("http://localhost/api/edit/" + EDIT_TOKEN, {
      method: "POST",
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ token: EDIT_TOKEN }) });
    expect(res.status).toBe(500);
  });
});
