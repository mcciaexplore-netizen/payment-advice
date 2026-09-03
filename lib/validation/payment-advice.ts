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

/** Same "trim/empty-to-undefined first, THEN validate format" ordering as
 * optionalTrimmed's .pipe() uses for payeeContactPhone/payeeGstin/bankIfsc —
 * validating the regex before the empty-string transform (as a single
 * `.regex().transform()` chain would) fails on "", which matters a lot here:
 * a date input that's conditionally hidden (e.g. Bill Date for an Advance
 * Payment, or "Since" when Previous Pending Advance is 0) still gets
 * registered with react-hook-form's native uncontrolled default of "" the
 * moment it first mounts, and that stale "" is what's still sitting in form
 * state if the field becomes inapplicable and unmounts before ever being
 * touched — without this ordering, submission would fail validation with no
 * visible error anywhere, since the field showing it is gone from the DOM. */
function optionalDateString() {
  return optionalTrimmed().pipe(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional(),
  );
}

/** Same reasoning as optionalDateString above, for a conditionally-hidden
 * numeric field: react-hook-form's `valueAsNumber: true` turns an untouched,
 * stale "" into NaN, which `z.number().optional()` does NOT forgive (only
 * `undefined` satisfies `.optional()`) — so a hidden Basic/GST field that
 * was briefly mounted before the user switched away from NEFT would
 * otherwise block submission invisibly, the same way an unfixed
 * optionalDateString would. */
function optionalNumber(message: string) {
  return z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v) ? undefined : v),
    z.number().multipleOf(0.01, message).optional(),
  );
}

/** Mirrors pastOrTodayDateString's future-date check, for fields that are
 * only conditionally required (so can't use a Zod-level `.refine()` on the
 * base schema — the check has to run inside superRefine instead). */
function isFutureDateString(value: string): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return new Date(value) > today;
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

