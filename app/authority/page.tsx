import Link from "next/link";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments, paymentAdvices } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { displayNoFor } from "@/lib/advice/document-identity";
import { PaymentMode } from "@/lib/validation/payment-advice";
import { AuthorityQueueActions } from "@/components/authority/AuthorityQueueActions";

export const dynamic = "force-dynamic";

function date(value: Date | string) { return new Date(value).toLocaleDateString("en-IN"); }

export default async function AuthorityDashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await getAdminSession();
  if (!session?.recommendingAuthorityId) return null;
  const history = (await searchParams).view === "history";
  const scope = eq(paymentAdvices.recommendingAuthorityId, session.recommendingAuthorityId);
  const decision = history
    ? or(isNotNull(paymentAdvices.authorityApprovedAt), isNotNull(paymentAdvices.authorityRejectedAt))
    : and(eq(paymentAdvices.status, "SUBMITTED"), isNull(paymentAdvices.authorityApprovedAt), isNull(paymentAdvices.authorityRejectedAt));

  const rows = await db.select({
    id: paymentAdvices.id, serialNo: paymentAdvices.serialNo, cashVoucherNo: paymentAdvices.cashVoucherNo,
    advanceNo: paymentAdvices.advanceNo, isAdvance: paymentAdvices.isAdvance, paymentMode: paymentAdvices.paymentMode,
    payeeName: paymentAdvices.payeeName, amount: paymentAdvices.amount,
    nature: paymentAdvices.natureOfExpenditure, submittedBy: paymentAdvices.submittedByName,
    submittedAt: paymentAdvices.submittedAt, approvedAt: paymentAdvices.authorityApprovedAt,
    rejectedAt: paymentAdvices.authorityRejectedAt, remarks: paymentAdvices.authorityRemarks,
  }).from(paymentAdvices).where(and(scope, decision)).orderBy(desc(paymentAdvices.submittedAt));

  const ids = rows.map((row) => row.id);
  const docs = ids.length ? await db.select({ id: attachments.id, adviceId: attachments.paymentAdviceId, fileName: attachments.fileName, docType: attachments.docType }).from(attachments).where(inArray(attachments.paymentAdviceId, ids)) : [];
  const allowedDocs = docs.filter((doc) => ids.includes(doc.adviceId) && ["TAX_INVOICE", "APPROVAL_BUDGET"].includes(doc.docType));

  return <div className="flex flex-col gap-6">
    <header>
      <h1 className="font-heading text-3xl text-[#0b1f3a]">Authority Approvals</h1>
      <p className="mt-1 text-sm text-gray-600">{history ? "Your previous decisions" : `${rows.length} submission${rows.length === 1 ? "" : "s"} waiting for you`}</p>
    </header>
    <nav className="flex gap-2 border-b border-gray-200">
      <Link href="/authority" className={`px-4 py-2 text-sm font-medium ${!history ? "border-b-2 border-[#0b1f3a] text-[#0b1f3a]" : "text-gray-500"}`}>Waiting on Me</Link>
      <Link href="/authority?view=history" className={`px-4 py-2 text-sm font-medium ${history ? "border-b-2 border-[#0b1f3a] text-[#0b1f3a]" : "text-gray-500"}`}>History</Link>
    </nav>
    {rows.length === 0 ? <div className="rounded-lg border border-gray-200 p-10 text-center text-sm text-gray-500">{history ? "No decisions recorded yet." : "Nothing is waiting for your approval."}</div> :
      <div className="overflow-x-auto rounded-lg border border-gray-200"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Reference</th><th className="p-3">Payee / Particulars</th><th className="p-3">Amount</th><th className="p-3">Submitted</th><th className="p-3">Attachments</th><th className="p-3">{history ? "Decision" : "Action"}</th></tr></thead><tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.id} className="align-top"><td className="p-3 font-medium text-[#0b1f3a]">{displayNoFor(row.paymentMode as PaymentMode, row.serialNo, row.cashVoucherNo, row.isAdvance, row.advanceNo)}</td><td className="p-3"><div className="font-medium">{row.payeeName}</div><div className="mt-1 max-w-xs text-xs text-gray-600">{row.nature}</div></td><td className="p-3 whitespace-nowrap">₹ {Number(row.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td className="p-3 whitespace-nowrap"><div>{row.submittedBy}</div><div className="text-xs text-gray-500">{date(row.submittedAt)}</div></td><td className="p-3">{allowedDocs.filter((doc) => doc.adviceId === row.id).map((doc) => <a key={doc.id} href={`/api/authority/advice/${row.id}/attachments/${doc.id}`} target="_blank" rel="noreferrer" className="block text-xs font-medium text-[#0b1f3a] hover:underline">{doc.docType === "TAX_INVOICE" ? "Tax Invoice" : "Approval / Budget"}</a>)}</td><td className="p-3">{history ? <div className="text-xs"><span className={`font-semibold ${row.approvedAt ? "text-[#2e8b57]" : "text-amber-700"}`}>{row.approvedAt ? "Approved" : "Sent Back"}</span><div className="mt-1 text-gray-500">{date(row.approvedAt ?? row.rejectedAt!)}</div>{row.remarks ? <div className="mt-1 max-w-xs text-gray-600">{row.remarks}</div> : null}</div> : <AuthorityQueueActions adviceId={row.id} />}</td></tr>)}</tbody></table></div>}
  </div>;
}
