import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { refundRequests } from "@/lib/db/schema";
import { refundRecommendationEnabled, refundRequestsEnabled } from "@/lib/refund-requests";
import { getAdminSession } from "@/lib/admin-session";
import { hasTeamDashboardRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RefundSubmittedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ resubmitted?: string }> }) {
  if (!refundRequestsEnabled()) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [refund] = await db
    .select({ serialNo: refundRequests.serialNo, totalAmount: refundRequests.totalAmount, recommendingAuthority: refundRequests.recommendingAuthority })
    .from(refundRequests)
    .where(eq(refundRequests.id, id))
    .limit(1);
  if (!refund) notFound();
  // Shown after a sent-back refund is corrected and resubmitted (same reference).
  const resubmitted = (await searchParams)?.resubmitted === "1";
  // Signed-in people with a dashboard can open this and every earlier refund
  // under My Refunds (the sign-in is required before the form since the Payment
  // Desk sign-in change, so this is the usual case).
  const session = await getAdminSession();
  const canSeeMyRefunds = hasTeamDashboardRole(session);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <section className="space-y-4 text-center">
        <p className="text-sm font-medium text-[#2e8b57]">{resubmitted ? "Third party refund request resubmitted" : "Third party refund request submitted"}</p>
        <h1 className="font-heading text-4xl text-[#0b1f3a]">{refund.serialNo}</h1>
        <p className="text-gray-600">Your third party refund request for ₹ {Number(refund.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} was saved. Keep this reference for any follow-up.</p>
        {refundRecommendationEnabled() ? <p className="text-sm text-gray-600">It has gone to <strong>{refund.recommendingAuthority}</strong> for recommendation. You will be emailed their decision, and you can follow it under My Third Party Refunds.</p> : null}
      </section>
      <div className="flex flex-wrap justify-center gap-3">
        <a href={`/api/refund/${id}/pdf`} target="_blank" rel="noreferrer" className="rounded-md bg-[#0b1f3a] px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-[#0b1f3a]/90">Open printable request</a>
        <a href={`/api/refund/${id}/pdf?download=1`} download className="rounded-md border border-[#0b1f3a] px-6 py-3 text-base font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5">Download PDF</a>
        {canSeeMyRefunds ? <Link href="/authority?view=my-refunds" className="rounded-md border border-[#0b1f3a] px-6 py-3 text-base font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5">View my third party refunds</Link> : null}
        <Link href="/refund" className="rounded-md border border-[#0b1f3a] px-6 py-3 text-base font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5">Submit another third party refund</Link>
      </div>
    </main>
  );
}
