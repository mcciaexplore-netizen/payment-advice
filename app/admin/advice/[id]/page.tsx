import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  paymentAdvices,
  attachments,
  auditLog,
  cashVoucherItems,
  paymentEntries,
  advanceParticulars,
  recommendingAuthorities,
} from "@/lib/db/schema";
import { StageBadge } from "@/components/admin/StageBadge";
import { AdviceActions } from "@/components/admin/AdviceActions";
import { BackLink } from "@/components/admin/BackLink";
import { NameCorrectionAction } from "@/components/admin/NameCorrectionAction";
import { SentBackIndicators } from "@/components/admin/SentBackIndicators";
import { PaymentMode, Status, SANCTIONER_NAMES } from "@/lib/validation/payment-advice";
import { getAdminSession } from "@/lib/admin-session";
import { billPassedForLabelFor, displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { pipelineStageFor } from "@/lib/advice/pipeline-stage";
import { formatDateOnly, formatIstDateTime } from "@/lib/date-time";
import { AttachmentPreview, InlineAttachmentPreview } from "@/components/ui/AttachmentPreview";

export const dynamic = "force-dynamic";

const DOC_TYPE_LABELS: Record<string, string> = {
  TAX_INVOICE: "Tax Invoice",
  APPROVAL_BUDGET: "Approval / Budget Letter",
  PURCHASE_ORDER: "Purchase Order",
  DELIVERY_CHALLAN: "Delivery Challan",
  OTHER: "Other",
  CASH_VOUCHER_BILL: "Bill / Supplementary Document",
};

const formatDate = formatDateOnly;
const formatDateTime = formatIstDateTime;

function formatAmount(value: string | null) {
  if (value === null) return "—";
  return `₹ ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function authorityStatusSuffix(advice: {
  authorityApprovedAt: Date | null;
  authorityRejectedAt: Date | null;
}) {
  if (advice.authorityApprovedAt) {
    return ` · Recommended ${formatDateTime(advice.authorityApprovedAt)}`;
  }
  if (advice.authorityRejectedAt) {
    return ` · Sent back ${formatDateTime(advice.authorityRejectedAt)}`;
  }
  return " · Awaiting recommendation";
}

export default async function AdviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [advice, session] = await Promise.all([
    db
      .select()
      .from(paymentAdvices)
      .where(eq(paymentAdvices.id, id))
      .limit(1)
      .then((rows) => rows[0]),
    getAdminSession(),
  ]);
  if (!advice) notFound();

  const [authority, adviceAttachments, adviceAuditLog, voucherItems, advicePaymentEntries, particulars] =
    await Promise.all([
      advice.recommendingAuthorityId
        ? db
            .select()
            .from(recommendingAuthorities)
            .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
            .limit(1)
            .then((rows) => rows[0])
        : Promise.resolve(undefined),
      db.select().from(attachments).where(eq(attachments.paymentAdviceId, id)),
      db
        .select()
        .from(auditLog)
        .where(eq(auditLog.paymentAdviceId, id))
        .orderBy(desc(auditLog.createdAt)),
      db
        .select()
        .from(cashVoucherItems)
        .where(eq(cashVoucherItems.paymentAdviceId, id))
        .orderBy(cashVoucherItems.sortOrder),
      // NEFT only in practice — Cash never inserts here (see AGENT_HANDOFF.md).
      db
        .select()
        .from(paymentEntries)
        .where(eq(paymentEntries.paymentAdviceId, id))
        .orderBy(paymentEntries.paidAt),
      // Advance Payment only — see AGENT_HANDOFF.md.
      db
        .select()
        .from(advanceParticulars)
        .where(eq(advanceParticulars.paymentAdviceId, id))
        .orderBy(advanceParticulars.sortOrder),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <BackLink label="Back to Submissions" fallbackHref="/admin/submissions" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {documentLabelFor(advice.paymentMode as PaymentMode, advice.isAdvance)}
          </p>
          <h1 className="font-heading text-3xl text-[#0b1f3a]">
            {displayNoFor(
              advice.paymentMode as PaymentMode,
              advice.serialNo,
              advice.cashVoucherNo,
              advice.isAdvance,
              advice.advanceNo,
            )}
          </h1>
          {advice.paymentMode === "CASH" || advice.isAdvance ? (
            <p className="mt-1 text-xs text-gray-500">Internal Ref.: {advice.serialNo}</p>
          ) : null}
        </div>
        <StageBadge
          stage={pipelineStageFor({
            status: advice.status,
            approvedAt: advice.authorityApprovedAt,
            financeReceivedAt: advice.financeReceivedAt,
            verifiedAt: advice.verifiedAt,
            paymentDoneAt: advice.paymentDoneAt,
            paymentMode: advice.paymentMode,
            totalPaid: advice.totalPaid,
            isAdvance: advice.isAdvance,
          })}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <Section title="Header">
            {/* Advice No. / Cash Voucher No. are now shown at the top of the
                page (primary + "Internal Ref."), not duplicated here. */}
            <Row label="Form Date" value={formatDate(advice.formDate)} />
            <Row label="Financial Year" value={advice.financialYear} />
          </Section>

          <Section title="Payee">
            <Row label="Name and Address of the Payee" value={`${advice.payeeName}, ${advice.payeeAddress}`} />
            <Row label="E-mail ID" value={advice.payeeEmail ?? "—"} />
            <Row label="Contact Person" value={advice.payeeContactPerson ?? "—"} />
            <Row label="Contact Phone" value={advice.payeeContactPhone ?? "—"} />
            <Row label="GSTIN" value={advice.payeeGstin ?? "—"} />
            <Row label="Udyam / MSME No." value={advice.payeeUdyamNumber ?? "—"} />
          </Section>

          {advice.paymentMode !== "CASH" ? <Section title="Reference">
            <Row label="P.O. No. / Date" value={`${advice.poNumber ?? "—"} / ${formatDate(advice.poDate)}`} />
            <Row
              label="Delivery Challan No. / Date"
              value={`${advice.deliveryChallanNo ?? "—"} / ${formatDate(advice.deliveryChallanDate)}`}
            />
            <Row label="Bill No. / Date" value={`${advice.billNo} / ${formatDate(advice.billDate)}`} />
          </Section> : null}

          <Section title="Money">
            {advice.isAdvance ? (
              <Row label="Amount Rs. (Particulars Total)" value={formatAmount(advice.amount)} />
            ) : advice.basicAmount !== null && advice.gstAmount !== null ? (
              <>
                <Row label="Basic Amount Rs. (*Subject to TDS)" value={formatAmount(advice.basicAmount)} />
                <Row label="GST Amount Rs." value={formatAmount(advice.gstAmount)} />
                <Row label="Total Rs." value={formatAmount(advice.amount)} />
              </>
            ) : (
              <Row label="Amount Rs." value={formatAmount(advice.amount)} />
            )}
            <Row label={billPassedForLabelFor(advice.isAdvance)} value={formatAmount(advice.billPassedFor)} />
          </Section>

          <Section title="Narrative">
            <Row
              label={advice.isAdvance ? "Purpose of Advance" : "Nature of Expenditure"}
              value={advice.natureOfExpenditure}
              block
            />
            <Row label="Enclosures" value={advice.enclosures ?? "—"} block />
            <Row label="Special Remarks" value={advice.specialRemarks ?? "—"} block />
          </Section>

          {advice.isAdvance ? (
            <Section title="Advance Details">
              <Row
                label="Previous Pending Advance"
                value={
                  advice.previousPendingAdvanceAmount && Number(advice.previousPendingAdvanceAmount) > 0
                    ? `${formatAmount(advice.previousPendingAdvanceAmount)} (since ${formatDate(advice.previousPendingAdvanceSince)})`
                    : "None"
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="pb-2">Description</th>
                      <th className="pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {particulars.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-2">{item.description}</td>
                        <td className="py-2 text-right">{formatAmount(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {advice.paymentMode === "CASH" && !advice.isAdvance ? (
            <Section title="Cash Voucher Items">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500"><tr><th className="pb-2">Bill Date</th><th className="pb-2">Bill No.</th><th className="pb-2">Nature of Expenditure</th><th className="pb-2 text-right">Amount</th><th className="pb-2 pl-3">Bill</th></tr></thead>
                  <tbody>
                    {voucherItems.map((item) => {
                      const bill = item.attachmentId ? adviceAttachments.find((attachment) => attachment.id === item.attachmentId) : undefined;
                      return <tr key={item.id} className="border-b border-gray-100 last:border-0"><td className="py-2">{formatDate(item.billDate)}</td><td className="py-2">{item.billNo || "—"}</td><td className="py-2">{item.description}</td><td className="py-2 text-right">{formatAmount(item.amount)}</td><td className="py-2 pl-3">{bill ? <AttachmentPreview fileName={bill.fileName} href={`/api/admin/attachments/${bill.id}`}>Preview</AttachmentPreview> : "—"}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          <Section title="Payment">
            <Row label="Mode" value={advice.isAdvance ? `${advice.paymentMode} (Advance)` : advice.paymentMode} />
            {advice.paymentMode === "NEFT" ? (
              <>
                <Row label="Bank A/c No." value={advice.bankAccountNo ?? "—"} />
                <Row label="IFSC" value={advice.bankIfsc ?? "—"} />
                <Row label="Beneficiary Name" value={advice.beneficiaryName ?? "—"} />
                <Row label="Bank Name" value={advice.bankName ?? "—"} />
              </>
            ) : null}
          </Section>

          <Section title="People">
            <Row label="Submitted By" value={`${advice.submittedByName} (${advice.submittedByEmail})`} />
            <Row label="Department" value={advice.submittedByDepartment} />
            <Row label="Branch" value={advice.branch ?? "—"} />
            <Row
              label="Recommending Authority"
              value={`${authority?.authorityName ?? "—"}${authorityStatusSuffix(advice)}`}
            />
          </Section>

          <Section title="Finance Pipeline">
            <Row
              label="Received & In Process"
              value={advice.financeReceivedAt ? formatDateTime(advice.financeReceivedAt) : "Pending"}
            />
            <Row
              label="Verified By"
              value={
                advice.verifiedAt && advice.verifiedBy
                  ? `${advice.verifiedBy} · ${formatDateTime(advice.verifiedAt)}`
                  : "Pending"
              }
            />
            <Row
              label="Payment Done"
              value={
                advice.paymentDoneAt && advice.paymentDoneBy
                  ? `${advice.paymentDoneBy} · ${formatDateTime(advice.paymentDoneAt)}`
                  : advice.verifiedAt
                    ? "Ready for Payment"
                    : "Pending"
              }
            />
            {/* Sanction is retired as an active step (see AGENT_HANDOFF.md) —
                shown only when a historical row already has it set, so the
                "Correct name" action stays available for old data without
                implying Sanction is still part of the active flow. */}
            {advice.sanctionedAt && advice.sanctionedBy ? (
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-[200px] text-xs font-medium uppercase tracking-wide text-gray-500">
                  Sanctioned By (historical)
                </span>
                <span className="flex items-center gap-3 text-sm text-[#171717]">
                  {advice.sanctionedBy} · {formatDateTime(advice.sanctionedAt)}
                  <NameCorrectionAction
                    adviceId={advice.id}
                    kind="sanction"
                    currentName={advice.sanctionedBy}
                    options={SANCTIONER_NAMES}
                  />
                </span>
              </div>
            ) : null}
          </Section>

          <Section title="Attachments">
            {adviceAttachments.length === 0 ? (
              <p className="text-sm text-gray-500">No attachments.</p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {adviceAttachments.map((a) => (
                  <InlineAttachmentPreview
                    key={a.id}
                    fileName={a.fileName}
                    href={`/api/admin/attachments/${a.id}`}
                    label={DOC_TYPE_LABELS[a.docType] ?? a.docType}
                    meta={formatBytes(a.sizeBytes)}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Audit Trail">
            {adviceAuditLog.length === 0 ? (
              <p className="text-sm text-gray-500">No audit events yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {adviceAuditLog.map((entry) => (
                  <li key={entry.id} className="border-b border-gray-100 pb-2 text-sm last:border-0">
                    <span className="font-medium text-[#0b1f3a]">{entry.action}</span>{" "}
                    <span className="text-gray-500">
                      by {entry.actor} · {formatDateTime(entry.createdAt)}
                      {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          {advice.status === "SENT_BACK" ? (
            <div className="rounded-md border border-[#e8a33d]/40 bg-[#e8a33d]/10 p-4 text-sm text-[#8a5a12]">
              <SentBackIndicators sentBackAt={advice.sentBackAt} editTokenExpiresAt={advice.editTokenExpiresAt} />
              {advice.adminRemarks ? (
                <>
                  <p className="mt-3 font-medium">Send-back remarks</p>
                  <p className="mt-1 whitespace-pre-wrap">{advice.adminRemarks}</p>
                </>
              ) : null}
            </div>
          ) : null}
          {advice.status === "REJECTED" ? <div className="rounded-md border border-red-400 bg-red-50 p-4 text-sm text-red-950"><p className="font-medium">Rejected by {advice.rejectedBy ?? "—"}</p><p className="mt-1 text-xs">{advice.rejectedAt ? formatDateTime(advice.rejectedAt) : "—"}</p><p className="mt-3 whitespace-pre-wrap"><span className="font-medium">Remarks:</span> {advice.rejectionRemarks ?? "—"}</p><p className="mt-3 text-xs">Permanently closed; reference number retained.</p></div> : null}
          <AdviceActions
            adviceId={advice.id}
            status={advice.status as Status}
            initialBillPassedFor={advice.billPassedFor}
            initialEditToken={advice.editToken}
            paymentMode={advice.paymentMode as "NEFT" | "CASH"}
            isAdvance={advice.isAdvance}
            authorityToken={advice.authorityToken}
            authorityName={authority?.authorityName ?? "Recommending Authority"}
            authorityApprovedAt={advice.authorityApprovedAt?.toISOString() ?? null}
            authorityRejectedAt={advice.authorityRejectedAt?.toISOString() ?? null}
            financeReceivedAt={advice.financeReceivedAt?.toISOString() ?? null}
            verifiedAt={advice.verifiedAt?.toISOString() ?? null}
            verifiedBy={advice.verifiedBy}
            sanctionedAt={advice.sanctionedAt?.toISOString() ?? null}
            sanctionedBy={advice.sanctionedBy}
            paymentDoneAt={advice.paymentDoneAt?.toISOString() ?? null}
            paymentDoneBy={advice.paymentDoneBy}
            totalPaid={advice.totalPaid}
            paymentEntries={advicePaymentEntries.map((entry) => ({
              id: entry.id,
              amount: entry.amount,
              remarks: entry.remarks,
              paidAt: entry.paidAt.toISOString(),
              paidBy: entry.paidBy,
            }))}
            currentUserFullName={session?.fullName ?? "Unknown"}
            currentUserRoles={session?.roles ?? ["ALL"]}
          />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-xl text-[#0b1f3a]">{title}</h2>
      <div className="flex flex-col gap-2 rounded-md border border-gray-200 p-4">{children}</div>
    </section>
  );
}

function Row({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div className={block ? "flex flex-col gap-1" : "flex items-baseline gap-2 text-sm"}>
      <span className="min-w-[200px] text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span className={block ? "whitespace-pre-wrap text-sm text-[#171717]" : "text-sm text-[#171717]"}>
        {value}
      </span>
    </div>
  );
}
