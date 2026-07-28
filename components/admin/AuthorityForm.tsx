"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import {
  authorityFormSchema,
  AuthorityFormInput,
  AuthorityFormValues,
} from "@/lib/validation/vendor";

export function AuthorityForm({
  authorityId,
  initialValues,
}: {
  authorityId?: string;
  initialValues?: Partial<AuthorityFormInput>;
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthorityFormInput, unknown, AuthorityFormValues>({
    resolver: zodResolver(authorityFormSchema),
    defaultValues: {
      isActive: true,
      ...initialValues,
    },
  });

  async function onSubmit(values: AuthorityFormValues) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        authorityId ? `/api/admin/authorities/${authorityId}` : "/api/admin/authorities",
        {
          method: authorityId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong.");
        return;
      }
      router.push("/admin/authorities");
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
        <Field label="Department" required error={errors.department?.message}>
          <Input hasError={!!errors.department} {...register("department")} />
        </Field>
        <Field label="Head Name" required error={errors.headName?.message}>
          <Input hasError={!!errors.headName} {...register("headName")} />
        </Field>
        <Field label="E-mail" error={errors.email?.message}>
          <Input type="email" hasError={!!errors.email} {...register("email")} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("isActive")} />
        Active
      </label>

      <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#0b1f3a] px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#0b1f3a]/90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : authorityId ? "Save Changes" : "Create Authority"}
        </button>
      </div>
    </form>
  );
}
