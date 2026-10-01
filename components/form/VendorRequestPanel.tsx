"use client";

import { useMemo, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { FileUploadSlot } from "@/components/form/FileUploadSlot";
import { renderVendorMsmeRequestEmail } from "@/lib/email/templates";
import { computeMsmeRequestDeadline, MSME_REQUEST_EMAIL_FIXED_CC } from "@/lib/advice/msme-email-template";
import { formatIstDateTime } from "@/lib/date-time";

const MSME_STATUS_OPTIONS = [
  { value: "MICRO", label: "Micro" },
  { value: "SMALL", label: "Small" },
  { value: "MEDIUM", label: "Medium" },
  { value: "NOT_REGISTERED", label: "Not Registered" },
  { value: "UNKNOWN", label: "Not Sure" },
] as const;

export function VendorRequestPanel({
  payeeName,
  submittedByName,
  submittedByEmail,
  vendorEmail,
  onVendorEmailChange,
  vendorEmailError,
  msmeStatus,
  onMsmeStatusChange,
  msmeDocument,
  onMsmeDocumentChange,
  documentType,
  onDocumentTypeChange,
  msmeEmailSentAt,
  onEmailSent,
}: {
  payeeName: string;
  submittedByName: string;
  submittedByEmail: string;
  vendorEmail: string;
  onVendorEmailChange: (value: string) => void;
  vendorEmailError?: string;
  msmeStatus: string;
  onMsmeStatusChange: (value: string) => void;
  msmeDocument: File[];
  onMsmeDocumentChange: (files: File[]) => void;
  documentType: "UDYAM_CERTIFICATE" | "NON_MSME_DECLARATION";
  onDocumentTypeChange: (value: "UDYAM_CERTIFICATE" | "NON_MSME_DECLARATION") => void;
  /** ISO timestamp once "Send Email" has succeeded, else null. */
  msmeEmailSentAt: string | null;
  onEmailSent: (sentAt: string, messageId: string | null) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const vendorNameForEmail = payeeName.trim() || "[Vendor Name]";
  const submitterNameForEmail = submittedByName.trim() || "[Your Name]";
  const { subject, html } = useMemo(
    () =>
      renderVendorMsmeRequestEmail({
        vendorName: vendorNameForEmail,
        submitterName: submitterNameForEmail,
        deadline: computeMsmeRequestDeadline(),
      }),
    [vendorNameForEmail, submitterNameForEmail],
  );

  const canSend = vendorEmail.trim().length > 0 && !vendorEmailError;

  async function sendEmail() {
    setSendError(null);
    setSending(true);
    try {
      const res = await fetch("/api/vendor-requests/msme-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: vendorNameForEmail,
          vendorEmail: vendorEmail.trim(),
          submitterName: submitterNameForEmail,
          submitterEmail: submittedByEmail,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSendError(data?.error ?? "Could not send the email. Please try again.");
        return;
      }
      onEmailSent(data.sentAt, data.messageId ?? null);
    } catch {
      setSendError("Could not send the email. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-6 rounded-md border border-[#0b1f3a]/20 bg-[#0b1f3a]/5 p-4">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="Vendor Email" required error={vendorEmailError} help="Required - the MSME request email is sent here.">
          <Input
            type="email"
            value={vendorEmail}
            onChange={(e) => onVendorEmailChange(e.target.value)}
            hasError={!!vendorEmailError}
          />
        </Field>
        <Field label="MSME Status" help="Optional - fill this in if you already know it.">
          <Select value={msmeStatus} onChange={(e) => onMsmeStatusChange(e.target.value)}>
            {MSME_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 p-4 text-sm leading-relaxed text-[#7a1913]">
        <strong>
          You must submit the vendor&apos;s Udyam Registration Certificate or signed Non-MSME
          Declaration. The Accounts team will not approve this vendor without one of these
          documents — submissions missing this will be sent back for resubmission.
        </strong>
      </div>

      <div className="flex flex-col gap-2">
        <FileUploadSlot
          label="MSME Document (Udyam Certificate or Non-MSME Declaration)"
          allowImages
          maxFiles={1}
          files={msmeDocument}
          onChange={onMsmeDocumentChange}
        />
        {msmeDocument.length === 1 ? (
          <div className="flex items-center gap-4 text-sm text-[#0b1f3a]">
            <span className="font-medium">This document is:</span>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={documentType === "UDYAM_CERTIFICATE"}
                onChange={() => onDocumentTypeChange("UDYAM_CERTIFICATE")}
              />
              Udyam Certificate
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={documentType === "NON_MSME_DECLARATION"}
                onChange={() => onDocumentTypeChange("NON_MSME_DECLARATION")}
              />
              Non-MSME Declaration
            </label>
          </div>
        ) : null}
        <p className="text-xs text-gray-600">
          Already have the vendor&apos;s certificate or declaration in hand? Attach it above and
          skip the email below entirely.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-[#0b1f3a]/20 bg-white p-4">
        <p className="text-sm font-medium text-[#0b1f3a]">Don&apos;t have the document yet? Email the vendor</p>
        <p className="text-xs text-gray-600">
          This sends the statutory MSME request notice directly to the vendor, with the MCA
          Notification and Declaration Template attached, CC&apos;d to you and Sunil Salunke for
          the record.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setPreviewOpen((open) => !open)}
            disabled={!canSend}
            className="w-fit rounded-md border border-[#0b1f3a] bg-white px-3 py-1.5 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5 disabled:opacity-50"
          >
            {previewOpen ? "Hide preview" : "Preview MSME Request Email"}
          </button>
        </div>

        {previewOpen ? (
          <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-700">
              <dt className="font-medium uppercase tracking-wide text-gray-500">To</dt>
              <dd>{vendorEmail || "(enter vendor email above)"}</dd>
              <dt className="font-medium uppercase tracking-wide text-gray-500">CC</dt>
              <dd>
                {submittedByEmail || "(your email)"}, {MSME_REQUEST_EMAIL_FIXED_CC}
              </dd>
              <dt className="font-medium uppercase tracking-wide text-gray-500">Subject</dt>
              <dd>{subject}</dd>
            </dl>
            <iframe
              title="MSME request email preview"
              srcDoc={html}
              className="h-[420px] w-full rounded-md border border-gray-200 bg-white"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={sendEmail}
                disabled={!canSend || sending}
                className="w-fit rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send Email"}
              </button>
              {sendError ? <p className="text-sm font-medium text-[#b3261e]">{sendError}</p> : null}
            </div>
          </div>
        ) : null}

        {msmeEmailSentAt ? (
          <p className="text-sm font-medium text-[#1e5c39]">
            Email sent to {vendorEmail}, CC&apos;d to you and Sunil Salunke, on{" "}
            {formatIstDateTime(msmeEmailSentAt)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
