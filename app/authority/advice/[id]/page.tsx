import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/BackLink";
import { AuthorityQueueActions } from "@/components/authority/AuthorityQueueActions";
import { getAdminSession } from "@/lib/admin-session";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { db } from "@/lib/db";
import {
  advanceParticulars,
  attachments,
  cashVoucherItems,
  paymentAdvices,
  recommendingAuthorities,
} from "@/lib/db/schema";
import { PaymentMode } from "@/lib/validation/payment-advice";
import { ResubmissionNotice } from "@/components/authority/ResubmissionNotice";
import { formatDateOnly, formatIstDate, formatIstDateTime } from "@/lib/date-time";

export const dynamic = "force-dynamic";

const DOC_TYPE_LABELS: Record<string, string> = {
  TAX_INVOICE: "Tax Invoice",
  APPROVAL_BUDGET: "Approval / Budget Letter",
  PURCHASE_ORDER: "Purchase Order",
  DELIVERY_CHALLAN: "Delivery Challan",
  OTHER: "Other",
};

function formatDate(value: string | Date | null) {
  if (!value) return "—";
  return value instanceof Date ? formatIstDate(value) : formatDateOnly(value);
}

const formatDateTime = formatIstDateTime;

function formatAmount(value: string | null) {
  return value === null ? "—" : `₹ ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default async function AuthorityAdviceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }, session] = await Promise.all([params, searchParams, getAdminSession()]);
  if (session?.adminRole !== "AUTHORITY" || !session.recommendingAuthorityId) notFound();

  const advice = await db.select().from(paymentAdvices).where(and(
    eq(paymentAdvices.id, id),
    eq(paymentAdvices.recommendingAuthorityId, session.recommendingAuthorityId),
  )).limit(1).then((rows) => rows[0]);
  if (!advice) notFound();

  const [authority, documents, voucherItems, particulars] = await Promise.all([
    db.select({ authorityName: recommendingAuthorities.authorityName })
      .from(recommendingAuthorities)
      .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
      .limit(1).then((rows) => rows[0]),
    db.select().from(attachments).where(eq(attachments.paymentAdviceId, id)),
    db.select().from(cashVoucherItems).where(eq(cashVoucherItems.paymentAdviceId, id)).orderBy(cashVoucherItems.sortOrder),
    db.select().from(advanceParticulars).where(eq(advanceParticulars.paymentAdviceId, id)).orderBy(advanceParticulars.sortOrder),
  ]);

  const isPending = advice.status === "SUBMITTED" && !advice.authorityApprovedAt && !advice.authorityRejectedAt;
  const fallbackHref = from === "history" ? "/authority?view=history" : "/authority";

  return (
    <div className="flex flex-col gap-8">
      <BackLink label="Back to Authority Recommendations" fallbackHref={fallbackHref} />
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {documentLabelFor(advice.paymentMode as PaymentMode, advice.isAdvance)}
          </p>
          <h1 className="font-heading text-3xl text-[#0b1f3a]">
            {displayNoFor(advice.paymentMode as PaymentMode, advice.serialNo, advice.cashVoucherNo, advice.isAdvance, advice.advanceNo)}
          </h1>
          {advice.paymentMode === "CASH" || advice.isAdvance ? <p className="mt-1 text-xs text-gray-500">Internal Ref.: {advice.serialNo}</p> : null}
        </div>
        <DecisionStatus advice={advice} />
      </header>

      <ResubmissionNotice revisionCount={advice.revisionCount} previousRemarks={advice.adminRemarks} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <Section title="Submission">
            <Row label="Submitted By" value={`${advice.submittedByName} (${advice.submittedByEmail})`} />
            <Row label="Department" value={advice.submittedByDepartment} />
            <Row label="Submitted Date" value={formatDateTime(advice.submittedAt)} />
            <Row label="Form Date" value={formatDate(advice.formDate)} />
            <Row label="Recommending Authority" value={authority?.authorityName ?? "—"} />
          </Section>

          <Section title="Payee">
            <Row label="Name and Address" value={`${advice.payeeName}, ${advice.payeeAddress}`} block />
            <Row label="Email" value={advice.payeeEmail ?? "—"} />
            <Row label="Contact Person" value={advice.payeeContactPerson ?? "—"} />
            <Row label="Contact Phone" value={advice.payeeContactPhone ?? "—"} />
            <Row label="GSTIN" value={advice.payeeGstin ?? "—"} />
            <Row label="Udyam / MSME No." value={advice.payeeUdyamNumber ?? "—"} />
          </Section>

          {!advice.isAdvance ? <Section title="Bill & Reference">
            <Row label="P.O. No. / Date" value={`${advice.poNumber ?? "—"} / ${formatDate(advice.poDate)}`} />
            <Row label="Delivery Challan No. / Date" value={`${advice.deliveryChallanNo ?? "—"} / ${formatDate(advice.deliveryChallanDate)}`} />
            <Row label="Bill No. / Date" value={`${advice.billNo} / ${formatDate(advice.billDate)}`} />
          </Section> : null}

          <Section title="Amount">
            {advice.isAdvance ? <Row label="Particulars Total" value={formatAmount(advice.amount)} />
              : advice.basicAmount !== null && advice.gstAmount !== null ? <>
                <Row label="Basic Amount (*Subject to TDS)" value={formatAmount(advice.basicAmount)} />
                <Row label="GST Amount" value={formatAmount(advice.gstAmount)} />
                <Row label="Total" value={formatAmount(advice.amount)} />
              </> : <Row label="Total" value={formatAmount(advice.amount)} />}
          </Section>

          {particulars.length ? <ItemsSection title="Particulars" items={particulars} /> : null}
          {voucherItems.length ? <ItemsSection title="Nature of Expenditure" items={voucherItems} /> : null}

          <Section title="Details">
            <Row label={advice.isAdvance ? "Purpose of Advance" : "Nature of Expenditure"} value={advice.natureOfExpenditure} block />
            <Row label="Enclosures" value={advice.enclosures ?? "—"} block />
            <Row label="Special Remarks" value={advice.specialRemarks ?? "—"} block />
            {advice.isAdvance ? <Row label="Previous Pending Advance" value={advice.previousPendingAdvanceAmount && Number(advice.previousPendingAdvanceAmount) > 0 ? `${formatAmount(advice.previousPendingAdvanceAmount)} since ${formatDate(advice.previousPendingAdvanceSince)}` : "None"} /> : null}
          </Section>

          <Section title="Payment">
            <Row label="Mode" value={advice.isAdvance ? `${advice.paymentMode} (Advance)` : advice.paymentMode} />
            {advice.paymentMode === "NEFT" ? <>
              <Row label="Bank A/c No." value={advice.bankAccountNo ?? "—"} />
              <Row label="IFSC" value={advice.bankIfsc ?? "—"} />
              <Row label="Beneficiary Name" value={advice.beneficiaryName ?? "—"} />
            </> : null}
          </Section>
        </div>

        <aside className="flex flex-col gap-8">
          <Section title="Attachments">
            {documents.length === 0 ? <p className="text-sm text-gray-500">No documents attached.</p> : documents.map((document) => (
              <a key={document.id} href={`/api/authority/advice/${advice.id}/attachments/${document.id}`} target="_blank" rel="noreferrer" className="block rounded-md border border-gray-200 p-3 text-sm text-[#0b1f3a] hover:bg-gray-50">
                <span className="block font-medium">{DOC_TYPE_LABELS[document.docType] ?? document.docType}</span>
                <span className="mt-1 block break-all text-xs text-gray-500">{document.fileName}</span>
              </a>
            ))}
          </Section>

          <Section title={isPending ? "Decision" : "Decision Record"}>
            {isPending ? <AuthorityQueueActions adviceId={advice.id} /> : <DecisionRecord advice={advice} />}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function DecisionStatus({ advice }: { advice: { authorityApprovedAt: Date | null; authorityRejectedAt: Date | null } }) {
  if (advice.authorityApprovedAt) return <span className="rounded-full bg-[#2e8b57]/10 px-3 py-1 text-sm font-medium text-[#1f6b41]">Recommended</span>;
  if (advice.authorityRejectedAt) return <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">Sent Back</span>;
  return <span className="rounded-full bg-[#e8a33d]/15 px-3 py-1 text-sm font-medium text-[#8a5a12]">Pending My Recommendation</span>;
}

function DecisionRecord({ advice }: { advice: { authorityApprovedAt: Date | null; authorityRejectedAt: Date | null; authorityRemarks: string | null } }) {
  return <div className="text-sm">
    <p className="font-medium text-[#0b1f3a]">{advice.authorityApprovedAt ? `Recommended ${formatDateTime(advice.authorityApprovedAt)}` : `Sent back ${formatDateTime(advice.authorityRejectedAt)}`}</p>
    {advice.authorityRemarks ? <p className="mt-3 whitespace-pre-wrap text-gray-600">Remarks: {advice.authorityRemarks}</p> : null}
    <p className="mt-3 text-xs text-gray-500">This record is read-only.</p>
  </div>;
}

function ItemsSection({ title, items }: { title: string; items: Array<{ id: string; description: string; amount: string }> }) {
  return <Section title={title}><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-gray-200 text-xs uppercase text-gray-500"><tr><th className="pb-2">Description</th><th className="pb-2 text-right">Amount</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-gray-100 last:border-0"><td className="py-2">{item.description}</td><td className="py-2 text-right">{formatAmount(item.amount)}</td></tr>)}</tbody></table></div></Section>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-gray-200 bg-white p-5"><h2 className="mb-4 font-heading text-xl text-[#0b1f3a]">{title}</h2><div className="flex flex-col gap-3">{children}</div></section>;
}

function Row({ label, value, block = false }: { label: string; value: string; block?: boolean }) {
  return <div className={block ? "flex flex-col gap-1" : "grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3 text-sm"}><span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span><span className="whitespace-pre-wrap text-[#171717]">{value}</span></div>;
}
