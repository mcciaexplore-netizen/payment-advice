import { describe, expect, it } from "vitest";
import { buildDgSummaryMetrics, calculateDgIntervalMetrics, formatDuration, type DgIntervalRow } from "./dg-dashboard";

const at = (hours: number) => new Date(Date.UTC(2026, 8, 1, hours));
const row = (overrides: Partial<DgIntervalRow> = {}): DgIntervalRow => ({
  id: "one", reference: "MCCIA/2026-27/0001", status: "SUBMITTED",
  submittedAt: at(0), authorityApprovedAt: null, financeReceivedAt: null,
  paymentDoneAt: null, firstPaymentAt: null, ...overrides,
});

describe("DG executive interval metrics", () => {
  it("builds four cards and exactly sums the five Finance-processing stages", () => {
    const metrics = buildDgSummaryMetrics([
      { tab: "waiting_authority", count: 2, sum: 20 },
      { tab: "awaiting_finance", count: 3, sum: 30 },
      { tab: "advance_payment", count: 50, sum: 500 },
      { tab: "received_in_process", count: 1, sum: 10 },
      { tab: "verified_ready_payment", count: 2, sum: 20 },
      { tab: "partial_payment_done", count: 3, sum: 30 },
      { tab: "fully_payment_settled", count: 4, sum: 40 },
      { tab: "payment_done", count: 5, sum: 50 },
      { tab: "sent_back", count: 6, sum: 60 },
    ]);
    expect(metrics).toHaveLength(4);
    expect(metrics[2]).toEqual({ tab: "finance_processing", count: 15, sum: 150 });
  });

  it("averages only completed intervals and reports pending work separately", () => {
    const metrics = calculateDgIntervalMetrics([
      row({ id: "completed", authorityApprovedAt: at(4), financeReceivedAt: at(6), firstPaymentAt: at(10) }),
      row({ id: "pending", reference: "MCCIA/2026-27/0002", submittedAt: at(2) }),
    ], at(12));
    expect(metrics[0]).toMatchObject({ completedCount: 1, averageHours: 4, stuckCount: 1 });
    expect(metrics[0].longestPending).toMatchObject({ reference: "MCCIA/2026-27/0002", hours: 10 });
    expect(metrics[1]).toMatchObject({ completedCount: 1, averageHours: 2, stuckCount: 0 });
    expect(metrics[2]).toMatchObject({ completedCount: 1, averageHours: 4, stuckCount: 0 });
  });

  it("uses the first NEFT payment or Cash payment-done timestamp as processing completion", () => {
    const metrics = calculateDgIntervalMetrics([
      row({ id: "partial", financeReceivedAt: at(2), firstPaymentAt: at(5) }),
      row({ id: "cash", financeReceivedAt: at(3), paymentDoneAt: at(9) }),
    ], at(12));
    expect(metrics[2]).toMatchObject({ completedCount: 2, averageHours: 4.5 });
  });

  it("does not count sent-back rows as currently stuck", () => {
    const [authority] = calculateDgIntervalMetrics([row({ status: "SENT_BACK" })], at(12));
    expect(authority.stuckCount).toBe(0);
  });

  it("formats short durations as hours and longer ones as days", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(12)).toBe("12.0 hrs");
    expect(formatDuration(60)).toBe("2.5 days");
  });
});
