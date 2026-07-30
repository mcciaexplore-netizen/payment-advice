"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import {
  staffMemberFormSchema,
  StaffMemberFormInput,
  StaffMemberFormValues,
} from "@/lib/validation/vendor";

type Authority = { id: string; authorityName: string };

export function StaffForm({
  staffId,
  initialValues,
  allAuthorities,
}: {
  staffId?: string;
  initialValues?: Partial<StaffMemberFormInput>;
  allAuthorities: Authority[];
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<StaffMemberFormInput, unknown, StaffMemberFormValues>({
    resolver: zodResolver(staffMemberFormSchema),
    defaultValues: {
      isActive: true,
      ...initialValues,
    },
  });

  const firstAuthorityId = useWatch({ control, name: "firstAuthorityId" });

  async function onSubmit(values: StaffMemberFormValues, force = false) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(staffId ? `/api/admin/staff/${staffId}` : "/api/admin/staff", {
        method: staffId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(force ? { ...values, force } : values),
      });
      const data = await res.json();
      if (!res.ok) {
        // Deactivating someone with in-progress submissions 409s with a
        // warning rather than silently blocking or silently allowing it —
        // offer the same confirm-and-retry-with-force escape hatch the row
        // toggle button uses.
        if (res.status === 409 && data.inProgressCount !== undefined) {
          setSubmitting(false);
          if (window.confirm(`${data.error}\n\nDeactivate anyway?`)) {
            await onSubmit(values, true);
          }
          return;
        }
        setSubmitError(data.error ?? "Something went wrong.");
        return;
      }
      router.push("/admin/staff");
      router.refresh();
    } catch {
      setSubmitError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values))} className="flex flex-col gap-6" noValidate>
      {submitError ? (
        <div className="rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-sm font-medium text-[#b3261e]">
          {submitError}
        </div>
      ) : null}

      <Field label="Full Name" required error={errors.fullName?.message}>
        <Input hasError={!!errors.fullName} {...register("fullName")} />
      </Field>

      <Field
        label="E-mail"
        error={errors.email?.message}
        help="Drives the public form's 'Your Email' auto-fill and notification delivery."
      >
        <Input type="email" hasError={!!errors.email} {...register("email")} />
      </Field>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field
          label="First Recommending Authority"
          error={errors.firstAuthorityId?.message}
          help="Pre-selected automatically on the public form when this person submits."
        >
          <Select hasError={!!errors.firstAuthorityId} {...register("firstAuthorityId")}>
            <option value="">None</option>
            {allAuthorities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.authorityName}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Second Recommending Authority"
          error={errors.secondAuthorityId?.message}
          help="Optional — offered as an alternative radio option."
        >
          <Select hasError={!!errors.secondAuthorityId} {...register("secondAuthorityId")}>
            <option value="">None</option>
            {allAuthorities
              .filter((a) => a.id !== firstAuthorityId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.authorityName}
                </option>
              ))}
          </Select>
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
          {submitting ? "Saving…" : staffId ? "Save Changes" : "Create Staff Member"}
        </button>
      </div>
    </form>
  );
}
