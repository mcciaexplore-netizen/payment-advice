export const TDS_PERCENTAGES = [0, 1, 2, 5, 10, 31.2] as const;
export type TdsPercentage = (typeof TDS_PERCENTAGES)[number];

function toPaise(value: number): number {
  return Math.round(value * 100);
}

function fromPaise(value: number): number {
  return value / 100;
}

/** Percentage calculation in integer paise/basis-points, so values such as
 * 31.2% do not accumulate binary floating-point cents. */
export function tdsAmount(amount: number, percent: TdsPercentage): number {
  const basisPoints = Math.round(percent * 100);
  return fromPaise(Math.round((toPaise(amount) * basisPoints) / 10_000));
}

export function calculatePayable(input: {
  basicAmount: number;
  arrearsAmount?: number | null;
  currentTdsPercent: TdsPercentage;
}) {
  const arrearsAmount = input.arrearsAmount ?? 0;
  const arrearsTdsAmount = arrearsAmount > 0
    ? tdsAmount(arrearsAmount, input.currentTdsPercent)
    : 0;
  const currentTdsAmount = tdsAmount(input.basicAmount, input.currentTdsPercent);
  const totalTdsAmount = fromPaise(
    toPaise(arrearsTdsAmount) + toPaise(currentTdsAmount),
  );
  // Per MCCIA's approved formula, arrears themselves are not added to the
  // payable base; only the TDS on an entered arrears amount is deducted.
  const payablePaise = toPaise(input.basicAmount) - toPaise(totalTdsAmount);

  return {
    arrearsTdsAmount,
    currentTdsAmount,
    totalTdsAmount,
    payableAmount: fromPaise(payablePaise),
  };
}
