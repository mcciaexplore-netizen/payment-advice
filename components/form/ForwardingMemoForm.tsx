"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function ForwardingMemoForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const { register, handleSubmit, formState: { errors } } = useForm<ForwardingMemoFormValues, unknown, ForwardingMemoInput>({
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
      submittedByEmail: "",
    },
  });

  async function submit(values: ForwardingMemoInput) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      const response = await fetch("/api/forwarding-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json().catch(() => null) as { id?: string; error?: string } | null;
      if (!response.ok || !data?.id) {
        setSubmitError(data?.error ?? "The memo could not be submitted. Please try again.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(`/forwarding-memo/submitted/${data.id}`);
    } catch {
      setSubmitError("Could not reach the server. Please check your connection and try again.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="space-y-10">
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
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Submitted by — Name" htmlFor="submittedByName" required error={errors.submittedByName?.message}>
            <Input id="submittedByName" {...register("submittedByName")} hasError={!!errors.submittedByName} aria-invalid={!!errors.submittedByName} />
          </Field>
          <Field label="Email" htmlFor="submittedByEmail" error={errors.submittedByEmail?.message} help="Optional - for a future confirmation receipt.">
            <Input id="submittedByEmail" type="email" {...register("submittedByEmail")} hasError={!!errors.submittedByEmail} aria-invalid={!!errors.submittedByEmail} />
          </Field>
        </div>
      </section>

      {submitError && <p role="alert" className="text-sm text-[#b3261e]">{submitError}</p>}
      <button type="submit" disabled={submitting} className="rounded-md bg-[#2e8b57] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#267348] disabled:cursor-not-allowed disabled:opacity-50">
        {submitting ? "Submitting…" : "Submit Forwarding Memo"}
      </button>
    </form>
  );
}
