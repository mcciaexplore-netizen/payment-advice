import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Payment Desk dedicated public pages", () => {
  it("routes the landing choices and the two confirmed follow-up links correctly", () => {
    expect(read("app/page.tsx")).toContain('href="/payment-advice"');
    expect(read("app/page.tsx")).toContain('href="/cash-voucher"');
    expect(read("app/advance/page.tsx")).toContain('href="/payment-advice"');
    expect(read("app/submitted/[serial]/page.tsx")).toContain('href="/payment-advice"');
  });

  it("uses fixed page modes and keeps the mode chooser only for Advance", () => {
    const form = read("components/form/PaymentAdviceForm.tsx");
    expect(read("app/payment-advice/page.tsx")).toContain('type="payment-advice"');
    expect(read("app/cash-voucher/page.tsx")).toContain('type="cash-voucher"');
    expect(form).toContain('paymentMode: isCashVoucher ? "CASH" : "NEFT"');
    expect(form).toContain('{isAdvance ? <Field label="Mode"');
  });

  it("seeds one blank Cash row and appends one blank row per click", () => {
    expect(read("components/form/PaymentAdviceForm.tsx")).toContain('cashVoucherItems: isCashVoucher ? [{ description: "", amount: undefined as unknown as number }] : []');
    expect(read("components/form/LineItemsField.tsx")).toContain('append({ description: "", amount: undefined as unknown as number })');
  });
});
