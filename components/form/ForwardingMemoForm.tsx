"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { todayInIst } from "@/lib/date-time";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import {
  forwardingMemoSchema,
  type ForwardingMemoFormValues,
  type ForwardingMemoInput,
} from "@/lib/validation/forwarding-memo";

// A submission handler must be supplied by the confirmed memo workflow.
// Rendering this component alone never sends or persists financial data.
export function ForwardingMemoForm({
  onSubmit,
  submissionEnabled = false,
}: {
  onSubmit?: (values: ForwardingMemoInput) => Promise<void>;
  submissionEnabled?: boolean;
}) {
  const [submitError, setSubmitError] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForwardingMemoFormValues, unknown, ForwardingMemoInput>({
    resolver: zodResolver(forwardingMemoSchema),
    defaultValues: {
      memoDate: todayInIst(),
      partyName: "",
      partyAddress: "",
      purpose: "",
      billNo: "",
      billDate: "",
      instrumentNo: "",
      instrumentDate: "",
      drawnOnBank: "",
      submittedByName: "",
    },
  });
  async function submit(values: ForwardingMemoInput) {
    if (!onSubmit && !submissionEnabled) return;
    setSubmitError(undefined);
    try {
      if (onSubmit) {
        await onSubmit(values);
      } else {
        // Local mode deliberately renders a PDF without requiring a database.
        const popup = window.open("about:blank", "_blank");
        const response = await fetch("/api/forwarding-memo/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!response.ok) {
          popup?.close();
          const result = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(result?.error ?? "The memo PDF could not be generated.");
        }
        const pdfUrl = URL.createObjectURL(await response.blob());
        if (popup) {
          popup.location.href = pdfUrl;
        } else {
          const link = document.createElement("a");
          link.href = pdfUrl;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.click();
        }
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "The memo could not be submitted. Please try again.");
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="space-y-10">
      {!onSubmit && !submissionEnabled && (
        <p id="memo-submission-status" role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[#0b1f3a]">
          Forwarding Memo submissions are not yet enabled. Details entered here will not be saved.
        </p>
      )}
      <section className="space-y-6" aria-labelledby="memo-party-heading">
        <h2 id="memo-party-heading" className="font-heading text-2xl text-[#0b1f3a]">1. Party details</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Date" htmlFor="memoDate" required error={errors.memoDate?.message}>
            <Input id="memoDate" type="date" readOnly {...register("memoDate")} hasError={!!errors.memoDate} aria-invalid={!!errors.memoDate} />
          </Field>
        </div>
        <Field label="Name of the Party" htmlFor="partyName" required error={errors.partyName?.message}>
          <Input id="partyName" {...register("partyName")} hasError={!!errors.partyName} aria-invalid={!!errors.partyName} />
        </Field>
        <Field label="Address of the Party" htmlFor="partyAddress" required error={errors.partyAddress?.message}>
          <Textarea id="partyAddress" rows={3} {...register("partyAddress")} hasError={!!errors.partyAddress} aria-invalid={!!errors.partyAddress} />
        </Field>
        <Field label="Purpose (in details)" htmlFor="purpose" required error={errors.purpose?.message}>
          <Textarea id="purpose" rows={4} {...register("purpose")} hasError={!!errors.purpose} aria-invalid={!!errors.purpose} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Against our Bill No." htmlFor="billNo" error={errors.billNo?.message}>
            <Input id="billNo" {...register("billNo")} hasError={!!errors.billNo} aria-invalid={!!errors.billNo} />
          </Field>
          <Field label="Bill Date" htmlFor="billDate" error={errors.billDate?.message}>
            <Input id="billDate" type="date" {...register("billDate")} hasError={!!errors.billDate} aria-invalid={!!errors.billDate} />
          </Field>
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="memo-instrument-heading">
        <h2 id="memo-instrument-heading" className="font-heading text-2xl text-[#0b1f3a]">2. Payment instrument</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Mode" htmlFor="instrumentMode" required error={errors.instrumentMode?.message}>
            <Select id="instrumentMode" defaultValue="" {...register("instrumentMode")} hasError={!!errors.instrumentMode} aria-invalid={!!errors.instrumentMode}>
              <option value="" disabled>Select Cheque or D.D.</option>
              <option value="CHEQUE">Cheque</option>
              <option value="DD">D.D.</option>
            </Select>
          </Field>
          <Field label="Cheque / D.D. No." htmlFor="instrumentNo" required error={errors.instrumentNo?.message}>
            <Input id="instrumentNo" {...register("instrumentNo")} hasError={!!errors.instrumentNo} aria-invalid={!!errors.instrumentNo} />
          </Field>
          <Field label="Cheque / D.D. Date" htmlFor="instrumentDate" required error={errors.instrumentDate?.message}>
            <Input id="instrumentDate" type="date" {...register("instrumentDate")} hasError={!!errors.instrumentDate} aria-invalid={!!errors.instrumentDate} />
          </Field>
          <Field label="Drawn on (name of bank)" htmlFor="drawnOnBank" required error={errors.drawnOnBank?.message}>
            <Input id="drawnOnBank" {...register("drawnOnBank")} hasError={!!errors.drawnOnBank} aria-invalid={!!errors.drawnOnBank} />
          </Field>
          <Field label="Amount — for Rs." htmlFor="amount" required error={errors.amount?.message}>
            <Input id="amount" type="number" inputMode="decimal" min="0.01" step="0.01" {...register("amount", { valueAsNumber: true })} hasError={!!errors.amount} aria-invalid={!!errors.amount} />
          </Field>
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="memo-signatures-heading">
        <h2 id="memo-signatures-heading" className="font-heading text-2xl text-[#0b1f3a]">3. Submitted by — Name &amp; Signature</h2>
        <Field label="Submitted by — Name" htmlFor="submittedByName" required error={errors.submittedByName?.message}>
          <Input id="submittedByName" {...register("submittedByName")} hasError={!!errors.submittedByName} aria-invalid={!!errors.submittedByName} />
        </Field>
      </section>

      {submitError && <p role="alert" className="text-sm text-[#b3261e]">{submitError}</p>}
      <button type="submit" disabled={(!onSubmit && !submissionEnabled) || isSubmitting} aria-describedby={!onSubmit && !submissionEnabled ? "memo-submission-status" : undefined} className="rounded-md bg-[#2e8b57] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#267348] disabled:cursor-not-allowed disabled:opacity-50">
        {isSubmitting ? "Submitting…" : "Submit Forwarding Memo"}
      </button>
    </form>
  );
}
