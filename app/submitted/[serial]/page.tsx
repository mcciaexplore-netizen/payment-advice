"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  readSubmissionSummary,
  subscribeToNothing,
  getServerSnapshot,
} from "@/lib/submission-summary";
import { documentLabelFor } from "@/lib/advice/document-identity";
import type { PaymentMode } from "@/lib/validation/payment-advice";

export default function SubmittedPage() {
  const params = useParams<{ serial: string }>();
  const serial = decodeURIComponent(
    Array.isArray(params.serial) ? params.serial.join("/") : params.serial,
  );
  const summary = useSyncExternalStore(
    subscribeToNothing,
    () => readSubmissionSummary(serial),
    getServerSnapshot,
  );
  const [copied, setCopied] = useState(false);

  function copyAuthorityLink() {
    if (!summary) return;
    const url = `${window.location.origin}/authority-approval/${summary.authorityToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-[#2e8b57]">
          {summary?.isAdvance ? "Advance " : ""}
          {summary?.paymentMode === "CASH" ? "Cash Voucher submitted" : "Payment Advice submitted"}
        </p>
        <p className="font-heading text-4xl text-[#0b1f3a]">
          {summary?.isAdvance
            ? (summary.advanceNo ?? serial)
            : summary?.paymentMode === "CASH"
              ? (summary.cashVoucherNo ?? serial)
              : serial}
        </p>
        {summary?.paymentMode === "CASH" || summary?.isAdvance ? (
          <p className="text-xs text-gray-500">Internal Ref.: {serial}</p>
        ) : null}
      </div>

      {summary ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border border-gray-200 p-6 text-sm sm:grid-cols-2">
          <SummaryRow label="Payee" value={summary.payeeName} />
          <SummaryRow
            label="Amount"
            value={`₹ ${summary.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          />
          {!summary.isAdvance ? <SummaryRow label="Bill No." value={summary.billNo} /> : null}
          <SummaryRow label="Payment Mode" value={summary.paymentMode} />
          <SummaryRow label="Submitted By" value={summary.submittedByName} />
          <SummaryRow label="Department" value={summary.submittedByDepartment} />
          <div className="sm:col-span-2">
            <SummaryRow
              label={summary.isAdvance ? "Purpose of Advance" : "Nature of Expenditure"}
              value={summary.natureOfExpenditure}
            />
          </div>
        </dl>
      ) : (
        <p className="rounded-md border border-gray-200 p-4 text-center text-sm text-gray-600">
          Your submission has been recorded under the number above.
        </p>
      )}

      {summary ? (
        <div className="flex flex-wrap justify-center gap-3">
          {summary.paymentMode === "CASH" ? (
            <a
              href={`/api/advice/${summary.id}/cash-voucher-pdf`}
              className="rounded-md bg-[#0b1f3a] px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-[#0b1f3a]/90"
            >
              Download Cash Payment Voucher
            </a>
          ) : (
            <a
              href={`/api/advice/${summary.id}/pdf`}
              className="rounded-md bg-[#0b1f3a] px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-[#0b1f3a]/90"
            >
              Download Payment Advice (for signatures)
            </a>
          )}
        </div>
      ) : null}

      {summary ? (
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-2 rounded-md border border-[#e8a33d]/40 bg-[#e8a33d]/10 px-4 py-3 text-center text-sm text-[#8a5a12]">
            <p>
              Share this link with <span className="font-medium">{summary.authorityName}</span>{" "}
              so they can review and approve this{" "}
              {documentLabelFor(summary.paymentMode as PaymentMode, summary.isAdvance)}.
            </p>
            <button
              type="button"
              onClick={copyAuthorityLink}
              className="rounded-md border border-[#8a5a12]/30 px-4 py-1.5 font-medium hover:bg-[#e8a33d]/10"
            >
              {copied ? "Copied!" : `Copy link to share with ${summary.authorityName}`}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-md bg-[#0b1f3a]/5 px-4 py-3 text-sm text-[#0b1f3a]">
        <p className="font-medium">What happens next</p>
        {summary?.paymentMode === "CASH" ? (
          <p className="mt-1">
            Download and print the Cash Payment Voucher above, then take it
            around for the &quot;Submitted by&quot; and &quot;Recommended
            by&quot; signatures — the boxes are already labelled with who
            should sign each one. Once signed, hand it to Finance &amp;
            Accounts, who will review it online and either approve it or send
            it back to you with remarks and a link to fix and resubmit.
          </p>
        ) : (
          <p className="mt-1">
            Download and print the Payment Advice above, then take it around
            for the &quot;Recommended by&quot;, &quot;Verified by&quot; and
            &quot;Sanctioned by&quot; signatures — the boxes are already
            labelled with who should sign each one. Once signed, hand it to
            Finance &amp; Accounts, who will review it online and either
            approve it or send it back to you with remarks and a link to fix
            and resubmit.
          </p>
        )}
        <p className="mt-2">
          Please note down the number above — quote it if you contact
          Accounts about this payment.
        </p>
      </div>

      <div className="flex justify-center">
        <Link
          href="/"
          className="rounded-md border border-[#0b1f3a] px-5 py-2.5 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
        >
          Submit another Payment Advice
        </Link>
      </div>
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-[#171717]">{value}</dd>
    </div>
  );
}
