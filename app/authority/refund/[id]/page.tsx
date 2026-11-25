import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auditLog, refundRequestReviews, refundRequests } from "@/lib/db/schema";
import { formatDateOnly, formatIstDate } from "@/lib/date-time";
import { refundRecommendationEnabled } from "@/lib/refund-requests";
import { getRefundAuthority } from "@/lib/advice/refund-authority-session";
import { refundsForAuthorityWhere } from "@/lib/advice/refund-authority";
import { REFUND_DOCUMENT_LABELS } from "@/lib/advice/refund-query";
import { AttachmentPreview } from "@/components/ui/AttachmentPreview";
import { RefundDecisionActions } from "@/components/admin/RefundDecisionActions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const money = (value: string) => `₹ ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

/** The page a recommending authority opens to review one refund that names
 * them: everything on the request, its documents, and (while it is still
 * waiting) the Recommend / Send back buttons. Only the authority named on the
 * refund can open it; anyone else gets a 404. */
export default async function AuthorityRefundPage({ params }: { params: Promise<{ id: string }> }) {
  if (!refundRecommendationEnabled()) notFound();
  const authority = await getRefundAuthority();
  if (!authority) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [found] = await db
    .select({ refund: refundRequests, review: refundRequestReviews })
    .from(refundRequests)
    .leftJoin(refundRequestReviews, eq(refundRequestReviews.refundRequestId, refundRequests.id))
    .where(and(eq(refundRequests.id, id), refundsForAuthorityWhere(authority.name)))
    .limit(1);
  if (!found) notFound();
  const { refund, review } = found;
  // Resubmission history comes from the audit log (no extra columns): how
  // many times the submitter corrected it, and the remarks they answered.
  const resubmissions = await db
    .select({ details: auditLog.details, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.refundRequestId, refund.id), eq(auditLog.action, "REFUND_REQUEST_RESUBMITTED")))
    .orderBy(desc(auditLog.createdAt));
  const lastResubmission = resubmissions[0] as { details: { sentBackRemarks?: string | null } | null; createdAt: Date } | undefined;

  const rows: [string, string | null][] = [
    ["Submitted by", `${refund.submittedByName} (${refund.submittedByEmail})`],
    ["Department / Branch", `${refund.submittedByDepartment}, ${refund.branch}`],
    ["Payee", refund.payeeName],
    ["Payee address", refund.payeeAddress],
    ["Contact", [refund.payeeContactPerson, refund.payeeContactPhone, refund.payeeEmail].filter(Boolean).join(", ") || null],
    ["GSTIN / Udyam", [refund.payeeGstin, refund.payeeUdyamNumber].filter(Boolean).join(" / ") || null],
    ["Reason", refund.natureOfExpenditure],
    ["From date", formatDateOnly(refund.fromDate)],
    ["Basic amount", money(refund.basicAmount)],
    ["GST amount", money(refund.gstAmount)],
    ["Total refund", money(refund.totalAmount)],
    ["Bank", [refund.bankName, refund.beneficiaryName, refund.bankAccountNo, refund.bankIfsc].filter(Boolean).join(", ") || null],
    ["Enclosures", refund.enclosures],
    ["Special remarks", refund.specialRemarks],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/authority?role=AUTHORITY&view=refund-requests" className="w-fit text-sm font-medium text-gray-600 hover:text-[#0b1f3a]">← Back to Refund Requests</Link>
      <header>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">{refund.serialNo}</h1>
        <p className="mt-1 text-sm text-gray-600">Third party refund request dated {formatDateOnly(refund.requestDate)}. You are named as the Recommending Authority.</p>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border border-gray-200 p-6 text-sm sm:grid-cols-2">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="font-medium text-[#0b1f3a]">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-xl text-[#0b1f3a]">Documents</h2>
        {refund.documents.length === 0 ? <p className="text-sm text-gray-500">None attached.</p> : (
          <ul className="flex flex-col gap-1.5">
            {refund.documents.map((document, index) => {
              const href = `/api/authority/refund/${refund.id}/documents/${index}`;
              return (
                <li key={`${refund.id}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-500">{REFUND_DOCUMENT_LABELS[document.type] ?? document.type}:</span>
                  <AttachmentPreview fileName={document.fileName} href={href} className="font-medium text-[#0b1f3a] hover:underline">{document.fileName}</AttachmentPreview>
                  <a href={`${href}?download=1`} download={document.fileName} className="text-gray-600 underline">Download</a>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <a href={`/api/refund/${refund.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">View request PDF</a>
          <a href={`/api/refund/${refund.id}/pdf?download=1`} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Download request PDF</a>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-xl text-[#0b1f3a]">Your decision</h2>
        {!review && lastResubmission ? (
          <div className="max-w-xl rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>Resubmitted after being sent back (revision {resubmissions.length})</strong> on {formatIstDate(lastResubmission.createdAt)}.
            {lastResubmission.details?.sentBackRemarks ? <div className="mt-1">Previous remarks: {lastResubmission.details.sentBackRemarks}</div> : null}
          </div>
        ) : null}
        {!review ? <RefundDecisionActions refundId={refund.id} /> : review.decision === "RECOMMENDED" ? (
          <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">Recommended by {review.decidedByName} on {formatIstDate(review.decidedAt)}. The request has gone to Finance.</p>
        ) : review.decision === "REJECTED" ? (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-900">
            <p>Rejected by {review.decidedByName} on {formatIstDate(review.decidedAt)}. This is final.</p>
            <p className="mt-1">Reason: {review.remarks}</p>
          </div>
        ) : (
          <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>Sent back by {review.decidedByName} on {formatIstDate(review.decidedAt)}. Waiting for the submitter to correct and resubmit it.</p>
            <p className="mt-1">Remarks: {review.remarks}</p>
          </div>
        )}
      </section>
    </div>
  );
}
