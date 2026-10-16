import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { refundRequests } from "@/lib/db/schema";
import { refundRequestsEnabled } from "@/lib/refund-requests";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RefundSubmittedPage({ params }: { params: Promise<{ id: string }> }) {
  if (!refundRequestsEnabled()) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [refund] = await db
    .select({ serialNo: refundRequests.serialNo, totalAmount: refundRequests.totalAmount })
    .from(refundRequests)
    .where(eq(refundRequests.id, id))
    .limit(1);
  if (!refund) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <section className="space-y-4 text-center">
        <p className="text-sm font-medium text-[#2e8b57]">Refund request submitted</p>
        <h1 className="font-heading text-4xl text-[#0b1f3a]">{refund.serialNo}</h1>
        <p className="text-gray-600">Your refund request for ₹ {Number(refund.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} was saved. Keep this reference for any follow-up.</p>
      </section>
      <div className="flex flex-wrap justify-center gap-3">
        <a href={`/api/refund/${id}/pdf`} target="_blank" rel="noreferrer" className="rounded-md bg-[#0b1f3a] px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-[#0b1f3a]/90">Open printable request</a>
        <a href={`/api/refund/${id}/pdf?download=1`} download className="rounded-md border border-[#0b1f3a] px-6 py-3 text-base font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5">Download PDF</a>
        <Link href="/refund" className="rounded-md border border-[#0b1f3a] px-6 py-3 text-base font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5">Submit another refund</Link>
      </div>
    </main>
  );
}
