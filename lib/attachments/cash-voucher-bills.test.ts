import { describe, expect, it } from "vitest";
import { validateCashVoucherBillUploads } from "@/lib/attachments/cash-voucher-bills";

const item = { clientKey: "22222222-2222-4222-8222-222222222222", description: "Taxi", amount: 250 };
const upload = { docType: "CASH_VOUCHER_BILL" as const, cashVoucherItemKey: item.clientKey, fileName: "bill.pdf", blobPathname: "pending-uploads/batch/bill.pdf", blobUrl: "https://example.com/bill.pdf", sizeBytes: 1000 };

describe("Cash Voucher per-row bill mapping", () => {
  it("requires exactly one bill for every new row", () => {
    expect(validateCashVoucherBillUploads([item], [])).toContain("every Cash Voucher expense");
    expect(validateCashVoucherBillUploads([item], [upload])).toBeNull();
    expect(validateCashVoucherBillUploads([item], [upload, upload])).toContain("Only one bill");
  });

  it("allows an edit row to retain its existing linked attachment", () => {
    const existing = { ...item, id: "33333333-3333-4333-8333-333333333333" };
    expect(validateCashVoucherBillUploads([existing], [], new Set([existing.id]))).toBeNull();
  });
});
