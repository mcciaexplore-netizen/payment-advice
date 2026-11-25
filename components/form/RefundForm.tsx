"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Field } from "@/components/ui/Field";
import { FileUploadSlot } from "@/components/form/FileUploadSlot";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { BRANCH_OPTIONS, DEPARTMENT_OPTIONS, MAX_OTHER_ATTACHMENTS } from "@/lib/validation/payment-advice";
import { safeUploadFileName, PENDING_UPLOAD_PREFIX } from "@/lib/attachments/client-upload";
import { todayInIst } from "@/lib/date-time";

type RefundDocumentType = "EMAIL_COPY" | "CANCELLED_CHEQUE" | "OTHER";
type RefundDocument = {
  type: RefundDocumentType;
  fileName: string;
  blobPathname: string;
  blobUrl: string;
  sizeBytes: number;
};

/** A refund being corrected after the authority sent it back: its stored
 * values, its stored documents (kept unless unticked), and who submitted it
 * (shown, not editable: it goes back to the same authority, same login). */
export type RefundEditData = {
  refundId: string;
  submitter: { name: string; email: string; department: string; branch: string; recommendingAuthority: string };
  values: Record<"payeeName" | "payeeAddress" | "payeeContactPerson" | "payeeContactPhone" | "payeeEmail" | "payeeGstin" | "payeeUdyamNumber" | "basicAmount" | "gstAmount" | "natureOfExpenditure" | "fromDate" | "bankName" | "beneficiaryName" | "bankAccountNo" | "bankIfsc" | "enclosures" | "specialRemarks", string>;
  documents: Array<{ type: RefundDocumentType; fileName: string }>;
};

const DOCUMENT_LABELS: Record<RefundDocumentType, string> = { EMAIL_COPY: "Email copy", CANCELLED_CHEQUE: "Cancelled cheque", OTHER: "Other document" };

/** `persist` comes from the server (REFUND_REQUESTS_ENABLED). Off: the form
 * is a database-free preview and uploads nothing. On: documents go to the
 * private Blob store, the server saves the request, and the browser moves to
 * the confirmation page with the real REF/MCCIA serial. With `edit`, the same
 * form corrects a sent-back refund and resubmits it (same reference number). */