/** Free-text description + amount line item — shared by Cash Voucher's
 * "Nature of Expenditure" items and Advance Payment's "Particulars"
 * breakdown (see AGENT_HANDOFF.md: Particulars originally had its own
 * preset-category-dropdown + "Other" shape, simplified to reuse this one
 * directly rather than maintaining a parallel schema/total-calculation
 * helper for a structurally identical line item). */
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

    // Section 3 — bill & reference. Optional at the object-shape level since
    // an Advance Payment has no bill yet (the whole section is hidden on the
    // form for advances, mirroring why Tax Invoice isn't required either);
    // required/validated for non-advance submissions specifically in the
    // superRefine below.
    billNo: optionalTrimmed(),
    billDate: optionalDateString(),
    poNumber: optionalTrimmed(),
    poDate: optionalDateString(),
    deliveryChallanNo: optionalTrimmed(),
    deliveryChallanDate: optionalDateString(),
    amount: z
      .number()
      .positive("Amount must be greater than 0")
      .multipleOf(0.01, "Amount can have at most 2 decimal places"),
    // Basic/GST split — NEFT only. Optional at the object-shape level since
    // Cash never submits either; required/validated for NEFT specifically
    // in the superRefine below (gstAmount may legitimately be 0, so it
    // can't just be "truthy required").
    basicAmount: optionalNumber("Basic Amount can have at most 2 decimal places"),
    gstAmount: optionalNumber("GST Amount can have at most 2 decimal places"),
    natureOfExpenditure: optionalTrimmed(),
    cashVoucherItems: z.array(cashVoucherItemSchema).default([]),

    // Advance Payment — a secondary flag layered on top of paymentMode, not
    // a third paymentMode value (see AGENT_HANDOFF.md). When true, the
    // Basic/GST split, cashVoucherItems, and natureOfExpenditure inputs are
    // all bypassed in favor of advanceParticulars + purposeOfAdvance below.
    isAdvance: z.boolean().default(false),
    purposeOfAdvance: optionalTrimmed(),
    // Self-declared by the submitter, not system-verified (no Settlement
    // tracking exists yet — explicitly out of scope). Defaults to 0;
    // previousPendingAdvanceSince is only required when this is > 0.
    previousPendingAdvanceAmount: z
      .number()
      .min(0, "Previous Pending Advance amount cannot be negative")
      .default(0),
    previousPendingAdvanceSince: optionalDateString(),
    advanceParticulars: z.array(cashVoucherItemSchema).default([]),

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
    // Bank details are required for a regular NEFT submission, but NOT for
    // an NEFT-routed advance — Finance already has the submitter's bank
    // details on file as staff, and the fields stay visible/editable on the
    // form in case they want to supply them anyway, just not required.
    if (data.paymentMode === "NEFT" && !data.isAdvance) {
      if (!data.enclosures) {
        ctx.addIssue({
          code: "custom",
          path: ["enclosures"],
          message: "Enclosures are required",
        });
      }
      if (!data.specialRemarks) {
        ctx.addIssue({
          code: "custom",
          path: ["specialRemarks"],
          message: "Special Remarks are required",
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

    if (data.isAdvance) {
      // Advance Payment — Particulars breakdown + Purpose replace the
      // normal Basic/GST split (NEFT) / line items (Cash) + Nature of
      // Expenditure entirely, regardless of which sub-route it's on.
      if (!data.purposeOfAdvance) {
        ctx.addIssue({
          code: "custom",
          path: ["purposeOfAdvance"],
          message: "Purpose of Advance is required",
        });
      }
      if (data.advanceParticulars.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["advanceParticulars"],
          message: "Add at least one Particulars line item",
        });
      }
      const computedTotal = calculateCashVoucherTotal(data.advanceParticulars);
      if (computedTotal <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["advanceParticulars"],
          message: "Particulars total must be greater than 0",
        });
      }
      if (Math.round(data.amount * 100) !== Math.round(computedTotal * 100)) {
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Particulars total does not match the submitted amount",
        });
      }
      if (data.previousPendingAdvanceAmount > 0 && !data.previousPendingAdvanceSince) {
        ctx.addIssue({
          code: "custom",
          path: ["previousPendingAdvanceSince"],
          message: "\"Since\" date is required when a Previous Pending Advance amount is entered",
        });
      }
    } else {
      // Bill & Reference — required for every non-advance submission; an
      // Advance Payment has no bill yet, so this whole section is hidden on
      // the form and skipped entirely when isAdvance is true (see above).
      if (!data.billNo) {
        ctx.addIssue({
          code: "custom",
          path: ["billNo"],
          message: "Bill number is required",
        });
      }
      if (!data.billDate) {
        ctx.addIssue({
          code: "custom",
          path: ["billDate"],
          message: "Bill date is required",
        });
      } else if (isFutureDateString(data.billDate)) {
        ctx.addIssue({
          code: "custom",
          path: ["billDate"],
          message: "Bill date cannot be in the future",
        });
      }

      if (data.paymentMode === "NEFT") {
        if (!data.natureOfExpenditure) {
          ctx.addIssue({
            code: "custom",
            path: ["natureOfExpenditure"],
            message: "Nature of expenditure is required",
          });
        }
        if (data.basicAmount === undefined || data.basicAmount <= 0) {
          ctx.addIssue({
            code: "custom",
            path: ["basicAmount"],
            message: "Basic Amount is required",
          });
        }
        if (data.gstAmount === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["gstAmount"],
            message: "GST Amount is required — enter 0 if GST is not applicable",
          });
        } else if (data.gstAmount < 0) {
          ctx.addIssue({
            code: "custom",
            path: ["gstAmount"],
            message: "GST Amount cannot be negative",
          });
        }
        if (data.basicAmount !== undefined && data.gstAmount !== undefined && data.gstAmount >= 0) {
          const computedTotal =
            (Math.round(data.basicAmount * 100) + Math.round(data.gstAmount * 100)) / 100;
          if (Math.round(data.amount * 100) !== Math.round(computedTotal * 100)) {
            ctx.addIssue({
              code: "custom",
              path: ["amount"],
              message: "Total does not match Basic Amount + GST Amount",
            });
          }
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

/**
 * "Record a Payment" — NEFT only (see AGENT_HANDOFF.md's multi-part payment
 * model). The upper-bound cap (remaining = bill_passed_for - total_paid) is
 * DB-dependent and enforced in the route itself, not here, same reasoning
 * as billPassedForSchema needing `amount` passed in from outside.
 */
export const paymentEntrySchema = z.object({
  amount: z
    .number()
    .positive("Payment amount must be greater than 0")
    .multipleOf(0.01, "Payment amount can have at most 2 decimal places"),
  remarks: requiredTrimmed("Remarks are required for every payment entry"),
});

export const sendBackSchema = z.object({
  adminRemarks: requiredTrimmed("Remarks are required to send an entry back"),
});

export const authorityRejectSchema = z.object({
  remarks: requiredTrimmed("Remarks are required to send this back to the submitter"),
});

export const authorityIdentityConfirmSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
});

export const approveSchema = z.object({
  approvedByName: requiredTrimmed("Approving officer's name is required"),
  billPassedFor: z.number().positive("Bill passed for Rs. is required"),
});
