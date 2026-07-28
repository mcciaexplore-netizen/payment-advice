"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import {
  vendorFormSchema,
  VendorFormInput,
  VendorFormValues,
} from "@/lib/validation/vendor";

export function VendorForm({
  vendorId,
  initialValues,
}: {
  vendorId?: string;
  initialValues?: Partial<VendorFormInput>;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VendorFormInput, unknown, VendorFormValues>({
    resolver: zodResolver(vendorFormSchema),
    defaultValues: {
      isMsme: false,
      isActive: true,
      ...initialValues,
    },
  });

  async function onSubmit(values: VendorFormValues) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        vendorId ? `/api/admin/vendors/${vendorId}` : "/api/admin/vendors",
        {
          method: vendorId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong.");
        return;
      }
      router.push("/admin/vendors");
      router.refresh();
    } catch {
      setSubmitError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
      {submitError ? (
        <div className="rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-sm font-medium text-[#b3261e]">
          {submitError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Company Name" required error={errors.companyName?.message}>
            <Input hasError={!!errors.companyName} {...register("companyName")} />
          </Field>
        </div>
        <Field label="Contact Person" error={errors.contactPerson?.message}>
          <Input hasError={!!errors.contactPerson} {...register("contactPerson")} />
        </Field>
        <Field label="Contact Phone" error={errors.contactPhone?.message}>
          <Input hasError={!!errors.contactPhone} {...register("contactPhone")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address" error={errors.address?.message}>
            <Input hasError={!!errors.address} {...register("address")} />
          </Field>
        </div>
        <Field label="E-mail" error={errors.email?.message}>
          <Input type="email" hasError={!!errors.email} {...register("email")} />
        </Field>
        <Field label="GSTIN" error={errors.gstin?.message}>
          <Input hasError={!!errors.gstin} {...register("gstin")} />
        </Field>
        <Field label="Udyam / MSME No." error={errors.udyamNumber?.message}>
          <Input hasError={!!errors.udyamNumber} {...register("udyamNumber")} />
        </Field>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isMsme")} />
          MSME
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isActive")} />
          Active
        </label>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#0b1f3a] px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#0b1f3a]/90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : vendorId ? "Save Changes" : "Create Vendor"}
        </button>
      </div>
    </form>
  );
}
