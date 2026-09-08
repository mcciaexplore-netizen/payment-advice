const HOUR_MS = 60 * 60 * 1000;

export const DG_FINANCE_PROCESSING_TABS = [
  "received_in_process",
  "verified_ready_payment",
  "partial_payment_done",
  "fully_payment_settled",
  "payment_done",
] as const;

type SummaryMetric = { tab: string; count: number; sum: number };

export function buildDgSummaryMetrics(rows: SummaryMetric[]): SummaryMetric[] {
  const metric = (tab: string) => rows.find((row) => row.tab === tab) ?? { tab, count: 0, sum: 0 };
  const processing = DG_FINANCE_PROCESSING_TABS.map(metric).reduce(
    (total, row) => ({ tab: "finance_processing", count: total.count + row.count, sum: total.sum + row.sum }),
    { tab: "finance_processing", count: 0, sum: 0 },
  );
  return [metric("waiting_authority"), metric("awaiting_finance"), processing, metric("sent_back")];
}

export type DgIntervalRow = {
  id: string;
  reference: string;
  status: string;
  submittedAt: Date;
  authorityApprovedAt: Date | null;
  financeReceivedAt: Date | null;
  paymentDoneAt: Date | null;
  firstPaymentAt: Date | null;
};

export type DgIntervalMetric = {
  key: "authority" | "intake" | "processing";
  label: string;
  description: string;
  completedCount: number;
  averageHours: number | null;
  stuckCount: number;
  longestPending: { reference: string; hours: number } | null;
};

function metric(
  rows: DgIntervalRow[],
  now: Date,
  definition: Pick<DgIntervalMetric, "key" | "label" | "description"> & {
    start: (row: DgIntervalRow) => Date | null;
    end: (row: DgIntervalRow) => Date | null;
    isPending: (row: DgIntervalRow) => boolean;
  },
): DgIntervalMetric {
  const completed: number[] = [];
  const pending: { reference: string; hours: number }[] = [];
  for (const row of rows) {
    const start = definition.start(row);
    const end = definition.end(row);
    if (start && end && end >= start) completed.push(end.getTime() - start.getTime());
    if (start && !end && definition.isPending(row)) {
      pending.push({ reference: row.reference, hours: Math.max(0, now.getTime() - start.getTime()) / HOUR_MS });
    }
  }
  pending.sort((a, b) => b.hours - a.hours);
  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    completedCount: completed.length,
    averageHours: completed.length ? completed.reduce((total, value) => total + value, 0) / completed.length / HOUR_MS : null,
    stuckCount: pending.length,
    longestPending: pending[0] ?? null,
  };
}

export function calculateDgIntervalMetrics(rows: DgIntervalRow[], now = new Date()): DgIntervalMetric[] {
  return [
    metric(rows, now, {
      key: "authority", label: "Authority Response Time", description: "Submission → recommendation",
      start: (row) => row.submittedAt, end: (row) => row.authorityApprovedAt,
      isPending: (row) => row.status === "SUBMITTED",
    }),
    metric(rows, now, {
      key: "intake", label: "Finance Intake Time", description: "Recommendation → received by Finance",
      start: (row) => row.authorityApprovedAt, end: (row) => row.financeReceivedAt,
      isPending: (row) => row.status === "SUBMITTED",
    }),
    metric(rows, now, {
      key: "processing", label: "Finance Processing Time", description: "Received by Finance → first payment",
      start: (row) => row.financeReceivedAt,
      end: (row) => row.firstPaymentAt ?? row.paymentDoneAt,
      isPending: (row) => row.status === "SUBMITTED",
    }),
  ];
}

export function formatDuration(hours: number | null): string {
  if (hours === null) return "—";
  return hours < 48 ? `${hours.toFixed(1)} hrs` : `${(hours / 24).toFixed(1)} days`;
}
