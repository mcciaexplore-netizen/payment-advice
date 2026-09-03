import { z } from "zod";

/** Shared by the client form and the server route — same "one schema,
 * client + server" convention as every other form in this app (see
 * lib/validation/vendor.ts, lib/validation/payment-advice.ts). The
 * "must differ from current password" check lives here (comparing the two
 * submitted plaintext values) rather than re-hashing/re-comparing
 * server-side: by the time this schema's currentPassword is known to be
 * correct (verified separately, via bcrypt, against the stored hash), a
 * plain string-equality check against the submitted newPassword is exactly
 * equivalent and needs no extra bcrypt.compare call. */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "New password and confirmation do not match",
      });
    }
    if (data.newPassword === data.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "New password must be different from your current password",
      });
    }
  });

export type ChangePasswordFormInput = z.input<typeof changePasswordFormSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;
