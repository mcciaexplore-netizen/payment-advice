import Link from "next/link";
import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUsers, paymentAdvices } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { displayNoFor } from "@/lib/advice/document-identity";
import { pipelineStageFor } from "@/lib/advice/pipeline-stage";
import { StageBadge } from "@/components/admin/StageBadge";
import { StageLegend } from "@/components/admin/StageLegend";
import { PaymentMode } from "@/lib/validation/payment-advice";
import { formatIstDate } from "@/lib/date-time";

export const dynamic = "force-dynamic";
type AuthorityView = "pending" | "history" | "my-submissions";

function date(value: Date | string) {
  return formatIstDate(value);
}

export default async function AuthorityDashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await getAdminSession();
  if (!session?.recommendingAuthorityId) return null;
  const requestedView = (await searchParams).view;
  const view: AuthorityView = requestedView === "history" ? "history" : requestedView === "my-submissions" ? "my-submissions" : "pending";

  const [account] = await db.select({ email: adminUsers.email }).from(adminUsers)
    .where(eq(adminUsers.id, session.adminUserId)).limit(1);
  if (!account) return null;

  const approvalScope = eq(paymentAdvices.recommendingAuthorityId, session.recommendingAuthorityId);
  const where = view === "my-submissions"
    ? eq(paymentAdvices.submittedByEmail, account.email)
    : and(approvalScope, view === "history"
      ? or(isNotNull(paymentAdvices.authorityApprovedAt), isNotNull(paymentAdvices.authorityRejectedAt))
      : and(eq(paymentAdvices.status, "SUBMITTED"), isNull(paymentAdvices.authorityApprovedAt), isNull(paymentAdvices.authorityRejectedAt)));

  const rows = await db.select({
    id: paymentAdvices.id, serialNo: paymentAdvices.serialNo,
    cashVoucherNo: paymentAdvices.cashVoucherNo, advanceNo: paymentAdvices.advanceNo,
    isAdvance: paymentAdvices.isAdvance, paymentMode: paymentAdvices.paymentMode,
    payeeName: paymentAdvices.payeeName, amount: paymentAdvices.amount,
    nature: paymentAdvices.natureOfExpenditure, submittedBy: paymentAdvices.submittedByName,
    submittedAt: paymentAdvices.submittedAt, status: paymentAdvices.status,
    approvedAt: paymentAdvices.authorityApprovedAt, rejectedAt: paymentAdvices.authorityRejectedAt,
    authorityRemarks: paymentAdvices.authorityRemarks, adminRemarks: paymentAdvices.adminRemarks,
    financeReceivedAt: paymentAdvices.financeReceivedAt, verifiedAt: paymentAdvices.verifiedAt,
    paymentDoneAt: paymentAdvices.paymentDoneAt, totalPaid: paymentAdvices.totalPaid,
    revisionCount: paymentAdvices.revisionCount,
  }).from(paymentAdvices).where(where).orderBy(desc(paymentAdvices.submittedAt));

  const subtitle = view === "history" ? "Your previous recommendation decisions"
    : view === "my-submissions" ? `${rows.length} submission${rows.length === 1 ? "" : "s"} made using ${account.email}`
      : `${rows.length} submission${rows.length === 1 ? "" : "s"} waiting for you`;

  return (
    <div className="flex flex-col gap-6">
      <header><h1 className="font-heading text-3xl text-[#0b1f3a]">Authority Recommendations</h1><p className="mt-1 text-sm text-gray-600">{subtitle}</p></header>
      <nav className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-0">
        <Tab href="/authority" active={view === "pending"}>Pending My Recommendation</Tab>
        <Tab href="/authority?view=history" active={view === "history"}>History</Tab>
        <Tab href="/authority?view=my-submissions" active={view === "my-submissions"}>My Submissions</Tab>
        <div className="ml-auto mb-1.5"><StageLegend /></div>
      </nav>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-10 text-center text-sm text-gray-500">
          {view === "history" ? "No decisions recorded yet." : view === "my-submissions" ? "No submissions found for your login email." : "Nothing is waiting for your recommendation."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200"><table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>
            <th className="p-3">Reference</th><th className="p-3">Payee / Particulars</th><th className="p-3">Amount</th><th className="p-3">Submitted</th>
            <th className="p-3">{view === "history" ? "Decision" : view === "my-submissions" ? "Current Stage" : "Action"}</th>
            {view === "history" ? <th className="p-3">Action</th> : null}
          </tr></thead>
          <tbody className="divide-y divide-gray-100">{rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="p-3 font-medium text-[#0b1f3a]">{displayNoFor(row.paymentMode as PaymentMode, row.serialNo, row.cashVoucherNo, row.isAdvance, row.advanceNo)}</td>
              <td className="p-3"><div className="font-medium">{row.payeeName}</div><div className="mt-1 max-w-xs text-xs text-gray-600">{row.nature}</div>{view === "pending" && row.revisionCount >= 1 ? <div className="mt-2 max-w-sm rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"><strong>Resubmission — revision {row.revisionCount}</strong>{row.adminRemarks ? <div className="mt-1">Previous remarks: {row.adminRemarks}</div> : null}</div> : null}</td>
              <td className="p-3 whitespace-nowrap">₹ {Number(row.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              <td className="p-3 whitespace-nowrap">{view !== "my-submissions" ? <div>{row.submittedBy}</div> : null}<div className="text-xs text-gray-500">{date(row.submittedAt)}</div></td>
              <td className="p-3">{view === "pending" ? (
                <div className="flex flex-col items-start gap-2">
                  <StageBadge stage="Waiting on Authority" />
                  <ViewLink adviceId={row.id} from="pending" />
                </div>
              ) : view === "history" ? (
                <div className="text-xs"><StageBadge stage={row.approvedAt ? "Awaiting Finance Review" : "Sent Back"} /><div className="mt-1 text-gray-500">{date(row.approvedAt ?? row.rejectedAt!)}</div>{row.authorityRemarks ? <div className="mt-1 max-w-xs text-gray-600">{row.authorityRemarks}</div> : null}</div>
              ) : (
                <div className="text-xs"><StageBadge stage={pipelineStageFor(row)} />{row.adminRemarks ? <div className="mt-2 max-w-xs rounded bg-amber-50 px-2 py-1 text-amber-800">Sent-back remarks: {row.adminRemarks}</div> : null}</div>
              )}</td>
              {view === "history" ? <td className="p-3"><ViewLink adviceId={row.id} from="history" /></td> : null}
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function ViewLink({ adviceId, from }: { adviceId: string; from: "pending" | "history" }) {
  return <Link href={`/authority/advice/${adviceId}?from=${from}`} className="inline-flex rounded-md bg-[#0b1f3a] px-3 py-2 text-xs font-medium text-white hover:bg-[#0b1f3a]/90">View</Link>;
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`px-4 py-2 text-sm font-medium ${active ? "border-b-2 border-[#0b1f3a] text-[#0b1f3a]" : "text-gray-500"}`}>{children}</Link>;
}
