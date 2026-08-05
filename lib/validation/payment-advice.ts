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
 * Finance Verification + Sanctioning pipeline (runs after Recommending
 * Authority approval, for both NEFT and Cash).
 *
 * VERIFIER_NAMES / verifierNameSchema: retained ONLY for the still-existing
 * `PATCH .../verify` correction route and its historical audit_log entries
 * (see AGENT_HANDOFF.md's "Real logins, retire Sanction" session) — Verify
 * itself no longer uses a picker. Since real per-person Admin logins
 * (admin_users), `verified_by` is auto-attributed from the logged-in
 * user's full_name, which is not guaranteed to be one of these 4 names
 * (e.g. the ALL-role account). Don't reuse this enum for new validation.
 *
 * SANCTIONER_NAMES / sanctionerNameSchema / sanctionSchema: Sanction is
 * retired as an active step (see AGENT_HANDOFF.md) — kept only because
 * `POST/PATCH .../sanction` still exist for historical data, unreachable
 * from the UI going forward.
 */
export const VERIFIER_NAMES = [
  "Sunil Salunke",
  "Abha Khatavkar",
  "Vaidehi Marathe",
  "Chandrashekhar Shah",
] as const;
export const verifierNameSchema = z.enum(VERIFIER_NAMES);
export type VerifierName = z.infer<typeof verifierNameSchema>;

export const SANCTIONER_NAMES = ["Chintamani Shrotri", "DG"] as const;
export const sanctionerNameSchema = z.enum(SANCTIONER_NAMES);
export type SanctionerName = z.infer<typeof sanctionerNameSchema>;

export const sanctionSchema = z.object({
  sanctionedBy: sanctionerNameSchema,
  billPassedFor: z.number().positive("Bill passed for Rs. is required").optional(),
});

/** Body for correcting an already-recorded Verifier/Sanctioner name — never
 * touches verifiedAt/sanctionedAt or (for sanction) billPassedFor, so these
 * are deliberately narrower than verifySchema/sanctionSchema, not reused
 * from them. */
export const verifierNameCorrectionSchema = z.object({
  verifiedBy: verifierNameSchema,
});
export const sanctionerNameCorrectionSchema = z.object({
  sanctionedBy: sanctionerNameSchema,
});

export const cashVoucherItemSchema = z.object({
  description: requiredTrimmed("Nature of expenditure is required"),
  amount: z
    .number()
    .positive("Each expenditure amount must be greater than 0")
    .multipleOf(0.01, "Each expenditure amount can have at most 2 decimal places"),
});
export type CashVoucherItem = z.infer<typeof cashVoucherItemSchema>;

/** Sums currency using paise to avoid floating-point drift. */
export function calculateCashVoucherTotal(items: CashVoucherItem[]): number {
  return items.reduce((total, item) => total + Math.round(item.amount * 100), 0) / 100;
}

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
    natureOfExpenditure: optionalTrimmed(),
    cashVoucherItems: z.array(cashVoucherItemSchema).default([]),

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
      if (!data.natureOfExpenditure) {
        ctx.addIssue({
          code: "custom",
          path: ["natureOfExpenditure"],
          message: "Nature of expenditure is required",
        });
      }
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
    if (data.paymentMode === "CASH") {
      if (data.cashVoucherItems.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["cashVoucherItems"],
          message: "Add at least one expenditure line item",
        });
      }
      const computedTotal = calculateCashVoucherTotal(data.cashVoucherItems);
      if (computedTotal <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["cashVoucherItems"],
          message: "Cash voucher total must be greater than 0",
        });
      }
      if (Math.round(data.amount * 100) !== Math.round(computedTotal * 100)) {
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Cash voucher total does not match the submitted amount",
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

export const authorityRejectSchema = z.object({
  remarks: requiredTrimmed("Remarks are required to send this back to the submitter"),
});

export const approveSchema = z.object({
  approvedByName: requiredTrimmed("Approving officer's name is required"),
  billPassedFor: z.number().positive("Bill passed for Rs. is required"),
});
