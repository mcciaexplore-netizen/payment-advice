"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Status } from "@/lib/validation/payment-advice";
import { AdminRole } from "@/lib/auth";
import { billPassedForLabelFor } from "@/lib/advice/document-identity";

const ROLE_LABELS: Record<AdminRole, string> = {
  PAYMENT_ADVICE: "a Payment Advice",
  CASH_VOUCHER: "a Cash Voucher",
  ALL: "an All-Access",
};

export type PaymentEntryDisplay = {
  id: string;
  amount: string;
  remarks: string;
  paidAt: string;
  paidBy: string;
};

/** Whether the current session's role "owns" this submission's payment
 * mode — a UI-only default, not a backend authorization wall (per the
 * human's explicit decision, see AGENT_HANDOFF.md): the ALL-role account
 * can mark either mode Payment Done, and each of PAYMENT_ADVICE/
 * CASH_VOUCHER only owns its matching mode. */
function ownsSubmissionType(role: AdminRole, paymentMode: "NEFT" | "CASH"): boolean {
  if (role === "ALL") return true;
  if (role === "PAYMENT_ADVICE") return paymentMode === "NEFT";
  return paymentMode === "CASH";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(value: string | number): string {
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

/** Every past entry, date/amount/remarks/who — the audit trail Finance and
 * anyone reviewing later needs. NEFT only; Cash never has any of these. */
function PaymentEntriesList({ entries }: { entries: PaymentEntryDisplay[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Payment History</p>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-md border border-gray-200 p-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-[#0b1f3a]">₹ {formatMoney(entry.amount)}</span>
              <span className="text-xs text-gray-500">
                {formatDateTime(entry.paidAt)} · {entry.paidBy}
              </span>
            </div>
            <p className="mt-1 text-gray-600">{entry.remarks}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdviceActions({
  adviceId,
  status,
  initialBillPassedFor,
  initialEditToken,
  paymentMode,
  isAdvance,
  authorityToken,
  authorityName,
  authorityApprovedAt,
  authorityRejectedAt,
  financeReceivedAt,
  verifiedAt,
  verifiedBy,
  sanctionedAt,
  sanctionedBy,
  paymentDoneAt,
  paymentDoneBy,
  totalPaid,
  paymentEntries,
  currentUserFullName,
  currentUserRole,
}: {
  adviceId: string;
  status: Status;
  initialBillPassedFor: string | null;
  initialEditToken: string | null;
  paymentMode: "NEFT" | "CASH";
  isAdvance: boolean;
  authorityToken: string | null;
  authorityName: string;
  authorityApprovedAt: string | null;
  authorityRejectedAt: string | null;
  financeReceivedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  sanctionedAt: string | null;
  sanctionedBy: string | null;
  paymentDoneAt: string | null;
  paymentDoneBy: string | null;
  /** NEFT only — Cash never writes to total_paid, stays "0.00" forever. */
  totalPaid: string;
  /** NEFT only — Cash never has payment_entries rows. */
  paymentEntries: PaymentEntryDisplay[];
  currentUserFullName: string;
  currentUserRole: AdminRole;
}) {
  const router = useRouter();
  // Same underlying billPassedFor field/column, just conditional label text
  // for advances — "Amount Sanctioned" instead of "Bill passed for Rs.".
  const billPassedForLabel = billPassedForLabelFor(isAdvance);
  const [authorityLinkCopied, setAuthorityLinkCopied] = useState(false);

  function copyAuthorityLink() {
    if (!authorityToken) return;
    const url = `${window.location.origin}/authority-approval/${authorityToken}`;
    navigator.clipboard.writeText(url);
    setAuthorityLinkCopied(true);
    setTimeout(() => setAuthorityLinkCopied(false), 2000);
  }

  const [billPassedFor, setBillPassedFor] = useState(initialBillPassedFor ?? "");
  const [savingBillPassedFor, setSavingBillPassedFor] = useState(false);
  const [billPassedForError, setBillPassedForError] = useState<string | null>(null);

  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Cash only — the single one-shot terminal action, unchanged.
  const [markingPaymentDone, setMarkingPaymentDone] = useState(false);
  const [paymentDoneError, setPaymentDoneError] = useState<string | null>(null);

  // NEFT only — "Record a Payment" (multi-part).
  const [entryAmount, setEntryAmount] = useState("");
  const [entryRemarks, setEntryRemarks] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [recordPaymentError, setRecordPaymentError] = useState<string | null>(null);

  const [showSendBack, setShowSendBack] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [sendBackError, setSendBackError] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);

  const [editToken, setEditToken] = useState(initialEditToken);
  const [copied, setCopied] = useState(false);

  // Locked once ≥1 payment has been recorded (NEFT) — see
  // POST /api/admin/advice/[id]/route.ts. Cash's totalPaid is always
  // "0.00", so this is always false for Cash.
  const billPassedForLocked = paymentMode === "NEFT" && Number(totalPaid) > 0;
  const hasPaymentEntries = paymentMode === "NEFT" && paymentEntries.length > 0;

  async function saveBillPassedFor() {
    setBillPassedForError(null);
    setSavingBillPassedFor(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billPassedFor: Number(billPassedFor) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBillPassedForError(data.error ?? "Could not save.");
        return;
      }
      router.refresh();
    } finally {
      setSavingBillPassedFor(false);
    }
  }

  async function markReceived() {
    setReceiveError(null);
    setReceiving(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}/receive`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setReceiveError(data.error ?? "Could not mark received.");
        return;
      }
      router.refresh();
    } finally {
      setReceiving(false);
    }
  }

  async function verify() {
    setVerifyError(null);
    setVerifying(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}/verify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error ?? "Could not verify.");
        return;
      }
      router.refresh();
    } finally {
      setVerifying(false);
    }
  }

  // Cash only.
  async function markPaymentDone() {
    setPaymentDoneError(null);
    setMarkingPaymentDone(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}/payment-done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billPassedFor: billPassedFor ? Number(billPassedFor) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaymentDoneError(data.error ?? "Could not mark Payment Done.");
        return;
      }
      router.refresh();
    } finally {
      setMarkingPaymentDone(false);
    }
  }

  // NEFT only.
  async function recordPayment() {
    setRecordPaymentError(null);
    setRecordingPayment(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}/payment-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(entryAmount),
          remarks: entryRemarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRecordPaymentError(data.error ?? "Could not record payment.");
        return;
      }
      setEntryAmount("");
      setEntryRemarks("");
      router.refresh();
    } finally {
      setRecordingPayment(false);
    }
  }

  async function sendBack() {
    setSendBackError(null);
    setSendingBack(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}/send-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminRemarks: remarks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendBackError(data.error ?? "Could not send back.");
        return;
      }
      setEditToken(data.editToken);
      setShowSendBack(false);
      router.refresh();
    } finally {
      setSendingBack(false);
    }
  }

  function copyEditLink() {
    if (!editToken) return;
    const url = `${window.location.origin}/edit/${editToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (status === "APPROVED") {
    if (paymentMode === "CASH") {
      // Unchanged — Cash's single one-shot terminal action.
      const doneAt = paymentDoneAt ?? sanctionedAt;
      const doneBy = paymentDoneBy ?? sanctionedBy;
      return (
        <div className="flex flex-col gap-2 rounded-md border border-gray-200 p-4">
          <p className="text-sm font-medium text-[#0b1f3a]">
            {billPassedForLabel} {initialBillPassedFor ?? "—"}
          </p>
          <p className="text-sm text-gray-600">
            Payment Done{doneBy ? ` — ${doneBy}` : ""}
            {doneAt
              ? ` on ${new Date(doneAt).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}`
              : ""}
            .
          </p>
          <a
            href={`/api/admin/advice/${adviceId}/cash-voucher-pdf`}
            className="inline-block w-fit rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
          >
            Download Cash Payment Voucher
          </a>
        </div>
      );
    }

    // NEFT terminal state — Fully Payment Settled, reached via the payment
    // entry that brought total_paid to (or past) bill_passed_for.
    return (
      <div className="flex flex-col gap-4 rounded-md border border-gray-200 p-4">
        <div>
          <p className="text-sm font-medium text-[#0b1f3a]">
            {billPassedForLabel} {initialBillPassedFor ?? "—"}
          </p>
          <p className="text-sm text-gray-600">
            Fully Payment Settled — ₹ {formatMoney(totalPaid)} paid.
          </p>
        </div>
        <PaymentEntriesList entries={paymentEntries} />
        <a
          href={`/api/admin/advice/${adviceId}/pdf`}
          className="inline-block w-fit rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
        >
          Download Payment Advice PDF
        </a>
      </div>
    );
  }

  const remaining =
    initialBillPassedFor != null ? Number(initialBillPassedFor) - Number(totalPaid) : null;

  return (
    <div className="flex flex-col gap-6 rounded-md border border-gray-200 p-4">
      {paymentMode === "CASH" ? (
        <a
          href={`/api/advice/${adviceId}/cash-voucher-pdf`}
          className="inline-block w-fit rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
        >
          Preview Cash Payment Voucher (pre-approval)
        </a>
      ) : (
        <a
          href={`/api/advice/${adviceId}/pdf`}
          className="inline-block w-fit rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
        >
          Preview Payment Advice PDF (pre-approval, for signing)
        </a>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[#0b1f3a]">{billPassedForLabel}</label>
        {billPassedForLocked ? (
          <p className="text-sm text-gray-600">
            ₹ {formatMoney(initialBillPassedFor ?? "0")} — locked, a payment has already been
            recorded against this advice.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={billPassedFor}
                onChange={(e) => setBillPassedFor(e.target.value)}
                className="admin-filter-input w-40"
              />
              <button
                type="button"
                onClick={saveBillPassedFor}
                disabled={savingBillPassedFor || !billPassedFor}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {savingBillPassedFor ? "Saving…" : "Save"}
              </button>
            </div>
            {billPassedForError ? (
              <p className="text-sm font-medium text-[#b3261e]">{billPassedForError}</p>
            ) : null}
          </>
        )}
      </div>

      {editToken ? (
        <div className="rounded-md bg-gray-50 p-3 text-sm">
          <p className="mb-2 text-gray-700">
            This entry was sent back{authorityRejectedAt ? ` by ${authorityName}` : ""}. Share
            the edit link with the submitter.
          </p>
          <button
            type="button"
            onClick={copyEditLink}
            className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-100"
          >
            {copied ? "Copied!" : "Copy edit link"}
          </button>
        </div>
      ) : null}

      {authorityApprovedAt ? (
        <div className="rounded-md border border-[#2e8b57]/30 bg-[#2e8b57]/5 p-3 text-sm text-[#1e5c39]">
          Approved by {authorityName} on{" "}
          {new Date(authorityApprovedAt).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
          .
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-[#e8a33d]/40 bg-[#e8a33d]/10 p-3 text-sm text-[#8a5a12]">
          <p>
            Waiting on <span className="font-medium">{authorityName}</span> (Recommending
            Authority) to approve before Finance can proceed.
          </p>
          {authorityToken ? (
            <button
              type="button"
              onClick={copyAuthorityLink}
              className="w-fit rounded-md border border-[#8a5a12]/30 px-3 py-1.5 hover:bg-[#e8a33d]/10"
            >
              {authorityLinkCopied ? "Copied!" : `Copy link to share with ${authorityName}`}
            </button>
          ) : null}
        </div>
      )}

      {/* Finance pipeline — only one stage's action is ever actionable at a
          time, gated in the same order the server enforces (received ->
          verified -> Ready for Payment (automatic) -> Payment Done). */}
      {authorityApprovedAt && !financeReceivedAt ? (
        <div className="flex flex-col gap-2 rounded-md border border-[#e8a33d]/40 bg-[#e8a33d]/10 p-3 text-sm text-[#8a5a12]">
          <p>Ready for Finance to receive this submission.</p>
          {receiveError ? <p className="font-medium text-[#b3261e]">{receiveError}</p> : null}
          <button
            type="button"
            onClick={markReceived}
            disabled={receiving}
            className="w-fit rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90 disabled:opacity-50"
          >
            {receiving ? "Marking…" : "Mark Received & In Process"}
          </button>
        </div>
      ) : null}

      {financeReceivedAt && !verifiedAt ? (
        <div className="flex flex-col gap-3 rounded-md border border-[#e8a33d]/40 bg-[#e8a33d]/10 p-4 text-sm text-[#8a5a12]">
          <p>
            Will be recorded as verified by <span className="font-medium">{currentUserFullName}</span>.
          </p>
          {verifyError ? <p className="font-medium text-[#b3261e]">{verifyError}</p> : null}
          <button
            type="button"
            onClick={verify}
            disabled={verifying}
            className="w-fit rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90 disabled:opacity-50"
          >
            {verifying ? "Verifying…" : "Confirm Verification"}
          </button>
        </div>
      ) : null}

      {verifiedAt ? (
        <div className="rounded-md border border-[#2e8b57]/30 bg-[#2e8b57]/5 p-3 text-sm text-[#1e5c39]">
          Verified by {verifiedBy} on{" "}
          {new Date(verifiedAt).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
          .
        </div>
      ) : null}

      {/* "Ready for Payment" is automatic the moment verifiedAt is set — no
          click required. Cash: unchanged single "Mark Payment Done" action.
          NEFT: multi-part "Record a Payment" (see AGENT_HANDOFF.md). */}
      {verifiedAt && paymentMode === "CASH" && !paymentDoneAt ? (
        <div className="flex flex-col gap-3 rounded-md border border-[#2e8b57]/30 bg-[#2e8b57]/5 p-4 text-sm">
          <p className="font-medium text-[#1e5c39]">Ready for Payment.</p>
          {ownsSubmissionType(currentUserRole, paymentMode) ? (
            <>
              <p className="text-[#1e5c39]">
                Will be recorded as paid by <span className="font-medium">{currentUserFullName}</span>.
              </p>
              {!billPassedFor ? (
                <p className="text-xs text-gray-500">
                  &quot;{billPassedForLabel}&quot; above must be saved before marking Payment Done.
                </p>
              ) : null}
              {paymentDoneError ? (
                <p className="font-medium text-[#b3261e]">{paymentDoneError}</p>
              ) : null}
              <button
                type="button"
                onClick={markPaymentDone}
                disabled={markingPaymentDone || !billPassedFor}
                className="w-fit rounded-md bg-[#2e8b57] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e8b57]/90 disabled:opacity-50"
              >
                {markingPaymentDone ? "Marking…" : "Mark Payment Done"}
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-500">
              Only {ROLE_LABELS[paymentMode === "CASH" ? "CASH_VOUCHER" : "PAYMENT_ADVICE"]} account
              (or an All-Access account) can mark this Payment Done.
            </p>
          )}
        </div>
      ) : null}

      {verifiedAt && paymentMode === "NEFT" ? (
        <div className="flex flex-col gap-4 rounded-md border border-[#2e8b57]/30 bg-[#2e8b57]/5 p-4 text-sm">
          <div>
            <p className="font-medium text-[#1e5c39]">
              {Number(totalPaid) > 0 ? "Partial Payment Done." : "Ready for Payment."}
            </p>
            {remaining !== null ? (
              <p className="mt-1 text-[#1e5c39]">
                Paid so far: ₹ {formatMoney(totalPaid)} of ₹ {formatMoney(initialBillPassedFor ?? "0")}{" "}
                — ₹ {formatMoney(remaining)} remaining.
              </p>
            ) : null}
          </div>

          <PaymentEntriesList entries={paymentEntries} />

          {ownsSubmissionType(currentUserRole, paymentMode) ? (
            !billPassedFor ? (
              <p className="text-xs text-gray-500">
                &quot;{billPassedForLabel}&quot; above must be saved before recording a payment.
              </p>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-[#2e8b57]/30 bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Record a Payment
                </p>
                <label className="text-sm font-medium text-[#0b1f3a]">
                  Amount (Rs.)
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remaining ?? undefined}
                    value={entryAmount}
                    onChange={(e) => setEntryAmount(e.target.value)}
                    className="admin-filter-input mt-1 w-full"
                  />
                </label>
                <label className="text-sm font-medium text-[#0b1f3a]">
                  Remarks <span className="text-xs font-normal text-[#b3261e]">Required</span>
                  <textarea
                    value={entryRemarks}
                    onChange={(e) => setEntryRemarks(e.target.value)}
                    rows={2}
                    className="admin-filter-input mt-1 w-full"
                  />
                </label>
                {recordPaymentError ? (
                  <p className="text-sm font-medium text-[#b3261e]">{recordPaymentError}</p>
                ) : null}
                <p className="text-xs text-gray-500">
                  Will be recorded as paid by <span className="font-medium">{currentUserFullName}</span>.
                </p>
                <button
                  type="button"
                  onClick={recordPayment}
                  disabled={recordingPayment || !entryAmount || !entryRemarks.trim()}
                  className="w-fit rounded-md bg-[#2e8b57] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e8b57]/90 disabled:opacity-50"
                >
                  {recordingPayment ? "Recording…" : "Record Payment"}
                </button>
              </div>
            )
          ) : (
            <p className="text-xs text-gray-500">
              Only {ROLE_LABELS.PAYMENT_ADVICE} account (or an All-Access account) can record a
              payment.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex gap-3">
        {hasPaymentEntries ? (
          <p className="text-xs text-gray-500">
            Send Back is unavailable once a payment has been recorded against this advice.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setShowSendBack((v) => !v)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Send Back
          </button>
        )}
      </div>

      {showSendBack && !hasPaymentEntries ? (
        <div className="flex flex-col gap-3 rounded-md border border-gray-300 bg-gray-50 p-4">
          <label className="text-sm font-medium text-[#0b1f3a]">
            Remarks for Submitter <span className="text-xs font-normal text-[#b3261e]">Required</span>
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            className="admin-filter-input"
          />
          {sendBackError ? <p className="text-sm font-medium text-[#b3261e]">{sendBackError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={sendBack}
              disabled={sendingBack || !remarks.trim()}
              className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90 disabled:opacity-50"
            >
              {sendingBack ? "Sending…" : "Confirm Send Back"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
