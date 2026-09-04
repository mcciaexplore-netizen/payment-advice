"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { upload } from "@vercel/blob/client";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { VendorTypeahead, VendorSearchResult } from "@/components/form/VendorTypeahead";
import { StaffNameTypeahead, StaffSearchResult } from "@/components/form/StaffNameTypeahead";
import { RecommendingAuthorityField } from "@/components/form/RecommendingAuthorityField";
import { FileUploadSlot } from "@/components/form/FileUploadSlot";
import { LineItemsField } from "@/components/form/LineItemsField";
import { storeSubmissionSummary } from "@/lib/submission-summary";
import { resolveAutoFillEmail } from "@/lib/form/staff-email-autofill";
import { resolveSourceFieldAutoFill } from "@/lib/form/source-field-autofill";
import {
  safeUploadFileName,
  type UploadedAttachment,
} from "@/lib/attachments/client-upload";
import { ATTACHMENT_SIZE_ERROR, readSubmitResponse } from "@/lib/form/submit-response";
import { todayInIst } from "@/lib/date-time";
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

const today = todayInIst();

export function PaymentAdviceForm({
  mode,
  recommendingAuthorities,
  prefill,
  editToken,
  existingAttachments,
}: {
  /** Fixed per page, never toggled at runtime — "standard" is the plain
   * Dedicated public document route, or the existing Advance route. All render this
   * same component so the shared field logic (submitter/payee auto-fill,
   * Particulars, attachments) only ever lives in one place; only which
   * sections render, and whether isAdvance itself is true, differ. */
  mode: "payment-advice" | "cash-voucher" | "advance";
  recommendingAuthorities: RecommendingAuthority[];
  /** When set, this is a resubmission via /edit/[token] — pre-fill everything. */
  prefill?: Partial<PaymentAdviceFormInput> & { formDate?: string };
  editToken?: string;
  /** Attachments already on file from before send-back, keyed by doc type —
   * only relevant in edit/resubmit mode. Uploading a new file for a doc type
   * replaces these; leaving the slot empty keeps them. */
  existingAttachments?: Partial<Record<DocType, string[]>>;
}) {
  const isAdvance = mode === "advance";
  const isCashVoucher = mode === "cash-voucher";
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
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
      paymentMode: isCashVoucher ? "CASH" : "NEFT",
      cashVoucherItems: isCashVoucher ? [{ description: "", amount: undefined as unknown as number }] : [],
      isAdvance,
      previousPendingAdvanceAmount: 0,
      // Seeded directly here (not via a useEffect that appends when empty)
      // since isAdvance is now fixed from the very first render for the
      // dedicated /advance page — an effect-based "append if empty" runs
      // during initial mount, which React Strict Mode's dev-only
      // double-invocation would run twice against the same stale closure,
      // silently seeding two rows instead of one.
      advanceParticulars: isAdvance ? [{ description: "", amount: 0 }] : [],
      ...prefill,
    },
  });

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
  const submittedByEmail = useWatch({ control, name: "submittedByEmail" }) ?? "";
  const recommendingAuthorityId = useWatch({ control, name: "recommendingAuthorityId" }) ?? "";
  const watchedCashVoucherItems = useWatch({ control, name: "cashVoucherItems" });
  const cashVoucherItems = useMemo(
    () => watchedCashVoucherItems ?? [],
    [watchedCashVoucherItems],
  );
  const basicAmount = useWatch({ control, name: "basicAmount" });
  const gstAmount = useWatch({ control, name: "gstAmount" });
  const watchedAdvanceParticulars = useWatch({ control, name: "advanceParticulars" });
  const advanceParticulars = useMemo(
    () => watchedAdvanceParticulars ?? [],
    [watchedAdvanceParticulars],
  );
  const previousPendingAdvanceAmount =
    useWatch({ control, name: "previousPendingAdvanceAmount" }) ?? 0;
  const attachmentGroups = useMemo(
    () => [
      { docType: "TAX_INVOICE" as const, files: taxInvoice },
      { docType: "APPROVAL_BUDGET" as const, files: approvalBudget },
      { docType: "PURCHASE_ORDER" as const, files: purchaseOrder },
      { docType: "DELIVERY_CHALLAN" as const, files: deliveryChallanFile },
      { docType: "OTHER" as const, files: otherFiles },
    ],
    [taxInvoice, approvalBudget, purchaseOrder, deliveryChallanFile, otherFiles],
  );
  const attachmentTotalBytes = attachmentGroups.reduce(
    (total, group) => total + group.files.reduce((sum, file) => sum + file.size, 0),
    0,
  );

  useEffect(() => {
    if (isAdvance || paymentMode !== "CASH") return;
    const completeItems = cashVoucherItems.filter(
      (item) => Number.isFinite(item?.amount) && item.amount > 0,
    );
    setValue("amount", calculateCashVoucherTotal(completeItems), {
      shouldValidate: false,
    });
  }, [cashVoucherItems, isAdvance, paymentMode, setValue]);

  // Total (Rs.) is always Basic Amount + GST Amount for NEFT — auto-
  // calculated, read-only, updates live as either field changes. Mirrors
  // the Cash Voucher line-item total's existing useEffect pattern above.
  const neftTotal =
    (Number.isFinite(basicAmount) ? Number(basicAmount) : 0) +
    (Number.isFinite(gstAmount) ? Number(gstAmount) : 0);
  useEffect(() => {
    if (isAdvance || paymentMode !== "NEFT") return;
    setValue("amount", Math.round(neftTotal * 100) / 100, { shouldValidate: false });
  }, [isAdvance, paymentMode, neftTotal, setValue]);

  // Advance Payment's Particulars total — same live-summed-total mechanic
  // as the Cash Voucher line items above. The first row is seeded via
  // defaultValues (see above), and "Remove" is disabled at 1 remaining row,
  // so this never needs to re-seed an empty array itself.
  useEffect(() => {
    if (!isAdvance) return;
    const completeItems = advanceParticulars.filter(
      (item) => Number.isFinite(item?.amount) && item.amount > 0,
    );
    setValue("amount", calculateCashVoucherTotal(completeItems), {
      shouldValidate: false,
    });
  }, [advanceParticulars, isAdvance, setValue]);

  // Advance Payment's payee IS the submitter — they're receiving the
  // advance themselves, not paying a vendor — so the vendor typeahead is
  // hidden and Payee Name/Email are instead auto-filled from Submitter
  // Name/Email, using the same "only react on an actual source-value
  // change, never fight the user" pattern as the staff-match email
  // auto-fill below.
  const lastAutoFilledPayeeNameRef = useRef<string | null>(null);
  const lastAutoFilledPayeeEmailRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAdvance && !isCashVoucher) return;
    const action = resolveSourceFieldAutoFill(
      submittedByName,
      getValues("payeeName") ?? "",
      lastAutoFilledPayeeNameRef.current,
    );
    if (action.type === "fill") {
      setValue("payeeName", action.value);
      lastAutoFilledPayeeNameRef.current = action.value;
    } else if (action.type === "clear") {
      setValue("payeeName", "");
      lastAutoFilledPayeeNameRef.current = null;
    }
  }, [isAdvance, isCashVoucher, submittedByName, getValues, setValue]);

  useEffect(() => {
    if (!isAdvance && !isCashVoucher) return;
    const action = resolveSourceFieldAutoFill(
      submittedByEmail,
      getValues("payeeEmail") ?? "",
      lastAutoFilledPayeeEmailRef.current,
    );
    if (action.type === "fill") {
      setValue("payeeEmail", action.value);
      lastAutoFilledPayeeEmailRef.current = action.value;
    } else if (action.type === "clear") {
      setValue("payeeEmail", "");
      lastAutoFilledPayeeEmailRef.current = null;
    }
  }, [isAdvance, isCashVoucher, submittedByEmail, getValues, setValue]);

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

    // Tax Invoice / Supplementary Document is required for both regular
    // document types. Approval / Budget Letter is only mandatory for advances.
    const hasTaxInvoice =
      values.isAdvance ||
      taxInvoice.length === 1 ||
      (existingAttachments?.TAX_INVOICE?.length ?? 0) > 0;
    const hasApprovalBudget = !values.isAdvance ||
      approvalBudget.length === 1 || (existingAttachments?.APPROVAL_BUDGET?.length ?? 0) > 0;
    if (!hasTaxInvoice || !hasApprovalBudget) {
      setAttachmentError(
        values.isAdvance
          ? "Approval / Budget Letter is a mandatory attachment."
          : "Tax Invoice / Supplementary Document is a mandatory attachment.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setAttachmentError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null) continue;
      if (key === "cashVoucherItems" || key === "advanceParticulars") continue;
      formData.append(key, String(value));
    }
    formData.append("cashVoucherItems", JSON.stringify(values.cashVoucherItems));
    formData.append("advanceParticulars", JSON.stringify(values.advanceParticulars));
    if (editToken) formData.append("editToken", editToken);

    setSubmitting(true);
    const uploadedAttachments: UploadedAttachment[] = [];
    try {
      setUploadingAttachments(true);
      const uploadBatchId = crypto.randomUUID();
      for (const { docType, files } of attachmentGroups) {
        for (const file of files) {
          const blob = await upload(
            `pending-uploads/${uploadBatchId}/${docType}-${safeUploadFileName(file.name)}`,
            file,
            {
              access: "private",
              handleUploadUrl: "/api/attachments/upload",
              multipart: file.size > 4 * 1024 * 1024,
            },
          );
          uploadedAttachments.push({
            docType,
            fileName: file.name,
            blobPathname: blob.pathname,
            blobUrl: blob.url,
            sizeBytes: file.size,
          });
        }
      }
      setUploadingAttachments(false);
      formData.append("uploadedAttachments", JSON.stringify(uploadedAttachments));

      const res = await fetch(editToken ? `/api/edit/${editToken}` : "/api/submit", {
        method: "POST",
        body: formData,
      });
      const { data, sizeError } = await readSubmitResponse(res);
      if (!res.ok) {
        await cleanupPendingUploads(uploadedAttachments);
        setSubmitError(
          sizeError
            ? ATTACHMENT_SIZE_ERROR
            : data.error ?? "Something went wrong while submitting. Please try again.",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      storeSubmissionSummary({
        id: data.id!,
        serialNo: data.serialNo!,
        cashVoucherNo: data.cashVoucherNo ?? null,
        isAdvance: values.isAdvance,
        advanceNo: data.advanceNo ?? null,
        payeeName: values.payeeName,
        amount: values.amount,
        billNo: values.billNo ?? "",
        paymentMode: values.paymentMode,
        submittedByName: values.submittedByName,
        submittedByDepartment: values.submittedByDepartment,
        natureOfExpenditure: values.isAdvance
          ? values.purposeOfAdvance ?? ""
          : values.paymentMode === "CASH"
            ? values.cashVoucherItems.map((item) => item.description).join("; ")
            : values.natureOfExpenditure ?? "",
        authorityToken: data.authorityToken!,
        authorityName: data.authorityName!,
      });
      router.push(`/submitted/${encodeURIComponent(data.serialNo!)}`);
    } catch (error) {
      await cleanupPendingUploads(uploadedAttachments);
      const message = error instanceof Error ? error.message : "";
      setSubmitError(
        /too large|size|413|maximum/i.test(message)
          ? ATTACHMENT_SIZE_ERROR
          : "Could not upload or submit your documents. Please check your connection and try again.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setUploadingAttachments(false);
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

      {!isCashVoucher ? <Section title="2. Payee details">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Payee / Company Name"
              required
              htmlFor="payeeName"
              error={errors.payeeName?.message}
              help={
                isAdvance
                  ? "Auto-filled from Your Name above — an advance is paid to you, the requester. Edit if needed."
                  : "Search for an existing payee, or type a new name if this is their first payment."
              }
            >
              {isAdvance ? (
                <Input id="payeeName" hasError={!!errors.payeeName} {...register("payeeName")} />
              ) : (
                <VendorTypeahead
                  id="payeeName"
                  value={payeeName}
                  onChange={(v) => setValue("payeeName", v)}
                  onSelectVendor={applyVendor}
                  hasError={!!errors.payeeName}
                />
              )}
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
      </Section> : null}

      <Section title={isAdvance ? "3. Advance details" : isCashVoucher ? "2. Bill & reference" : "3. Bill & reference"}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {!isAdvance ? (
            <>
              <Field label="Bill No." required={!isCashVoucher} error={errors.billNo?.message}>
                <Input hasError={!!errors.billNo} {...register("billNo")} />
              </Field>
              <Field label="Bill Date" required={!isCashVoucher} error={errors.billDate?.message}>
                <Input type="date" max={today} hasError={!!errors.billDate} {...register("billDate")} />
              </Field>
              {!isCashVoucher ? <><Field label="P.O. No." error={errors.poNumber?.message}>
                <Input hasError={!!errors.poNumber} {...register("poNumber")} />
              </Field>
              <Field label="P.O. Date" error={errors.poDate?.message}>
                <Input type="date" hasError={!!errors.poDate} {...register("poDate")} />
              </Field>
              <Field label="Delivery Challan No." error={errors.deliveryChallanNo?.message}>
                <Input hasError={!!errors.deliveryChallanNo} {...register("deliveryChallanNo")} />
              </Field>
              <Field label="Delivery Challan Date" error={errors.deliveryChallanDate?.message}>
                <Input
                  type="date"
                  hasError={!!errors.deliveryChallanDate}
                  {...register("deliveryChallanDate")}
                />
              </Field>
              </> : null}
            </>
          ) : null}
          {mode === "advance" ? (
            <div className="sm:col-span-2 flex flex-col gap-6">
              <LineItemsField
                name="advanceParticulars"
                heading="Particulars"
                helpText="Add every item this advance covers and its amount."
                descriptionPlaceholder="Description"
                register={register}
                control={control}
                errors={errors}
              />

              <Field
                label="Purpose of Advance"
                required
                error={errors.purposeOfAdvance?.message}
                help="The overall reason for this advance, even if the Particulars above are a single general item."
              >
                <Textarea
                  rows={2}
                  hasError={!!errors.purposeOfAdvance}
                  {...register("purposeOfAdvance")}
                />
              </Field>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Field
                  label="Previous Pending Advance (Rs.)"
                  required
                  error={errors.previousPendingAdvanceAmount?.message}
                  help="Self-declared. Enter 0 if none."
                >
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    hasError={!!errors.previousPendingAdvanceAmount}
                    {...register("previousPendingAdvanceAmount", { valueAsNumber: true })}
                  />
                </Field>
                {previousPendingAdvanceAmount > 0 ? (
                  <Field
                    label="Previous Pending Advance — Since"
                    required
                    error={errors.previousPendingAdvanceSince?.message}
                  >
                    <Input
                      type="date"
                      max={today}
                      hasError={!!errors.previousPendingAdvanceSince}
                      {...register("previousPendingAdvanceSince")}
                    />
                  </Field>
                ) : null}
              </div>
            </div>
          ) : null}
          {!isAdvance && paymentMode === "NEFT" ? (
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
          {!isAdvance && paymentMode === "CASH" ? (
            <LineItemsField
              name="cashVoucherItems"
              heading="Nature of Expenditure"
              helpText="Add every Cash Voucher expenditure and its amount."
              descriptionPlaceholder="Expenditure description"
              register={register}
              control={control}
              errors={errors}
            />
          ) : null}
          <Field label="Form Date" required error={errors.formDate?.message} help="Defaults to today; change if backdating.">
            <Input type="date" max={today} hasError={!!errors.formDate} {...register("formDate")} />
          </Field>
        </div>
      </Section>

      {!isCashVoucher ? <Section title={isAdvance ? "4. Payment mode" : "4. Bank details"}>
        <div className="flex flex-col gap-6">
          {isAdvance ? <Field label="Mode" required error={errors.paymentMode?.message}>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={paymentMode === "NEFT"}
                  onChange={() => setValue("paymentMode", "NEFT", { shouldValidate: true })}
                />
                NEFT
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={paymentMode === "CASH"}
                  onChange={() => setValue("paymentMode", "CASH", { shouldValidate: true })}
                />
                Cash
              </label>
            </div>
          </Field> : null}

          {paymentMode === "NEFT" && (
            <div className={`grid grid-cols-1 gap-6 ${isAdvance ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {isAdvance ? (
                <p className="sm:col-span-3 text-xs text-gray-500">
                  Optional for an advance — Finance already has your bank details on file. Fill these
                  in only if you want to provide them here as well.
                </p>
              ) : null}
              <Field
                label="Bank A/c No."
                required={!isAdvance}
                error={errors.bankAccountNo?.message}
              >
                <Input hasError={!!errors.bankAccountNo} {...register("bankAccountNo")} />
              </Field>
              <Field label="IFSC Code" required={!isAdvance} error={errors.bankIfsc?.message}>
                <Input
                  placeholder="e.g. HDFC0001234"
                  hasError={!!errors.bankIfsc}
                  {...register("bankIfsc")}
                />
              </Field>
              <Field
                label="Beneficiary Name"
                required={!isAdvance}
                error={errors.beneficiaryName?.message}
              >
                <Input hasError={!!errors.beneficiaryName} {...register("beneficiaryName")} />
              </Field>
              {!isAdvance ? <Field label="Bank Name" required error={errors.bankName?.message}>
                <Input hasError={!!errors.bankName} {...register("bankName")} />
              </Field> : null}
            </div>
          )}
        </div>
      </Section> : null}

      <Section title={isCashVoucher ? "3. Enclosures & remarks" : "5. Enclosures & remarks"}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field
            label="Enclosures"
            required={!isAdvance && paymentMode === "NEFT"}
            error={errors.enclosures?.message}
          >
            <Textarea rows={2} hasError={!!errors.enclosures} {...register("enclosures")} />
          </Field>
          <Field
            label="Special Remarks"
            required={!isAdvance && paymentMode === "NEFT"}
            error={errors.specialRemarks?.message}
          >
            <Textarea rows={2} hasError={!!errors.specialRemarks} {...register("specialRemarks")} />
          </Field>
        </div>
      </Section>

      <Section title={isCashVoucher ? "4. Documents" : "6. Documents"}>
        {attachmentError ? (
          <div className="mb-4 rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-sm font-medium text-[#b3261e]">
            {attachmentError}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {!isAdvance ? (
            <FileUploadSlot
              label={isCashVoucher ? "Tax Invoice / Supplementary Document" : "Tax Invoice"}
              required
              allowImages
              maxFiles={1}
              files={taxInvoice}
              onChange={setTaxInvoice}
              existingFileNames={existingAttachments?.TAX_INVOICE}
            />
          ) : null}
          <FileUploadSlot
            label="Approval / Budget Letter"
            required={isAdvance}
            allowImages={!isAdvance}
            maxFiles={1}
            files={approvalBudget}
            onChange={setApprovalBudget}
            existingFileNames={existingAttachments?.APPROVAL_BUDGET}
          />
          {isAdvance ? <FileUploadSlot
            label="Purchase Order"
            maxFiles={1}
            files={purchaseOrder}
            onChange={setPurchaseOrder}
            existingFileNames={existingAttachments?.PURCHASE_ORDER}
          /> : null}
          {isAdvance ? <FileUploadSlot
            label="Delivery Challan"
            maxFiles={1}
            files={deliveryChallanFile}
            onChange={setDeliveryChallanFile}
            existingFileNames={existingAttachments?.DELIVERY_CHALLAN}
          /> : null}
          {isAdvance ? <FileUploadSlot
            label="Other"
            multiple
            maxFiles={MAX_OTHER_ATTACHMENTS}
            files={otherFiles}
            onChange={setOtherFiles}
            existingFileNames={existingAttachments?.OTHER}
          /> : null}
        </div>
        <p className="text-sm font-medium text-[#0b1f3a]" aria-live="polite">
          {(attachmentTotalBytes / 1024 / 1024).toFixed(2)} MB of new attachments added
        </p>
      </Section>

      <div className="flex justify-end border-t border-gray-200 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#0b1f3a] px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-[#0b1f3a]/90 disabled:opacity-50"
        >
          {submitting
            ? uploadingAttachments
              ? "Uploading attachments…"
              : "Submitting…"
            : editToken
              ? "Resubmit"
              : isAdvance
                ? "Submit Advance Payment Request"
                : isCashVoucher
                  ? "Submit Cash Payment Voucher"
                  : "Submit Payment Advice"}
        </button>
      </div>
    </form>
  );
}

async function cleanupPendingUploads(uploads: UploadedAttachment[]) {
  if (uploads.length === 0) return;
  await fetch("/api/attachments/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathnames: uploads.map((upload) => upload.blobPathname) }),
  }).catch(() => undefined);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-heading text-2xl text-[#0b1f3a]">{title}</h2>
      {children}
    </section>
  );
}
