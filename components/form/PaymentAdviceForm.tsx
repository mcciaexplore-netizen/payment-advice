"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { VendorTypeahead, VendorSearchResult } from "@/components/form/VendorTypeahead";
import { StaffNameTypeahead, StaffSearchResult } from "@/components/form/StaffNameTypeahead";
import { RecommendingAuthorityField } from "@/components/form/RecommendingAuthorityField";
import { FileUploadSlot } from "@/components/form/FileUploadSlot";
import { storeSubmissionSummary } from "@/lib/submission-summary";
import { resolveAutoFillEmail } from "@/lib/form/staff-email-autofill";
import {
  paymentAdviceFormSchema,
  PaymentAdviceFormInput,
  PaymentAdviceFormValues,
  MAX_OTHER_ATTACHMENTS,
  DocType,
  calculateCashVoucherTotal,
} from "@/lib/validation/payment-advice";

type RecommendingAuthority = {
  id: string;
  authorityName: string;
};

const today = format(new Date(), "yyyy-MM-dd");

export function PaymentAdviceForm({
  recommendingAuthorities,
  prefill,
  editToken,
  existingAttachments,
}: {
  recommendingAuthorities: RecommendingAuthority[];
  /** When set, this is a resubmission via /edit/[token] — pre-fill everything. */
  prefill?: Partial<PaymentAdviceFormInput> & { formDate?: string };
  editToken?: string;
  /** Attachments already on file from before send-back, keyed by doc type —
   * only relevant in edit/resubmit mode. Uploading a new file for a doc type
   * replaces these; leaving the slot empty keeps them. */
  existingAttachments?: Partial<Record<DocType, string[]>>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [taxInvoice, setTaxInvoice] = useState<File[]>([]);
  const [approvalBudget, setApprovalBudget] = useState<File[]>([]);
  const [purchaseOrder, setPurchaseOrder] = useState<File[]>([]);
  const [deliveryChallanFile, setDeliveryChallanFile] = useState<File[]>([]);
  const [otherFiles, setOtherFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<PaymentAdviceFormInput, unknown, PaymentAdviceFormValues>({
    resolver: zodResolver(paymentAdviceFormSchema),
    defaultValues: {
      formDate: today,
      paymentMode: "NEFT",
      cashVoucherItems: [],
      ...prefill,
    },
  });

  const { fields: cashVoucherFields, append: appendCashVoucherItem, remove: removeCashVoucherItem } =
    useFieldArray({ control, name: "cashVoucherItems" });

  const [matchedStaff, setMatchedStaff] = useState<StaffSearchResult | null>(null);
  // Same "only react on an actual identity change" pattern
  // RecommendingAuthorityField's lastStaffId ref already uses — onMatch can
  // re-fire repeatedly for the *same* matched staff member (e.g. on every
  // keystroke once an exact match is typed), and re-running the email
  // auto-fill logic on those redundant calls would be harmless on its own,
  // but tying the actual fill/clear decision to a real identity change
  // keeps this in lockstep with how the Authority field behaves and makes
  // the "did the match actually change" intent explicit here too.
  const lastMatchedStaffIdRef = useRef<string | null>(null);
  // Tracks whatever this logic itself last wrote into "Your Email" (or null
  // if it never has) — lets resolveAutoFillEmail tell a stale auto-fill
  // (safe to replace on the next match change) apart from a real manual
  // edit or an /edit/[token] resubmit prefill (never touched).
  const lastAutoFilledEmailRef = useRef<string | null>(null);

  const paymentMode = useWatch({ control, name: "paymentMode" });
  const payeeName = useWatch({ control, name: "payeeName" }) ?? "";
  const submittedByName = useWatch({ control, name: "submittedByName" }) ?? "";
  const recommendingAuthorityId = useWatch({ control, name: "recommendingAuthorityId" }) ?? "";
  const watchedCashVoucherItems = useWatch({ control, name: "cashVoucherItems" });
  const cashVoucherItems = useMemo(
    () => watchedCashVoucherItems ?? [],
    [watchedCashVoucherItems],
  );
  const basicAmount = useWatch({ control, name: "basicAmount" });
  const gstAmount = useWatch({ control, name: "gstAmount" });

  useEffect(() => {
    if (paymentMode !== "CASH") return;
    if (cashVoucherItems.length === 0) {
      appendCashVoucherItem({ description: "", amount: 0 });
      return;
    }
    const completeItems = cashVoucherItems.filter(
      (item) => Number.isFinite(item?.amount) && item.amount > 0,
    );
    setValue("amount", calculateCashVoucherTotal(completeItems), {
      shouldValidate: false,
    });
  }, [appendCashVoucherItem, cashVoucherItems, paymentMode, setValue]);

  // Total (Rs.) is always Basic Amount + GST Amount for NEFT — auto-
  // calculated, read-only, updates live as either field changes. Mirrors
  // the Cash Voucher line-item total's existing useEffect pattern above.
  const neftTotal =
    (Number.isFinite(basicAmount) ? Number(basicAmount) : 0) +
    (Number.isFinite(gstAmount) ? Number(gstAmount) : 0);
  useEffect(() => {
    if (paymentMode !== "NEFT") return;
    setValue("amount", Math.round(neftTotal * 100) / 100, { shouldValidate: false });
  }, [paymentMode, neftTotal, setValue]);

  // Mirrors applyVendor's "fill only what's on file" pattern below, plus
  // RecommendingAuthorityField's "only react when the matched identity
  // actually changes" pattern above it. A stale auto-fill from a previous
  // match is updated/cleared when the match changes to someone new; a real
  // manual edit (or an /edit/[token] resubmit prefill) is never touched.
  function handleStaffMatch(staff: StaffSearchResult | null) {
    setMatchedStaff(staff);

    const staffId = staff?.id ?? null;
    if (staffId === lastMatchedStaffIdRef.current) return;
    lastMatchedStaffIdRef.current = staffId;

    const action = resolveAutoFillEmail(
      staff,
      getValues("submittedByEmail") ?? "",
      lastAutoFilledEmailRef.current,
    );
    if (action.type === "fill") {
      setValue("submittedByEmail", action.email);
      lastAutoFilledEmailRef.current = action.email;
    } else if (action.type === "clear") {
      setValue("submittedByEmail", "");
      lastAutoFilledEmailRef.current = null;
    }
  }

  function applyVendor(vendor: VendorSearchResult) {
    setValue("vendorId", vendor.id);
    setValue("payeeName", vendor.companyName);
    if (vendor.address) setValue("payeeAddress", vendor.address);
    if (vendor.contactPerson) setValue("payeeContactPerson", vendor.contactPerson);
    if (vendor.contactPhone) setValue("payeeContactPhone", vendor.contactPhone);
    if (vendor.email) setValue("payeeEmail", vendor.email);
    if (vendor.gstin) setValue("payeeGstin", vendor.gstin);
    if (vendor.udyamNumber) setValue("payeeUdyamNumber", vendor.udyamNumber);
  }

  async function onSubmit(values: PaymentAdviceFormValues) {
    setSubmitError(null);

    const hasTaxInvoice =
      taxInvoice.length === 1 || (existingAttachments?.TAX_INVOICE?.length ?? 0) > 0;
    const hasApprovalBudget =
      approvalBudget.length === 1 || (existingAttachments?.APPROVAL_BUDGET?.length ?? 0) > 0;
    if (!hasTaxInvoice || !hasApprovalBudget) {
      setAttachmentError(
        "Tax Invoice and Approval / Budget Letter are both mandatory attachments.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setAttachmentError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null) continue;
      if (key === "cashVoucherItems") continue;
      formData.append(key, String(value));
    }
    formData.append("cashVoucherItems", JSON.stringify(values.cashVoucherItems));
    if (editToken) formData.append("editToken", editToken);

    taxInvoice.forEach((f) => formData.append("attachment_TAX_INVOICE", f));
    approvalBudget.forEach((f) => formData.append("attachment_APPROVAL_BUDGET", f));
    purchaseOrder.forEach((f) => formData.append("attachment_PURCHASE_ORDER", f));
    deliveryChallanFile.forEach((f) => formData.append("attachment_DELIVERY_CHALLAN", f));
    otherFiles.forEach((f) => formData.append("attachment_OTHER", f));

    setSubmitting(true);
    try {
      const res = await fetch(editToken ? `/api/edit/${editToken}` : "/api/submit", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      storeSubmissionSummary({
        id: data.id,
        serialNo: data.serialNo,
        cashVoucherNo: data.cashVoucherNo ?? null,
        payeeName: values.payeeName,
        amount: values.amount,
        billNo: values.billNo,
        paymentMode: values.paymentMode,
        submittedByName: values.submittedByName,
        submittedByDepartment: values.submittedByDepartment,
        natureOfExpenditure:
          values.paymentMode === "CASH"
            ? values.cashVoucherItems.map((item) => item.description).join("; ")
            : values.natureOfExpenditure ?? "",
        authorityToken: data.authorityToken,
        authorityName: data.authorityName,
      });
      router.push(`/submitted/${encodeURIComponent(data.serialNo)}`);
    } catch {
      setSubmitError("Could not reach the server. Please check your connection and try again.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-10" noValidate>
      {submitError ? (
        <div className="rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-sm font-medium text-[#b3261e]">
          {submitError}
        </div>
      ) : null}

      <Section title="1. Submitter details">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field
            label="Your Name"
            required
            htmlFor="submittedByName"
            error={errors.submittedByName?.message}
            help="Start typing — if you're in the staff list, we'll pick this up automatically."
          >
            <StaffNameTypeahead
              id="submittedByName"
              value={submittedByName}
              onChange={(v) => setValue("submittedByName", v)}
              onMatch={handleStaffMatch}
              hasError={!!errors.submittedByName}
            />
          </Field>
          <Field label="Your Email" required error={errors.submittedByEmail?.message}>
            <Input type="email" hasError={!!errors.submittedByEmail} {...register("submittedByEmail")} />
          </Field>
          <Field label="Your Department" required error={errors.submittedByDepartment?.message}>
            <Input hasError={!!errors.submittedByDepartment} {...register("submittedByDepartment")} />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Recommending Authority"
              required
              error={errors.recommendingAuthorityId?.message}
            >
              <RecommendingAuthorityField
                matchedStaff={matchedStaff}
                allAuthorities={recommendingAuthorities}
                value={recommendingAuthorityId}
                onChange={(id) => setValue("recommendingAuthorityId", id, { shouldValidate: true })}
                hasError={!!errors.recommendingAuthorityId}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="2. Payee details">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Payee / Company Name"
              required
              htmlFor="payeeName"
              error={errors.payeeName?.message}
              help="Search for an existing payee, or type a new name if this is their first payment."
            >
              <VendorTypeahead
                id="payeeName"
                value={payeeName}
                onChange={(v) => setValue("payeeName", v)}
                onSelectVendor={applyVendor}
                hasError={!!errors.payeeName}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address" required error={errors.payeeAddress?.message}>
              <Textarea rows={2} hasError={!!errors.payeeAddress} {...register("payeeAddress")} />
            </Field>
          </div>
          <Field label="Contact Person" error={errors.payeeContactPerson?.message}>
            <Input hasError={!!errors.payeeContactPerson} {...register("payeeContactPerson")} />
          </Field>
          <Field label="Contact Phone" error={errors.payeeContactPhone?.message}>
            <Input placeholder="10 digits, optionally +91" hasError={!!errors.payeeContactPhone} {...register("payeeContactPhone")} />
          </Field>
          <Field label="E-mail ID" error={errors.payeeEmail?.message}>
            <Input type="email" hasError={!!errors.payeeEmail} {...register("payeeEmail")} />
          </Field>
          <Field label="GSTIN" error={errors.payeeGstin?.message}>
            <Input placeholder="15-character GSTIN" hasError={!!errors.payeeGstin} {...register("payeeGstin")} />
          </Field>
          <Field label="Udyam / MSME No." error={errors.payeeUdyamNumber?.message}>
            <Input hasError={!!errors.payeeUdyamNumber} {...register("payeeUdyamNumber")} />
          </Field>
        </div>
      </Section>

      <Section title="3. Bill & reference">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Bill No." required error={errors.billNo?.message}>
            <Input hasError={!!errors.billNo} {...register("billNo")} />
          </Field>
          <Field label="Bill Date" required error={errors.billDate?.message}>
            <Input type="date" max={today} hasError={!!errors.billDate} {...register("billDate")} />
          </Field>
          <Field label="P.O. No." error={errors.poNumber?.message}>
            <Input hasError={!!errors.poNumber} {...register("poNumber")} />
          </Field>
          <Field label="P.O. Date" error={errors.poDate?.message}>
            <Input type="date" hasError={!!errors.poDate} {...register("poDate")} />
          </Field>
          <Field label="Delivery Challan No." error={errors.deliveryChallanNo?.message}>
            <Input hasError={!!errors.deliveryChallanNo} {...register("deliveryChallanNo")} />
          </Field>
          <Field label="Delivery Challan Date" error={errors.deliveryChallanDate?.message}>
            <Input type="date" hasError={!!errors.deliveryChallanDate} {...register("deliveryChallanDate")} />
          </Field>
          {paymentMode === "NEFT" ? (
            <>
              <Field
                label="Basic Amount (Rs.) (*Subject to TDS)"
                required
                error={errors.basicAmount?.message}
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  hasError={!!errors.basicAmount}
                  {...register("basicAmount", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="GST Amount (Rs.)"
                required
                error={errors.gstAmount?.message}
                help="Enter 0 if GST is not applicable"
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  hasError={!!errors.gstAmount}
                  {...register("gstAmount", { valueAsNumber: true })}
                />
              </Field>
              <Field label="Total (Rs.)" error={errors.amount?.message}>
                <Input
                  type="text"
                  readOnly
                  disabled
                  value={neftTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  className="bg-gray-50"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Nature of Expenditure" required error={errors.natureOfExpenditure?.message}>
                  <Textarea rows={3} hasError={!!errors.natureOfExpenditure} {...register("natureOfExpenditure")} />
                </Field>
              </div>
            </>
          ) : null}
          {paymentMode === "CASH" ? (
            <div className="sm:col-span-2 rounded-md border border-[#0b1f3a]/20 bg-[#0b1f3a]/[0.02] p-4">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[#0b1f3a]">Nature of Expenditure <span className="text-xs text-[#b3261e]">Required</span></p>
                  <p className="mt-1 text-xs text-gray-600">Add every Cash Voucher expenditure and its amount.</p>
                </div>
                <button
                  type="button"
                  onClick={() => appendCashVoucherItem({ description: "", amount: 0 })}
                  className="rounded-md border border-[#0b1f3a] px-3 py-1.5 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
                >
                  Add row
                </button>
              </div>
              {errors.cashVoucherItems?.message ? <p className="mb-2 text-sm font-medium text-[#b3261e]">{errors.cashVoucherItems.message}</p> : null}
              <div className="flex flex-col gap-2">
                {cashVoucherFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_9rem_auto] gap-2">
                    <div>
                      <Input
                        placeholder="Expenditure description"
                        hasError={!!errors.cashVoucherItems?.[index]?.description}
                        {...register(`cashVoucherItems.${index}.description`)}
                      />
                      {errors.cashVoucherItems?.[index]?.description ? <p className="mt-1 text-xs font-medium text-[#b3261e]">{errors.cashVoucherItems[index]?.description?.message}</p> : null}
                    </div>
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Amount"
                        hasError={!!errors.cashVoucherItems?.[index]?.amount}
                        {...register(`cashVoucherItems.${index}.amount`, { valueAsNumber: true })}
                      />
                      {errors.cashVoucherItems?.[index]?.amount ? <p className="mt-1 text-xs font-medium text-[#b3261e]">{errors.cashVoucherItems[index]?.amount?.message}</p> : null}
                    </div>
                    <button
                      type="button"
                      disabled={cashVoucherFields.length === 1}
                      onClick={() => removeCashVoucherItem(index)}
                      className="self-start rounded-md px-2 py-2 text-sm text-[#b3261e] hover:bg-[#b3261e]/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end border-t border-[#0b1f3a]/15 pt-3 text-base font-semibold text-[#0b1f3a]">
                Total: ₹ {calculateCashVoucherTotal(cashVoucherItems.filter((item) => Number.isFinite(item?.amount) && item.amount > 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>
          ) : null}
          <Field label="Form Date" required error={errors.formDate?.message} help="Defaults to today; change if backdating.">
            <Input type="date" max={today} hasError={!!errors.formDate} {...register("formDate")} />
          </Field>
        </div>
      </Section>

      <Section title="4. Payment mode">
        <div className="flex flex-col gap-6">
          <Field label="Mode" required error={errors.paymentMode?.message}>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="NEFT" {...register("paymentMode")} />
                NEFT
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="CASH" {...register("paymentMode")} />
                Cash
              </label>
            </div>
          </Field>

          {paymentMode === "NEFT" && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Field label="Bank A/c No." required error={errors.bankAccountNo?.message}>
                <Input hasError={!!errors.bankAccountNo} {...register("bankAccountNo")} />
              </Field>
              <Field label="IFSC Code" required error={errors.bankIfsc?.message}>
                <Input
                  placeholder="e.g. HDFC0001234"
                  hasError={!!errors.bankIfsc}
                  {...register("bankIfsc")}
                />
              </Field>
              <Field label="Beneficiary Name" required error={errors.beneficiaryName?.message}>
                <Input hasError={!!errors.beneficiaryName} {...register("beneficiaryName")} />
              </Field>
            </div>
          )}
        </div>
      </Section>

      <Section title="5. Enclosures & remarks">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Enclosures" error={errors.enclosures?.message}>
            <Textarea rows={2} hasError={!!errors.enclosures} {...register("enclosures")} />
          </Field>
          <Field label="Special Remarks" error={errors.specialRemarks?.message}>
            <Textarea rows={2} hasError={!!errors.specialRemarks} {...register("specialRemarks")} />
          </Field>
        </div>
      </Section>

      <Section title="6. Documents">
        {attachmentError ? (
          <div className="mb-4 rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-sm font-medium text-[#b3261e]">
            {attachmentError}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FileUploadSlot
            label="Tax Invoice"
            required
            maxFiles={1}
            files={taxInvoice}
            onChange={setTaxInvoice}
            existingFileNames={existingAttachments?.TAX_INVOICE}
          />
          <FileUploadSlot
            label="Approval / Budget Letter"
            required
            maxFiles={1}
            files={approvalBudget}
            onChange={setApprovalBudget}
            existingFileNames={existingAttachments?.APPROVAL_BUDGET}
          />
          <FileUploadSlot
            label="Purchase Order"
            maxFiles={1}
            files={purchaseOrder}
            onChange={setPurchaseOrder}
            existingFileNames={existingAttachments?.PURCHASE_ORDER}
          />
          <FileUploadSlot
            label="Delivery Challan"
            maxFiles={1}
            files={deliveryChallanFile}
            onChange={setDeliveryChallanFile}
            existingFileNames={existingAttachments?.DELIVERY_CHALLAN}
          />
          <FileUploadSlot
            label="Other"
            multiple
            maxFiles={MAX_OTHER_ATTACHMENTS}
            files={otherFiles}
            onChange={setOtherFiles}
            existingFileNames={existingAttachments?.OTHER}
          />
        </div>
      </Section>

      <div className="flex justify-end border-t border-gray-200 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#0b1f3a] px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-[#0b1f3a]/90 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : editToken ? "Resubmit" : "Submit Payment Advice"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-heading text-2xl text-[#0b1f3a]">{title}</h2>
      {children}
    </section>
  );
}
