"use client";

import { useMemo, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Input";
import { FileUploadSlot } from "@/components/form/FileUploadSlot";
import { buildMsmeMailtoHref, buildMsmeRequestEmail } from "@/lib/advice/msme-email-template";

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
  msmeStatus,
  onMsmeStatusChange,
  msmeDocument,
  onMsmeDocumentChange,
  documentType,
  onDocumentTypeChange,
}: {
  payeeName: string;
  submittedByName: string;
  msmeStatus: string;
  onMsmeStatusChange: (value: string) => void;
  msmeDocument: File[];
  onMsmeDocumentChange: (files: File[]) => void;
  documentType: "UDYAM_CERTIFICATE" | "NON_MSME_DECLARATION";
  onDocumentTypeChange: (value: "UDYAM_CERTIFICATE" | "NON_MSME_DECLARATION") => void;
}) {
  const [copied, setCopied] = useState(false);

  const vendorNameForEmail = payeeName.trim() || "[Vendor Name]";
  const submitterNameForEmail = submittedByName.trim() || "[Your Name]";
  const { subject, body } = useMemo(
    () => buildMsmeRequestEmail({ vendorName: vendorNameForEmail, submitterName: submitterNameForEmail }),
    [vendorNameForEmail, submitterNameForEmail],
  );
  const mailtoHref = useMemo(() => buildMsmeMailtoHref({ subject, body }), [subject, body]);

  function copyEmail() {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-4 flex flex-col gap-6 rounded-md border border-[#0b1f3a]/20 bg-[#0b1f3a]/5 p-4">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-[#0b1f3a]/20 bg-white p-4">
        <p className="text-sm font-medium text-[#0b1f3a]">Get MSME request email for your vendor</p>
        <p className="text-xs text-gray-600">
          Download these, attach them to the email, and send it to your vendor yourself. When they
          reply, come back and attach their certificate/declaration here (optional) - or Finance
          will follow up with them directly if needed.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/msme/mca-notification.pdf"
            download
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-[#0b1f3a] hover:bg-gray-50"
          >
            Download MCA Notification (PDF)
          </a>
          <a
            href="/msme/non-msme-declaration-template.txt"
            download
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-[#0b1f3a] hover:bg-gray-50"
          >
            Download Declaration Template
          </a>
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Subject</p>
          <p className="mt-1 text-sm text-[#171717]">{subject}</p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">Body</p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-[#171717]">{body}</pre>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={copyEmail}
            className="rounded-md border border-[#0b1f3a] bg-white px-3 py-1.5 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
          >
            {copied ? "Copied!" : "Copy email text"}
          </button>
          <a
            href={mailtoHref}
            className="rounded-md bg-[#0b1f3a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
          >
            Open in your email client
          </a>
        </div>
      </div>
    </div>
  );
}
