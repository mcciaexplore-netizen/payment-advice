import Link from "next/link";
import { and, count, eq, sum } from "drizzle-orm";
import { getAdminSession } from "@/lib/admin-session";
import { defaultPaymentModeForRole } from "@/lib/admin/role-scope";
import { AdminTab, buildTabCondition } from "@/lib/admin/filters";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";
import { financialYearFor } from "@/lib/serial";

export const dynamic = "force-dynamic";

const STAGES: { tab: AdminTab; label: string }[] = [
  { tab: "waiting_authority", label: "Waiting on Authority" },
  { tab: "awaiting_finance", label: "Awaiting Finance Review" },
  { tab: "advance_payment", label: "Advance Payment" },
  { tab: "received_in_process", label: "Received & In Process" },
  { tab: "verified_ready_payment", label: "Verified — Ready for Payment" },
  { tab: "partial_payment_done", label: "Partial Payment Done" },
  { tab: "fully_payment_settled", label: "Fully Payment Settled" },
  { tab: "payment_done", label: "Payment Done (Cash)" },
  { tab: "sent_back", label: "Sent Back" },
];

function money(value: number) {
  return `₹ ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) return null;

  const roleMode = defaultPaymentModeForRole(session.adminRole);
  const roleScope = roleMode ? eq(paymentAdvices.paymentMode, roleMode) : undefined;
  const financialYear = financialYearFor(new Date());

  const [stageRows, analyticsRows] = await Promise.all([
    Promise.all(STAGES.map(async ({ tab }) => {
      const [result] = await db.select({ count: count(), sum: sum(paymentAdvices.amount) })
        .from(paymentAdvices)
        .where(and(roleScope, buildTabCondition(tab)));
      return { tab, count: result?.count ?? 0, sum: Number(result?.sum ?? 0) };
    })),
    db.select({
      submittedAt: paymentAdvices.submittedAt,
      authorityApprovedAt: paymentAdvices.authorityApprovedAt,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
      totalPaid: paymentAdvices.totalPaid,
      paymentMode: paymentAdvices.paymentMode,
      isAdvance: paymentAdvices.isAdvance,
      paymentDoneAt: paymentAdvices.paymentDoneAt,
    }).from(paymentAdvices).where(and(roleScope, eq(paymentAdvices.financialYear, financialYear))),
  ]);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 12 * 7);
  const weeks = Array.from({ length: 13 }, (_, index) => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() + index * 7);
    return { start, count: 0 };
  });

  const modes = {
    NEFT: { label: "NEFT", count: 0, amount: 0 },
    CASH: { label: "Cash", count: 0, amount: 0 },
    ADVANCE: { label: "Advance Payment", count: 0, amount: 0 },
  };
  const vendors = new Map<string, { count: number; amount: number }>();
  let approvalMilliseconds = 0;
  let approvalCount = 0;
  let totalSubmitted = 0;
  let totalPaid = 0;

  for (const row of analyticsRows) {
    const amount = Number(row.amount);
    totalSubmitted += amount;
    const paid = row.paymentMode === "CASH"
      ? row.paymentDoneAt ? amount : 0
      : Math.min(Number(row.totalPaid), amount);
    totalPaid += paid;

    const mode = row.isAdvance ? modes.ADVANCE : row.paymentMode === "CASH" ? modes.CASH : modes.NEFT;
    mode.count += 1;
    mode.amount += amount;

    const vendor = vendors.get(row.payeeName) ?? { count: 0, amount: 0 };
    vendor.count += 1;
    vendor.amount += amount;
    vendors.set(row.payeeName, vendor);

    if (row.authorityApprovedAt) {
      approvalMilliseconds += Math.max(0, row.authorityApprovedAt.getTime() - row.submittedAt.getTime());
      approvalCount += 1;
    }

    const weekIndex = Math.floor((row.submittedAt.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weekIndex >= 0 && weekIndex < weeks.length) weeks[weekIndex].count += 1;
  }

  const topVendors = [...vendors.entries()]
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 5);
  const maxWeeklyCount = Math.max(1, ...weeks.map((week) => week.count));
  const averageApprovalHours = approvalCount ? approvalMilliseconds / approvalCount / 3_600_000 : null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          {roleMode ? `${roleMode}-focused overview` : "All submissions overview"} · Financial year {financialYear}
        </p>
      </header>

      <section>
        <h2 className="mb-3 font-heading text-xl text-[#0b1f3a]">Pipeline Summary</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STAGES.map(({ tab, label }) => {
            const metric = stageRows.find((row) => row.tab === tab)!;
            const modeParam = roleMode ? `&paymentMode=${roleMode}` : "";
            return <Link key={tab} href={`/admin/submissions?tab=${tab}${modeParam}`} className="flex min-h-32 flex-col justify-between rounded-lg border border-gray-200 bg-white p-4 hover:border-[#0b1f3a] hover:shadow-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
              <span className="font-heading text-3xl text-[#0b1f3a]">{metric.count}</span>
              <span className="text-xs text-gray-500">{money(metric.sum)}</span>
            </Link>;
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Submissions over time" subtitle="Weekly count · last 90 days">
          <div className="flex h-48 items-end gap-2 border-b border-gray-200 pt-6">
            {weeks.map((week) => <div key={week.start.toISOString()} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="text-xs font-medium text-[#0b1f3a]">{week.count || ""}</span>
              <div className="w-full rounded-t bg-[#2e8b57]" style={{ height: `${Math.max(week.count ? 8 : 2, (week.count / maxWeeklyCount) * 120)}px` }} />
              <span className="hidden text-[10px] text-gray-500 sm:block">{week.start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
            </div>)}
          </div>
        </Panel>

        <Panel title="Breakdown by payment type" subtitle="Current financial year">
          <div className="divide-y divide-gray-100">
            {Object.values(modes).map((mode) => <div key={mode.label} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div><p className="font-medium text-[#0b1f3a]">{mode.label}</p><p className="text-xs text-gray-500">{mode.count} submission{mode.count === 1 ? "" : "s"}</p></div>
              <p className="font-heading text-xl text-[#0b1f3a]">{money(mode.amount)}</p>
            </div>)}
          </div>
        </Panel>

        <Panel title="Top vendors by amount" subtitle={`Top 5 · ${financialYear}`}>
          {topVendors.length ? <ol className="divide-y divide-gray-100">{topVendors.map(([name, value], index) => <li key={name} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div className="flex min-w-0 items-center gap-3"><span className="text-sm text-gray-400">{index + 1}</span><div className="min-w-0"><p className="truncate font-medium text-[#0b1f3a]">{name}</p><p className="text-xs text-gray-500">{value.count} submission{value.count === 1 ? "" : "s"}</p></div></div><span className="whitespace-nowrap text-sm font-medium">{money(value.amount)}</span></li>)}</ol> : <Empty />}
        </Panel>

        <Panel title="Authority approval time" subtitle="Average for approved submissions this financial year">
          <p className="font-heading text-4xl text-[#0b1f3a]">{averageApprovalHours === null ? "—" : averageApprovalHours < 48 ? `${averageApprovalHours.toFixed(1)} hrs` : `${(averageApprovalHours / 24).toFixed(1)} days`}</p>
          <p className="mt-2 text-sm text-gray-500">Based on {approvalCount} approved submission{approvalCount === 1 ? "" : "s"}.</p>
        </Panel>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-xl text-[#0b1f3a]">Financial Year Totals</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TotalCard label="Submitted" value={totalSubmitted} detail={`${analyticsRows.length} submissions`} />
          <TotalCard label="Paid / Settled" value={totalPaid} detail="Cash completed + NEFT payments recorded" />
          <TotalCard label="Still Pending" value={Math.max(0, totalSubmitted - totalPaid)} detail="Submitted amount less paid / settled" />
        </div>
      </section>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-gray-200 bg-white p-5"><h2 className="font-heading text-xl text-[#0b1f3a]">{title}</h2><p className="mb-5 text-xs text-gray-500">{subtitle}</p>{children}</section>;
}

function TotalCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-5"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 font-heading text-3xl text-[#0b1f3a]">{money(value)}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>;
}

function Empty() {
  return <p className="text-sm text-gray-500">No submissions in this financial year.</p>;
}
