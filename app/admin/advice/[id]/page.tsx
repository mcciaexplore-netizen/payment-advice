import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  paymentAdvices,
  attachments,
  auditLog,
  cashVoucherItems,
  recommendingAuthorities,
} from "@/lib/db/schema";
import { StatusChip } from "@/components/admin/StatusChip";
import { AdviceActions } from "@/components/admin/AdviceActions";
import { Status } from "@/lib/validation/payment-advice";

export const dynamic = "force-dynamic";

const DOC_TYPE_LABELS: Record<string, string> = {
  TAX_INVOICE: "Tax Invoice",
  APPROVAL_BUDGET: "Approval / Budget Letter",
  PURCHASE_ORDER: "Purchase Order",
  DELIVERY_CHALLAN: "Delivery Challan",
  OTHER: "Other",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return value.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
    return ` · Approved ${formatDateTime(advice.authorityApprovedAt)}`;
  }
  if (advice.authorityRejectedAt) {
    return ` · Sent back ${formatDateTime(advice.authorityRejectedAt)}`;
  }
  return " · Awaiting approval";
}

export default async function AdviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [advice] = await db
    .select()
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) notFound();

  const [authority, adviceAttachments, adviceAuditLog, voucherItems] = await Promise.all([
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
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Payment Advice
          </p>
          <h1 className="font-heading text-3xl text-[#0b1f3a]">{advice.serialNo}</h1>
        </div>
        <StatusChip status={advice.status as Status} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <Section title="Header">
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

          <Section title="Reference">
            <Row label="P.O. No. / Date" value={`${advice.poNumber ?? "—"} / ${formatDate(advice.poDate)}`} />
            <Row
              label="Delivery Challan No. / Date"
              value={`${advice.deliveryChallanNo ?? "—"} / ${formatDate(advice.deliveryChallanDate)}`}
            />
            <Row label="Bill No. / Date" value={`${advice.billNo} / ${formatDate(advice.billDate)}`} />
          </Section>

          <Section title="Money">
            <Row label="Amount Rs." value={formatAmount(advice.amount)} />
            <Row label="Bill passed for Rs." value={formatAmount(advice.billPassedFor)} />
          </Section>

          <Section title="Narrative">
            <Row label="Nature of Expenditure" value={advice.natureOfExpenditure} block />
            <Row label="Enclosures" value={advice.enclosures ?? "—"} block />
            <Row label="Special Remarks" value={advice.specialRemarks ?? "—"} block />
          </Section>

          {advice.paymentMode === "CASH" ? (
            <Section title="Cash Voucher Items">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500"><tr><th className="pb-2">Nature of Expenditure</th><th className="pb-2 text-right">Amount</th></tr></thead>
                  <tbody>
                    {voucherItems.map((item) => <tr key={item.id} className="border-b border-gray-100 last:border-0"><td className="py-2">{item.description}</td><td className="py-2 text-right">{formatAmount(item.amount)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          <Section title="Payment">
            <Row label="Mode" value={advice.paymentMode} />
            {advice.paymentMode === "NEFT" ? (
              <>
                <Row label="Bank A/c No." value={advice.bankAccountNo ?? "—"} />
                <Row label="IFSC" value={advice.bankIfsc ?? "—"} />
                <Row label="Beneficiary Name" value={advice.beneficiaryName ?? "—"} />
              </>
            ) : null}
          </Section>

          <Section title="People">
            <Row label="Submitted By" value={`${advice.submittedByName} (${advice.submittedByEmail})`} />
            <Row label="Department" value={advice.submittedByDepartment} />
            <Row
              label="Recommending Authority"
              value={`${authority?.authorityName ?? "—"}${authorityStatusSuffix(advice)}`}
            />
            <Row label="Verified By" value={advice.verifiedByName} />
            <Row label="Sanctioned By" value={advice.sanctionedByName ?? "—"} />
          </Section>

          <Section title="Attachments">
            {adviceAttachments.length === 0 ? (
              <p className="text-sm text-gray-500">No attachments.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2">File</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Size</th>
                      <th className="px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adviceAttachments.map((a) => (
                      <tr key={a.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2">{a.fileName}</td>
                        <td className="px-4 py-2">{DOC_TYPE_LABELS[a.docType] ?? a.docType}</td>
                        <td className="px-4 py-2">{formatBytes(a.sizeBytes)}</td>
                        <td className="px-4 py-2">
                          <a
                            href={`/api/admin/attachments/${a.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-[#0b1f3a] hover:underline"
                          >
                            View / Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          {advice.status === "SENT_BACK" && advice.adminRemarks ? (
            <div className="rounded-md border border-[#e8a33d]/40 bg-[#e8a33d]/10 p-4 text-sm text-[#8a5a12]">
              <p className="font-medium">Admin Remarks</p>
              <p className="mt-1">{advice.adminRemarks}</p>
            </div>
          ) : null}
          <AdviceActions
            adviceId={advice.id}
            status={advice.status as Status}
            initialBillPassedFor={advice.billPassedFor}
            initialEditToken={advice.editToken}
            paymentMode={advice.paymentMode as "NEFT" | "CASH"}
            authorityToken={advice.authorityToken}
            authorityName={authority?.authorityName ?? "Recommending Authority"}
            authorityApprovedAt={advice.authorityApprovedAt?.toISOString() ?? null}
            authorityRejectedAt={advice.authorityRejectedAt?.toISOString() ?? null}
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
