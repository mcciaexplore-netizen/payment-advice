"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Status } from "@/lib/validation/payment-advice";

export function AdviceActions({
  adviceId,
  status,
  initialBillPassedFor,
  initialEditToken,
  paymentMode,
}: {
  adviceId: string;
  status: Status;
  initialBillPassedFor: string | null;
  initialEditToken: string | null;
  paymentMode: "NEFT" | "CASH";
}) {
  const router = useRouter();

  const [billPassedFor, setBillPassedFor] = useState(initialBillPassedFor ?? "");
  const [savingBillPassedFor, setSavingBillPassedFor] = useState(false);
  const [billPassedForError, setBillPassedForError] = useState<string | null>(null);

  const [showApprove, setShowApprove] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const [showSendBack, setShowSendBack] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [sendBackError, setSendBackError] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(false);

  const [editToken, setEditToken] = useState(initialEditToken);
  const [copied, setCopied] = useState(false);

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

  async function approve() {
    setApproveError(null);
    setApproving(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedByName: approverName,
          billPassedFor: billPassedFor ? Number(billPassedFor) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApproveError(data.error ?? "Could not approve.");
        return;
      }
      router.refresh();
    } finally {
      setApproving(false);
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
    return (
      <div className="flex flex-col gap-2 rounded-md border border-gray-200 p-4">
        <p className="text-sm font-medium text-[#0b1f3a]">
          Bill passed for Rs. {initialBillPassedFor ?? "—"}
        </p>
        <a
          href={`/api/admin/advice/${adviceId}/pdf`}
          className="inline-block w-fit rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
        >
          Download Payment Advice PDF
        </a>
        {paymentMode === "CASH" ? (
          <a
            href={`/api/admin/advice/${adviceId}/cash-voucher-pdf`}
            className="inline-block w-fit rounded-md border border-[#2e8b57] px-4 py-2 text-sm font-medium text-[#2e8b57] hover:bg-[#2e8b57]/5"
          >
            Download Cash Payment Voucher
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-md border border-gray-200 p-4">
      <a
        href={`/api/advice/${adviceId}/pdf`}
        className="inline-block w-fit rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
      >
        Preview Payment Advice PDF (pre-approval, for signing)
      </a>
      {paymentMode === "CASH" ? (
        <a
          href={`/api/advice/${adviceId}/cash-voucher-pdf`}
          className="inline-block w-fit rounded-md border border-[#2e8b57] px-4 py-2 text-sm font-medium text-[#2e8b57] hover:bg-[#2e8b57]/5"
        >
          Preview Cash Payment Voucher (pre-approval)
        </a>
      ) : null}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[#0b1f3a]">Bill passed for Rs.</label>
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
      </div>

      {editToken ? (
        <div className="rounded-md bg-gray-50 p-3 text-sm">
          <p className="mb-2 text-gray-700">
            This entry was sent back. Share the edit link with the submitter.
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

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            setShowApprove((v) => !v);
            setShowSendBack(false);
          }}
          className="rounded-md bg-[#2e8b57] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e8b57]/90"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => {
            setShowSendBack((v) => !v);
            setShowApprove(false);
          }}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Send Back
        </button>
      </div>

      {showApprove ? (
        <div className="flex flex-col gap-3 rounded-md border border-[#2e8b57]/30 bg-[#2e8b57]/5 p-4">
          <label className="text-sm font-medium text-[#0b1f3a]">
            Approving Officer&apos;s Name <span className="text-xs font-normal text-[#b3261e]">Required</span>
          </label>
          <input
            type="text"
            value={approverName}
            onChange={(e) => setApproverName(e.target.value)}
            className="admin-filter-input"
          />
          {approveError ? <p className="text-sm font-medium text-[#b3261e]">{approveError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={approving || !approverName.trim()}
              className="rounded-md bg-[#2e8b57] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e8b57]/90 disabled:opacity-50"
            >
              {approving ? "Approving…" : "Confirm Approval"}
            </button>
          </div>
        </div>
      ) : null}

      {showSendBack ? (
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
