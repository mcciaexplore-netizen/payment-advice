import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RefundForm } from "@/components/form/RefundForm";
import { PublicLoginMenu } from "@/components/public/PublicLoginMenu";
import { formatDateOnly, formatIstDate } from "@/lib/date-time";
import { refundRecommendationEnabled } from "@/lib/refund-requests";
import { getSessionEmail, loadOwnRefund } from "@/lib/advice/refund-resubmit";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The submitter corrects a third party refund the authority sent back and
 * resubmits the same request (same reference number) to the same authority.
 * Only the person who submitted it (matched on their login email, as in My
 * Third Party Refunds) can open it: signed out goes to sign-in, anyone else
 * gets a 404. Once it is not waiting for corrections, the page says so. */
export default async function RefundEditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!refundRecommendationEnabled()) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const accountEmail = await getSessionEmail();
  if (!accountEmail) redirect(`/login?next=${encodeURIComponent(`/refund/edit/${id}`)}`);
  const found = await loadOwnRefund(id, accountEmail);
  if (!found) notFound();
  const { refund, review } = found;
  const waiting = review?.decision === "SENT_BACK";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="relative flex flex-wrap items-start gap-4 border-b border-gray-200 pb-6">
        <div className="flex min-w-0 items-center gap-4 sm:pr-32">
          <Image src="/mccia-logo.png" alt="MCCIA logo" width={1085} height={258} className="h-14 w-auto" />
          <div><h1 className="font-heading text-3xl text-[#0b1f3a]">Edit Third Party Refund Request</h1><p className="text-sm text-gray-600">{refund.serialNo}, dated {formatDateOnly(refund.requestDate)}</p></div>
        </div>
        <PublicLoginMenu />
      </header>
      <Link href="/authority?view=my-refunds" className="w-fit text-sm font-medium text-gray-600 hover:text-[#0b1f3a]">← Back to My Third Party Refunds</Link>
      {waiting ? (
        <>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p><strong>Sent back by {review.decidedByName}</strong> on {formatIstDate(review.decidedAt)}.</p>
            <p className="mt-1">Remarks: {review.remarks}</p>
            <p className="mt-2 text-xs">Correct the request below and resubmit it. It keeps the reference number {refund.serialNo} and goes back to {refund.recommendingAuthority}.</p>
          </div>
          <RefundForm
            authorityOptions={[]}
            persist
            edit={{
              refundId: refund.id,
              submitter: { name: refund.submittedByName, email: refund.submittedByEmail, department: refund.submittedByDepartment, branch: refund.branch, recommendingAuthority: refund.recommendingAuthority },
              values: {
                payeeName: refund.payeeName, payeeAddress: refund.payeeAddress ?? "", payeeContactPerson: refund.payeeContactPerson ?? "",
                payeeContactPhone: refund.payeeContactPhone ?? "", payeeEmail: refund.payeeEmail ?? "", payeeGstin: refund.payeeGstin ?? "",
                payeeUdyamNumber: refund.payeeUdyamNumber ?? "", basicAmount: Number(refund.basicAmount).toString(), gstAmount: Number(refund.gstAmount).toString(),
                natureOfExpenditure: refund.natureOfExpenditure, fromDate: refund.fromDate, bankName: refund.bankName ?? "",
                beneficiaryName: refund.beneficiaryName ?? "", bankAccountNo: refund.bankAccountNo ?? "", bankIfsc: refund.bankIfsc ?? "",
                enclosures: refund.enclosures ?? "", specialRemarks: refund.specialRemarks ?? "",
              },
              documents: refund.documents.map((document) => ({ type: document.type, fileName: document.fileName })),
            }}
          />
        </>
      ) : (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {review?.decision === "REJECTED" ? "This request was rejected, so it can no longer be edited." : review?.decision === "RECOMMENDED" ? "This request has been recommended, so it can no longer be edited." : "This request is waiting for the recommending authority, so there is nothing to correct."}
        </p>
      )}
    </main>
  );
}
