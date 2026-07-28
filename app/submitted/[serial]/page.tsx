"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  readSubmissionSummary,
  subscribeToNothing,
  getServerSnapshot,
} from "@/lib/submission-summary";

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-[#2e8b57]">
          Payment Advice submitted
        </p>
        <p className="font-heading text-4xl text-[#0b1f3a]">{serial}</p>
      </div>

      {summary ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border border-gray-200 p-6 text-sm sm:grid-cols-2">
          <SummaryRow label="Payee" value={summary.payeeName} />
          <SummaryRow
            label="Amount"
            value={`₹ ${summary.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
          />
          <SummaryRow label="Bill No." value={summary.billNo} />
          <SummaryRow label="Payment Mode" value={summary.paymentMode} />
          <SummaryRow label="Submitted By" value={summary.submittedByName} />
          <SummaryRow label="Department" value={summary.submittedByDepartment} />
          <div className="sm:col-span-2">
            <SummaryRow
              label="Nature of Expenditure"
              value={summary.natureOfExpenditure}
            />
          </div>
        </dl>
      ) : (
        <p className="rounded-md border border-gray-200 p-4 text-center text-sm text-gray-600">
          Your Payment Advice has been recorded under the serial number above.
        </p>
      )}

      <div className="rounded-md bg-[#0b1f3a]/5 px-4 py-3 text-sm text-[#0b1f3a]">
        <p className="font-medium">What happens next</p>
        <p className="mt-1">
          The Finance &amp; Accounts team will review this submission and its
          attachments. If anything needs correcting, they&apos;ll send it back
          to you with remarks and a link to fix and resubmit it. Once
          approved, the payment advice is printed, physically signed, and
          filed — no further action is needed from you unless you&apos;re
          contacted.
        </p>
        <p className="mt-2">
          Please note down the serial number above — quote it if you contact
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
