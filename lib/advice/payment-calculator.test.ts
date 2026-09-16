import { describe, expect, it } from "vitest";
import { calculatePayable, tdsAmount } from "@/lib/advice/payment-calculator";

describe("Arrears/TDS payable calculator", () => {
  it("matches the required worked example: Basic 10,000 at 10% gives TDS 1,000 and Payable 9,000", () => {
    expect(
      calculatePayable({
        basicAmount: 10_000,
        arrearsAmount: null,
        currentTdsPercent: 10,
      }),
    ).toEqual({
      arrearsTdsAmount: 0,
      currentTdsAmount: 1_000,
      totalTdsAmount: 1_000,
      payableAmount: 9_000,
    });
  });

  it("uses one shared rate for arrears and current TDS and matches the required worked example", () => {
    expect(
      calculatePayable({
        basicAmount: 10_000,
        arrearsAmount: 20_000,
        currentTdsPercent: 10,
      }),
    ).toEqual({
      arrearsTdsAmount: 2_000,
      currentTdsAmount: 1_000,
      totalTdsAmount: 3_000,
      payableAmount: 7_000,
    });
  });

  it("keeps 31.2% calculations accurate to paise", () => {
    expect(tdsAmount(1234.56, 31.2)).toBe(385.18);
  });
});
