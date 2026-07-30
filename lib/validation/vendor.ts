import { z } from "zod";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PHONE_RE = /^(\+91)?[6-9]\d{9}$/;

function optionalTrimmed() {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional();
}

export const vendorFormSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  contactPerson: optionalTrimmed(),
  contactPhone: optionalTrimmed().pipe(
    z.string().regex(PHONE_RE, "Enter a 10-digit phone, optionally +91-prefixed").optional(),
  ),
  address: optionalTrimmed(),
  email: optionalTrimmed().pipe(z.string().email("Enter a valid email").optional()),
  gstin: optionalTrimmed().pipe(
    z.string().toUpperCase().regex(GSTIN_RE, "Enter a valid 15-character GSTIN").optional(),
  ),
  udyamNumber: optionalTrimmed(),
  isMsme: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type VendorFormInput = z.input<typeof vendorFormSchema>;
export type VendorFormValues = z.infer<typeof vendorFormSchema>;

export const authorityFormSchema = z.object({
  authorityName: z.string().trim().min(1, "Authority name is required"),
  email: optionalTrimmed().pipe(z.string().email("Enter a valid email").optional()),
  isActive: z.boolean().default(true),
});

export type AuthorityFormInput = z.input<typeof authorityFormSchema>;
export type AuthorityFormValues = z.infer<typeof authorityFormSchema>;

export const staffMemberFormSchema = z
  .object({
    fullName: z.string().trim().min(1, "Name is required"),
    email: optionalTrimmed().pipe(z.string().email("Enter a valid email").optional()),
    isActive: z.boolean().default(true),
    firstAuthorityId: z.string().uuid().optional(),
    secondAuthorityId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.firstAuthorityId &&
      data.secondAuthorityId &&
      data.firstAuthorityId === data.secondAuthorityId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["secondAuthorityId"],
        message: "Second authority must be different from the first",
      });
    }
  });

export type StaffMemberFormInput = z.input<typeof staffMemberFormSchema>;
export type StaffMemberFormValues = z.infer<typeof staffMemberFormSchema>;
