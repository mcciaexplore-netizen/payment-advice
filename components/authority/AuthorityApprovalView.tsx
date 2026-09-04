"use client";

import { useState } from "react";
import { formatIstDate } from "@/lib/date-time";

type ReviewFields = {
  payeeName: string;
  amount: string;
  natureOfExpenditure: string;
  billReference: string;
  paymentMode: string;
  submittedByName: string;
  formDate: string;
};

type ReviewDoc = { id: string; fileName: string; label: string };

function formatDateTime(iso: string) {
  return formatIstDate(iso);
}

export function AuthorityApprovalView({
  token,
  authorityName,
  identityConfirmed,
  alreadyApproved,
  alreadyRejected,
  approvedAt,
  rejectedAt,
  rejectedRemarks,
  submittedByName,
  fields,
  documents,
}: {
  token: string;
  authorityName: string;
  identityConfirmed: boolean;
  alreadyApproved: boolean;
  alreadyRejected: boolean;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectedRemarks: string | null;
  submittedByName: string;
  fields: ReviewFields;
  documents: ReviewDoc[];
}) {
  const [justApproved, setJustApproved] = useState(false);
  const [justRejected, setJustRejected] = useState(false);

  const [showReject, setShowReject] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmed, setConfirmed] = useState(identityConfirmed);
  const [emailInput, setEmailInput] = useState("");
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function confirmIdentity() {
    setIdentityError(null);
    setConfirming(true);
    try {
      const res = await fetch(`/api/authority-approval/${token}/confirm-identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIdentityError(data.error ?? "Could not confirm your email.");
        return;
      }
      setConfirmed(true);
    } catch {
      setIdentityError("Could not reach the server. Please try again.");
    } finally {
      setConfirming(false);
    }
  }

  async function approve() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/authority-approval/${token}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not record your recommendation.");
        return;
      }
      setJustApproved(true);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reject() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/authority-approval/${token}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send this back.");
        return;
      }
      setJustRejected(true);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isApproved = alreadyApproved || justApproved;
  const isRejected = (alreadyRejected || justRejected) && !isApproved;

  if (justApproved) {
    return (
      <ConfirmationBanner tone="approved">
        Recommended. This has been forwarded to Finance for processing. No further action needed
        from you.
      </ConfirmationBanner>
    );
  }

  if (justRejected) {
    return (
      <ConfirmationBanner tone="rejected">
        Sent back to {submittedByName} with your remarks. They&apos;ve been notified to make
        corrections and resubmit.
      </ConfirmationBanner>
    );
  }

  if (isApproved) {
    return (
      <ConfirmationBanner tone="approved">
        You already recommended this{approvedAt ? ` on ${formatDateTime(approvedAt)}` : ""}.
      </ConfirmationBanner>
    );
  }

  if (isRejected) {
    return (
      <ConfirmationBanner tone="rejected">
        You already sent this back{rejectedAt ? ` on ${formatDateTime(rejectedAt)}` : ""}.
        {rejectedRemarks ? (
          <span className="mt-2 block text-sm font-normal text-[#78350f]">
            Your remarks: {rejectedRemarks}
          </span>
        ) : null}
      </ConfirmationBanner>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2 rounded-md border border-gray-200 p-4">
        <Row label="Payee" value={fields.payeeName} />
        <Row label="Amount" value={`₹ ${fields.amount}`} />
        <Row label="Nature of Expenditure" value={fields.natureOfExpenditure} block />
        <Row label="Bill / Reference No." value={fields.billReference} />
        <Row label="Payment Mode" value={fields.paymentMode} />
        <Row label="Submitted By" value={fields.submittedByName} />
        <Row label="Date" value={fields.formDate} />
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-gray-200 p-4">
        <h2 className="font-heading text-lg text-[#0b1f3a]">Attached Documents</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-gray-500">No documents attached.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {documents.map((doc) => (
              <li key={doc.id}>
                <a
                  href={`/api/authority-approval/${token}/attachments/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[#0b1f3a] hover:underline"
                >
                  {doc.label}: {doc.fileName}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmed ? (
        <>
          {error ? (
            <div className="rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-sm font-medium text-[#b3261e]">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={approve}
              disabled={submitting}
              className="rounded-md bg-[#2e8b57] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#2e8b57]/90 disabled:opacity-50"
            >
              {submitting ? "Recommending…" : "Recommend"}
            </button>
            <button
              type="button"
              onClick={() => setShowReject((v) => !v)}
              disabled={submitting}
              className="rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Send Back
            </button>
          </div>

          {showReject ? (
            <div className="flex flex-col gap-3 rounded-md border border-gray-300 bg-gray-50 p-4">
              <label className="text-sm font-medium text-[#0b1f3a]">
                Remarks for {submittedByName}{" "}
                <span className="text-xs font-normal text-[#b3261e]">Required</span>
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                className="admin-filter-input"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reject}
                  disabled={submitting || !remarks.trim()}
                  className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90 disabled:opacity-50"
                >
                  {submitting ? "Sending…" : "Submit & Send Back"}
                </button>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-gray-500">Reviewing as {authorityName}.</p>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-gray-300 bg-gray-50 p-4">
          <label className="text-sm font-medium text-[#0b1f3a]">
            Confirm your email to continue
          </label>
          <p className="text-xs text-gray-500">
            For security, please confirm the email address this recommendation request was sent to before
            reviewing or actioning it.
          </p>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@mcciapune.com"
            className="admin-filter-input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && emailInput.trim() && !confirming) confirmIdentity();
            }}
          />
          {identityError ? (
            <div className="rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-sm font-medium text-[#b3261e]">
              {identityError}
            </div>
          ) : null}
          <div>
            <button
              type="button"
              onClick={confirmIdentity}
              disabled={confirming || !emailInput.trim()}
              className="rounded-md bg-[#0b1f3a] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#0b1f3a]/90 disabled:opacity-50"
            >
              {confirming ? "Confirming…" : "Continue"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmationBanner({
  tone,
  children,
}: {
  tone: "approved" | "rejected";
  children: React.ReactNode;
}) {
  const styles =
    tone === "approved"
      ? "border-[#2e8b57]/40 bg-[#2e8b57]/10 text-[#1e5c39]"
      : "border-[#e8a33d]/40 bg-[#e8a33d]/10 text-[#8a5a12]";
  return (
    <div className={`rounded-md border p-6 text-sm font-medium ${styles}`}>{children}</div>
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
