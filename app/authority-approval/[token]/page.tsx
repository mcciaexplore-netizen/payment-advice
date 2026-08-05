import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, attachments, recommendingAuthorities } from "@/lib/db/schema";
import { AuthorityApprovalView } from "@/components/authority/AuthorityApprovalView";
import { authorityActionError } from "@/lib/advice/authority-token";
import { identityCookieName } from "@/lib/advice/authority-identity";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { PaymentMode } from "@/lib/validation/payment-advice";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

export default async function AuthorityApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [advice] = await db
    .select()
    .from(paymentAdvices)
    .where(eq(paymentAdvices.authorityToken, token))
    .limit(1);

  if (!advice) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="font-heading text-2xl text-[#0b1f3a]">This link is not valid</h1>
        <p className="text-sm text-gray-600">
          This approval link does not exist. Please contact the Accounts department for help
          with this Payment Advice.
        </p>
      </main>
    );
  }

  const alreadyActioned = !!advice.authorityApprovedAt || !!advice.authorityRejectedAt;
  const actionError = authorityActionError(advice);

  if (actionError && !alreadyActioned) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="font-heading text-2xl text-[#0b1f3a]">This link has expired</h1>
        <p className="text-sm text-gray-600">{actionError} Please contact the Accounts department.</p>
      </main>
    );
  }

  const [authority, adviceAttachments] = await Promise.all([
    db
      .select({ authorityName: recommendingAuthorities.authorityName })
      .from(recommendingAuthorities)
      .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(attachments)
      .where(eq(attachments.paymentAdviceId, advice.id)),
  ]);

  const reviewDocs = adviceAttachments.filter(
    (a) => a.docType === "TAX_INVOICE" || a.docType === "APPROVAL_BUDGET",
  );

  const cookieStore = await cookies();
  const identityConfirmed = cookieStore.get(identityCookieName(token))?.value === "1";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-medium tracking-wide text-gray-500">
          {displayNoFor(advice.paymentMode as PaymentMode, advice.serialNo, advice.cashVoucherNo)}
          {advice.paymentMode === "CASH" ? ` (Internal Ref. ${advice.serialNo})` : ""} · Submitted by{" "}
          {advice.submittedByName} on {formatDate(advice.formDate)}
        </p>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">
          {documentLabelFor(advice.paymentMode as PaymentMode)} Approval Request
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          You&apos;ve been selected as the Recommending Authority for this{" "}
          {documentLabelFor(advice.paymentMode as PaymentMode)}. Please review the details below
          and approve or send it back with remarks.
        </p>
      </header>

      <AuthorityApprovalView
        token={token}
        authorityName={authority?.authorityName ?? "Recommending Authority"}
        identityConfirmed={identityConfirmed}
        alreadyApproved={!!advice.authorityApprovedAt}
        alreadyRejected={!!advice.authorityRejectedAt}
        approvedAt={advice.authorityApprovedAt?.toISOString() ?? null}
        rejectedAt={advice.authorityRejectedAt?.toISOString() ?? null}
        rejectedRemarks={advice.authorityRemarks}
        submittedByName={advice.submittedByName}
        fields={{
          payeeName: advice.payeeName,
          amount: Number(advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
          natureOfExpenditure: advice.natureOfExpenditure,
          billReference: `${advice.billNo} / ${formatDate(advice.billDate)}`,
          paymentMode: advice.paymentMode,
          submittedByName: advice.submittedByName,
          formDate: formatDate(advice.formDate),
        }}
        documents={reviewDocs.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          label: d.docType === "TAX_INVOICE" ? "Tax Invoice" : "Approval / Budget Letter",
        }))}
      />
    </main>
  );
}