export function RefundForm({ authorityOptions, persist, edit }: { authorityOptions: string[]; persist: boolean; edit?: RefundEditData }) {
  const router = useRouter();
  const initial = (key: keyof RefundEditData["values"]) => edit?.values[key] ?? "";
  const [keepDocuments, setKeepDocuments] = useState<boolean[]>(() => edit?.documents.map(() => true) ?? []);
  const [emailFiles, setEmailFiles] = useState<File[]>([]);
  const [chequeFiles, setChequeFiles] = useState<File[]>([]);
  const [otherFiles, setOtherFiles] = useState<File[]>([]);
  const [department, setDepartment] = useState("");
  const [basicAmount, setBasicAmount] = useState(edit?.values.basicAmount ?? "0");
  const [gstAmount, setGstAmount] = useState(edit?.values.gstAmount ?? "0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDone, setPreviewDone] = useState(false);

  async function uploadDocument(file: File, type: RefundDocumentType): Promise<RefundDocument> {
    const pathname = `${PENDING_UPLOAD_PREFIX}${crypto.randomUUID()}/REFUND_${type}-${safeUploadFileName(file.name)}`;
    const blob = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/attachments/upload",
      multipart: file.size > 4 * 1024 * 1024,
    });
    return { type, fileName: file.name, blobPathname: blob.pathname, blobUrl: blob.url, sizeBytes: file.size };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    if (!edit && department === "OTHERS") data.set("submittedByDepartment", String(data.get("otherDepartment") ?? "").trim());
    const basic = Number(data.get("basicAmount")) || 0;
    const gst = Number(data.get("gstAmount")) || 0;
    if (basic + gst <= 0) {
      setError("Enter a Basic Amount or GST Amount greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const documents: RefundDocument[] = [];
      if (persist || edit) {
        if (emailFiles[0]) documents.push(await uploadDocument(emailFiles[0], "EMAIL_COPY"));
        if (chequeFiles[0]) documents.push(await uploadDocument(chequeFiles[0], "CANCELLED_CHEQUE"));
        for (const file of otherFiles) documents.push(await uploadDocument(file, "OTHER"));
      }
      data.set("documents", JSON.stringify(documents));
      if (edit) data.set("keepDocuments", JSON.stringify(keepDocuments.flatMap((keep, index) => (keep ? [index] : []))));
      const response = await fetch(edit ? `/api/refund/${edit.refundId}/resubmit` : "/api/refund/submit", { method: "POST", body: data });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Could not submit the third party refund request.");
      if (payload?.previewOnly || !payload?.id) {
        setPreviewDone(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(edit ? `/refund/submitted/${payload.id}?resubmitted=1` : `/refund/submitted/${payload.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the third party refund request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (previewDone) {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-[#0b1f3a]">
        <h2 className="font-heading text-2xl font-semibold">Third Party Refund form preview complete</h2>
        <p className="mt-3 text-sm text-amber-900">Local preview only. This request was not saved or sent, and no files were uploaded.</p>
        <button type="button" className="mt-5 rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white" onClick={() => { setPreviewDone(false); setEmailFiles([]); setChequeFiles([]); setOtherFiles([]); }}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {edit ? (
        <section className="space-y-3">
          <h2 className="font-heading text-2xl text-[#0b1f3a]">1. Submitter details</h2>
          <dl className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-2">
            {([["Your Name", edit.submitter.name], ["Your Email", edit.submitter.email], ["Your Department", edit.submitter.department], ["Your Branch", edit.submitter.branch], ["Recommending Authority", edit.submitter.recommendingAuthority]] as const).map(([label, value]) => (
              <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="font-medium text-[#0b1f3a]">{value}</dd></div>
            ))}
          </dl>
          <p className="text-xs text-gray-500">These stay as submitted, so the request goes back to the same recommending authority.</p>
        </section>
      ) : (
        <section className="space-y-5">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">1. Submitter details</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your Name" required><Input name="submittedByName" required /></Field>
          <Field label="Your Email" required><Input name="submittedByEmail" type="email" required /></Field>
          <Field label="Your Department" required>
            <Select name="submittedByDepartment" required value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="" disabled>Select your department</option>
              {DEPARTMENT_OPTIONS.filter((option) => option !== "OTHERS").map((option) => <option key={option} value={option}>{option}</option>)}
              <option value="OTHERS">Others</option>
            </Select>
            {department === "OTHERS" && <Input name="otherDepartment" placeholder="Enter your department" required />}
          </Field>
          <Field label="Your Branch" required>
            <Select name="branch" required defaultValue="">
              <option value="" disabled>Select your branch</option>
              {BRANCH_OPTIONS.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Recommending Authority" required help="Type the authority name or select a suggestion.">
              <Input name="recommendingAuthority" list="refund-authorities" required />
              <datalist id="refund-authorities">{authorityOptions.map((authority) => <option key={authority} value={authority} />)}</datalist>
            </Field>
          </div>
        </div>
      </section>
      )}

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">2. Payee details</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Payee / Company Name" required>
              <Input name="payeeName" defaultValue={initial("payeeName")} required maxLength={2000} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address">
              <Textarea name="payeeAddress" defaultValue={initial("payeeAddress")} rows={2} maxLength={2000} />
            </Field>
          </div>
          <Field label="Contact Person"><Input name="payeeContactPerson" defaultValue={initial("payeeContactPerson")} maxLength={200} /></Field>
          <Field label="Contact Phone"><Input name="payeeContactPhone" defaultValue={initial("payeeContactPhone")} type="tel" maxLength={30} /></Field>
          <Field label="E-mail ID"><Input name="payeeEmail" defaultValue={initial("payeeEmail")} type="email" maxLength={320} /></Field>
          <Field label="GSTIN"><Input name="payeeGstin" defaultValue={initial("payeeGstin")} maxLength={15} pattern="[0-9A-Za-z]{15}" title="15-character GSTIN" /></Field>
          <Field label="Udyam / MSME No."><Input name="payeeUdyamNumber" defaultValue={initial("payeeUdyamNumber")} maxLength={50} /></Field>
        </div>
      </section>

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">3. Third Party Refund details</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Basic Amount (Rs.)" required><Input name="basicAmount" type="number" min="0" step="0.01" value={basicAmount} onChange={(event) => setBasicAmount(event.target.value)} required /></Field>
          <Field label="GST Amount (Rs.)" required><Input name="gstAmount" type="number" min="0" step="0.01" value={gstAmount} onChange={(event) => setGstAmount(event.target.value)} required /></Field>
          <Field label="Nature of expenditure" required><Textarea name="natureOfExpenditure" defaultValue={initial("natureOfExpenditure")} rows={3} required maxLength={2000} /></Field>
          <Field label="From Date" required><Input name="fromDate" defaultValue={initial("fromDate")} type="date" max={todayInIst()} required /></Field>
        </div>
        <p className="text-sm text-gray-700">Total refund: <strong>₹{(Number(basicAmount || 0) + Number(gstAmount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
      </section>

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">4. Bank details <span className="text-base font-normal text-gray-500">(optional)</span></h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Bank Name"><Input name="bankName" defaultValue={initial("bankName")} /></Field>
          <Field label="Account Holder Name"><Input name="beneficiaryName" defaultValue={initial("beneficiaryName")} /></Field>
          <Field label="Bank Account Number"><Input name="bankAccountNo" defaultValue={initial("bankAccountNo")} /></Field>
          <Field label="IFSC Code"><Input name="bankIfsc" defaultValue={initial("bankIfsc")} /></Field>
        </div>
      </section>

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">5. Enclosures and remarks <span className="text-base font-normal text-gray-500">(optional)</span></h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Enclosures"><Textarea name="enclosures" defaultValue={initial("enclosures")} rows={2} /></Field>
          <Field label="Remarks"><Textarea name="specialRemarks" defaultValue={initial("specialRemarks")} rows={2} /></Field>
        </div>
      </section>

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">6. Documents</h2>
        {edit && edit.documents.length ? (
          <fieldset className="rounded-md border border-gray-200 p-4">
            <legend className="px-1 text-sm font-medium text-[#0b1f3a]">Attached now (untick to remove)</legend>
            <ul className="flex flex-col gap-2 text-sm">
              {edit.documents.map((document, index) => (
                <li key={`${document.type}-${index}`}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={keepDocuments[index] ?? true} onChange={(event) => setKeepDocuments((current) => current.map((keep, at) => (at === index ? event.target.checked : keep)))} />
                    <span className="text-gray-500">{DOCUMENT_LABELS[document.type]}:</span> <span className="font-medium text-[#0b1f3a]">{document.fileName}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-500">A new Email copy or Cancelled cheque below replaces the one attached now. New Other documents are added.</p>
          </fieldset>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <FileUploadSlot label="Email copy" allowImages files={emailFiles} onChange={setEmailFiles} />
          <FileUploadSlot label="Cancelled cheque" allowImages files={chequeFiles} onChange={setChequeFiles} />
          <FileUploadSlot label="Other Documents" allowImages multiple maxFiles={MAX_OTHER_ATTACHMENTS} files={otherFiles} onChange={setOtherFiles} />
        </div>
      </section>

      <div className="flex justify-end border-t border-gray-200 pt-6">
        <button type="submit" disabled={submitting} className="rounded-md bg-[#0b1f3a] px-6 py-3 font-medium text-white hover:bg-[#17375f] disabled:opacity-60">
          {submitting ? "Submitting..." : edit ? "Resubmit Third Party Refund Request" : persist ? "Submit Third Party Refund Request" : "Preview Third Party Refund Request"}
        </button>
      </div>
    </form>
  );
}
