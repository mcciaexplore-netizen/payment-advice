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

/** `persist` comes from the server (REFUND_REQUESTS_ENABLED). Off: the form
 * is a database-free preview and uploads nothing. On: documents go to the
 * private Blob store, the server saves the request, and the browser moves to
 * the confirmation page with the real REF/MCCIA serial. */
export function RefundForm({ authorityOptions, persist }: { authorityOptions: string[]; persist: boolean }) {
  const router = useRouter();
  const [emailFiles, setEmailFiles] = useState<File[]>([]);
  const [chequeFiles, setChequeFiles] = useState<File[]>([]);
  const [otherFiles, setOtherFiles] = useState<File[]>([]);
  const [department, setDepartment] = useState("");
  const [basicAmount, setBasicAmount] = useState("0");
  const [gstAmount, setGstAmount] = useState("0");
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
    if (department === "OTHERS") data.set("submittedByDepartment", String(data.get("otherDepartment") ?? "").trim());
    const basic = Number(data.get("basicAmount")) || 0;
    const gst = Number(data.get("gstAmount")) || 0;
    if (basic + gst <= 0) {
      setError("Enter a Basic Amount or GST Amount greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const documents: RefundDocument[] = [];
      if (persist) {
        if (emailFiles[0]) documents.push(await uploadDocument(emailFiles[0], "EMAIL_COPY"));
        if (chequeFiles[0]) documents.push(await uploadDocument(chequeFiles[0], "CANCELLED_CHEQUE"));
        for (const file of otherFiles) documents.push(await uploadDocument(file, "OTHER"));
      }
      data.set("documents", JSON.stringify(documents));
      const response = await fetch("/api/refund/submit", { method: "POST", body: data });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Could not submit the refund request.");
      if (payload?.previewOnly || !payload?.id) {
        setPreviewDone(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(`/refund/submitted/${payload.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the refund request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (previewDone) {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-[#0b1f3a]">
        <h2 className="font-heading text-2xl font-semibold">Refund form preview complete</h2>
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

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">2. Payee details</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Payee / Company Name" required>
              <Input name="payeeName" required maxLength={2000} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address">
              <Textarea name="payeeAddress" rows={2} maxLength={2000} />
            </Field>
          </div>
          <Field label="Contact Person"><Input name="payeeContactPerson" maxLength={200} /></Field>
          <Field label="Contact Phone"><Input name="payeeContactPhone" type="tel" maxLength={30} /></Field>
          <Field label="E-mail ID"><Input name="payeeEmail" type="email" maxLength={320} /></Field>
          <Field label="GSTIN"><Input name="payeeGstin" maxLength={15} pattern="[0-9A-Za-z]{15}" title="15-character GSTIN" /></Field>
          <Field label="Udyam / MSME No."><Input name="payeeUdyamNumber" maxLength={50} /></Field>
        </div>
      </section>

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">3. Refund details</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Basic Amount (Rs.)" required><Input name="basicAmount" type="number" min="0" step="0.01" value={basicAmount} onChange={(event) => setBasicAmount(event.target.value)} required /></Field>
          <Field label="GST Amount (Rs.)" required><Input name="gstAmount" type="number" min="0" step="0.01" value={gstAmount} onChange={(event) => setGstAmount(event.target.value)} required /></Field>
          <Field label="Nature of expenditure" required><Textarea name="natureOfExpenditure" rows={3} required maxLength={2000} /></Field>
          <Field label="From Date" required><Input name="fromDate" type="date" max={todayInIst()} required /></Field>
        </div>
        <p className="text-sm text-gray-700">Total refund: <strong>₹{(Number(basicAmount || 0) + Number(gstAmount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
      </section>

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">4. Bank details <span className="text-base font-normal text-gray-500">(optional)</span></h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Bank Name"><Input name="bankName" /></Field>
          <Field label="Account Holder Name"><Input name="beneficiaryName" /></Field>
          <Field label="Bank Account Number"><Input name="bankAccountNo" /></Field>
          <Field label="IFSC Code"><Input name="bankIfsc" /></Field>
        </div>
      </section>

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">5. Enclosures and remarks <span className="text-base font-normal text-gray-500">(optional)</span></h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Enclosures"><Textarea name="enclosures" rows={2} /></Field>
          <Field label="Remarks"><Textarea name="specialRemarks" rows={2} /></Field>
        </div>
      </section>

      <section className="space-y-5 border-t border-gray-200 pt-6">
        <h2 className="font-heading text-2xl text-[#0b1f3a]">6. Documents</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <FileUploadSlot label="Email copy" allowImages files={emailFiles} onChange={setEmailFiles} />
          <FileUploadSlot label="Cancelled cheque" allowImages files={chequeFiles} onChange={setChequeFiles} />
          <FileUploadSlot label="Other Documents" allowImages multiple maxFiles={MAX_OTHER_ATTACHMENTS} files={otherFiles} onChange={setOtherFiles} />
        </div>
      </section>

      <div className="flex justify-end border-t border-gray-200 pt-6">
        <button type="submit" disabled={submitting} className="rounded-md bg-[#0b1f3a] px-6 py-3 font-medium text-white hover:bg-[#17375f] disabled:opacity-60">
          {submitting ? "Submitting..." : persist ? "Submit Refund Request" : "Preview Refund Request"}
        </button>
      </div>
    </form>
  );
}
