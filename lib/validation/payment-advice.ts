import { z } from "zod";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PHONE_RE = /^(\+91)?[6-9]\d{9}$/;

/** Trims a string; converts blank strings to undefined so they store as NULL. */
function optionalTrimmed() {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional();
}

function requiredTrimmed(message: string) {
  return z.string().trim().min(1, message);
}

/** YYYY-MM-DD date-only string, not in the future (compared to today). */
function pastOrTodayDateString(message: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((v) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return new Date(v) <= today;
    }, message);
}

function optionalDateString() {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .transform((v) => (v === "" ? undefined : v))
    .optional();
}

export const docTypeSchema = z.enum([
  "TAX_INVOICE",
  "APPROVAL_BUDGET",
  "PURCHASE_ORDER",
  "DELIVERY_CHALLAN",
  "OTHER",
]);
export type DocType = z.infer<typeof docTypeSchema>;

export const paymentModeSchema = z.enum(["NEFT", "CASH"]);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const statusSchema = z.enum(["SUBMITTED", "SENT_BACK", "APPROVED"]);
export type Status = z.infer<typeof statusSchema>;

/**
 * Fields the submitter fills in on the public form and the /edit/[token]
 * resubmit form. Shared by the client (react-hook-form + zodResolver) and
 * the server API route so validation can never drift between them.
 */
export const paymentAdviceFormSchema = z
  .object({
    // Section 1 — submitter
    submittedByName: requiredTrimmed("Your name is required"),
    submittedByEmail: z.string().trim().email("Enter a valid email"),
    submittedByDepartment: requiredTrimmed("Your department is required"),
    recommendingAuthorityId: z
      .string()
      .uuid("Select a recommending authority"),
    verifiedByName: requiredTrimmed("Verifying officer's name is required"),
    sanctionedByName: requiredTrimmed("Sanctioning officer's name is required"),

    // Section 2 — payee
    vendorId: z.string().uuid().optional(),
    payeeName: requiredTrimmed("Payee / company name is required"),
    payeeAddress: requiredTrimmed("Payee address is required"),
    payeeContactPerson: optionalTrimmed(),
    payeeContactPhone: optionalTrimmed().pipe(
      z
        .string()
        .regex(PHONE_RE, "Enter a 10-digit phone, optionally +91-prefixed")
        .optional(),
    ),
    payeeEmail: optionalTrimmed().pipe(
      z.string().email("Enter a valid email").optional(),
    ),
    payeeGstin: optionalTrimmed().pipe(
      z
        .string()
        .toUpperCase()
        .regex(GSTIN_RE, "Enter a valid 15-character GSTIN")
        .optional(),
    ),
    payeeUdyamNumber: optionalTrimmed(),

    // Section 3 — bill & reference
    billNo: requiredTrimmed("Bill number is required"),
    billDate: pastOrTodayDateString("Bill date cannot be in the future"),
    poNumber: optionalTrimmed(),
    poDate: optionalDateString(),
    deliveryChallanNo: optionalTrimmed(),
    deliveryChallanDate: optionalDateString(),
    amount: z
      .number()
      .positive("Amount must be greater than 0")
      .multipleOf(0.01, "Amount can have at most 2 decimal places"),
    natureOfExpenditure: requiredTrimmed("Nature of expenditure is required"),

    // Section 4 — payment mode
    paymentMode: paymentModeSchema,
    bankAccountNo: optionalTrimmed(),
    bankIfsc: optionalTrimmed().pipe(
      z
        .string()
        .toUpperCase()
        .regex(IFSC_RE, "Enter a valid IFSC code")
        .optional(),
    ),
    beneficiaryName: optionalTrimmed(),

    // Section 5 — enclosures & remarks
    enclosures: optionalTrimmed(),
    specialRemarks: optionalTrimmed(),

    // Header
    formDate: pastOrTodayDateString("Form date cannot be in the future"),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMode === "NEFT") {
      if (!data.bankAccountNo) {
        ctx.addIssue({
          code: "custom",
          path: ["bankAccountNo"],
          message: "Bank A/c No. is required for NEFT",
        });
      }
      if (!data.bankIfsc) {
        ctx.addIssue({
          code: "custom",
          path: ["bankIfsc"],
          message: "IFSC Code is required for NEFT",
        });
      }
      if (!data.beneficiaryName) {
        ctx.addIssue({
          code: "custom",
          path: ["beneficiaryName"],
          message: "Beneficiary Name is required for NEFT",
        });
      }
    }
  });

export type PaymentAdviceFormInput = z.input<typeof paymentAdviceFormSchema>;
export type PaymentAdviceFormValues = z.infer<typeof paymentAdviceFormSchema>;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_OTHER_ATTACHMENTS = 3;

export const billPassedForSchema = (amount: number) =>
  z
    .number()
    .positive("Bill passed for Rs. must be greater than 0")
    .max(amount, "Bill passed for Rs. cannot exceed the billed amount");

export const sendBackSchema = z.object({
  adminRemarks: requiredTrimmed("Remarks are required to send an entry back"),
});

export const approveSchema = z.object({
  approvedByName: requiredTrimmed("Approving officer's name is required"),
  billPassedFor: z.number().positive("Bill passed for Rs. is required"),
});
