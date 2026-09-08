import { describe, expect, it } from "vitest";
import { compareByCurrentStageAge, currentStageEnteredAt, stageAging, type StageAgingAdvice } from "./stage-aging";

const submittedAt = new Date("2026-08-01T06:30:00.000Z");
const approvedAt = new Date("2026-08-20T06:30:00.000Z");
const financeReceivedAt = new Date("2026-09-01T06:30:00.000Z");
const verifiedAt = new Date("2026-09-05T06:30:00.000Z");
const now = new Date("2026-09-08T06:30:00.000Z");

function advice(overrides: Partial<StageAgingAdvice> = {}): StageAgingAdvice {
  return {
    status: "SUBMITTED",
    approvedAt: null,
    financeReceivedAt: null,
    verifiedAt: null,
    paymentDoneAt: null,
    paymentMode: "NEFT",
    totalPaid: "0",
    isAdvance: false,
    submittedAt,
    updatedAt: null,
    revisionCount: 0,
    sentBackAt: null,
    firstPaymentAt: null,
    ...overrides,
  };
}

describe("current-stage aging", () => {
  it("measures a changed stage from entry into that stage, not original submission", () => {
    const row = advice({ approvedAt, financeReceivedAt, verifiedAt });
    expect(stageAging(row, now)).toMatchObject({
      stage: "Verified — Ready for Payment",
      days: 3,
      label: "3 days in Verified — Ready for Payment",
      isStale: false,
    });
  });

  it("uses the resubmission update time when waiting on Authority again", () => {
    const updatedAt = new Date("2026-09-07T06:30:00.000Z");
    expect(currentStageEnteredAt(advice({ revisionCount: 2, updatedAt }))).toEqual(updatedAt);
  });

  it("uses the first payment time for the Partial Payment stage and flags over seven days", () => {
    const firstPaymentAt = new Date("2026-08-30T06:30:00.000Z");
    expect(stageAging(advice({ approvedAt, financeReceivedAt, verifiedAt, totalPaid: "100", firstPaymentAt }), now))
      .toMatchObject({ stage: "Partial Payment Done", days: 9, isStale: true });
  });

  it("does not show aging for final states", () => {
    expect(stageAging(advice({ status: "APPROVED" }), now)).toBeNull();
  });

  it("sorts non-final rows by oldest current-stage entry first", () => {
    const olderStage = advice({ approvedAt: new Date("2026-09-01T06:30:00.000Z") });
    const newerStage = advice({ approvedAt: new Date("2026-09-06T06:30:00.000Z") });
    expect([newerStage, olderStage].sort(compareByCurrentStageAge)).toEqual([olderStage, newerStage]);
  });
});
