import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Payment Desk dedicated public pages", () => {
  it("routes the landing choices and the two confirmed follow-up links correctly", () => {
    expect(read("app/page.tsx")).toContain('href="/payment-advice"');
    expect(read("app/page.tsx")).toContain('href="/cash-voucher"');
    expect(read("app/page.tsx")).toContain('href="/advance" title="Advance Payment Form"');
    expect(read("app/advance/page.tsx")).toContain('href="/payment-advice"');
    expect(read("app/submitted/[serial]/page.tsx")).toContain('href="/payment-advice"');
  });

  it("uses fixed page modes and keeps the mode chooser only for Advance", () => {
    const form = read("components/form/PaymentAdviceForm.tsx");
    expect(read("app/payment-advice/page.tsx")).toContain('type="payment-advice"');
    expect(read("app/cash-voucher/page.tsx")).toContain('type="cash-voucher"');
    expect(form).toContain('paymentMode: isCashVoucher ? "CASH" : "NEFT"');
    expect(form).toContain('{isAdvance ? <Field label="Mode"');
    expect(form).toContain('isCashVoucher ? "2. Bill & reference"');
    expect(form).toContain('isCashVoucher ? "3. Enclosures & remarks"');
    expect(form).toContain('isCashVoucher ? "4. Documents"');
    expect(form).toContain('label="Other Documents"');
    expect(form).toContain("!isAdvance && !isCashVoucher");
  });

  it("renders Branch and Department controls once in the shared form used by all three routes", () => {
    const form = read("components/form/PaymentAdviceForm.tsx");
    expect(form.match(/label="Your Branch"/g)).toHaveLength(1);
    expect(form.match(/label="Your Department"/g)).toHaveLength(1);
    expect(form).toContain('submittedByDepartmentOption === "OTHERS"');
    for (const branch of ["SB Road Office", "Tilak Road Office", "Hadapsar Office", "Bhosari Office", "Ahilyanagar Office"]) {
      expect(read("lib/validation/payment-advice.ts")).toContain(`"${branch}"`);
    }
  });

  it("seeds one blank Cash row and appends one blank row per click", () => {
    const form = read("components/form/PaymentAdviceForm.tsx");
    const cashItems = read("components/form/CashVoucherItemsField.tsx");
    expect(form).toContain("clientKey: crypto.randomUUID()");
    expect(cashItems).toContain("if (fields.length >= MAX_EXPENSES) return");
    expect(cashItems).toContain("append({");
    expect(cashItems.match(/append\(\{/g)).toHaveLength(1);
    expect(cashItems).toContain("Maximum 10 expenses per submission");
    expect(cashItems).not.toContain('amount: 0');
    expect(read("components/form/LineItemsField.tsx")).toContain('append({ description: "", amount: undefined as unknown as number })');
  });
});
