import { CashReceiptsSection } from "@/components/admin/CashReceiptsSection";
import { CashReceiptReportBar } from "@/components/account/CashReceiptReportBar";
import { addCalendarDays, todayInIst } from "@/lib/date-time";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";

export const dynamic = "force-dynamic";

export default async function CashReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const today = todayInIst();
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-600">Every receipt issued across all branches, newest first.</p>
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-xl text-[#0b1f3a]">Daily Report</h2>
        <CashReceiptReportBar today={today} yesterday={addCalendarDays(today, -1)} from={today} to={today} branchOptions={BRANCH_OPTIONS} />
      </section>
      <CashReceiptsSection searchParams={sp} baseHref="/admin/cash-receipts" />
    </div>
  );
}
