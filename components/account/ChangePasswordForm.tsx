"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import {
  changePasswordFormSchema,
  ChangePasswordFormInput,
  ChangePasswordFormValues,
} from "@/lib/validation/account";

/** Shared by /admin/change-password and /authority/change-password — the
 * underlying route (POST /api/account/change-password) and validation are
 * identical for every admin_users role, only the surrounding page chrome
 * differs. */
export function ChangePasswordForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormInput, unknown, ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
  });

  async function onSubmit(values: ChangePasswordFormValues) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Could not change your password.");
        return;
      }
      reset();
      setSuccess(true);
    } catch {
      setSubmitError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-sm rounded-md border border-[#2e8b57]/30 bg-[#2e8b57]/5 px-4 py-3 text-sm text-[#1f6b41]">
        Your password has been changed. Use it the next time you sign in — you
        won&apos;t be signed out of this session now.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-sm flex-col gap-6" noValidate>
      {submitError ? (
        <div className="rounded-md border border-[#b3261e]/30 bg-[#b3261e]/5 px-4 py-3 text-sm font-medium text-[#b3261e]">
          {submitError}
        </div>
      ) : null}

      <Field label="Current Password" required error={errors.currentPassword?.message}>
        <Input
          type="password"
          autoComplete="current-password"
          hasError={!!errors.currentPassword}
          {...register("currentPassword")}
        />
      </Field>

      <Field
        label="New Password"
        required
        help="Minimum 8 characters."
        error={errors.newPassword?.message}
      >
        <Input
          type="password"
          autoComplete="new-password"
          hasError={!!errors.newPassword}
          {...register("newPassword")}
        />
      </Field>

      <Field label="Confirm New Password" required error={errors.confirmPassword?.message}>
        <Input
          type="password"
          autoComplete="new-password"
          hasError={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
      </Field>

      <div className="flex justify-end border-t border-gray-200 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[#0b1f3a] px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#0b1f3a]/90 disabled:opacity-50"
        >
          {submitting ? "Changing…" : "Change Password"}
        </button>
      </div>
    </form>
  );
}

/** Shared page-width and heading treatment for both Finance Admin and
 * Authority Approvals. Keeping the centering here prevents the two routes
 * from drifting into different layouts while they share the same form. */
export function ChangePasswordPageContent({ description }: { description: string }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-[#0b1f3a]">Change Password</h1>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
