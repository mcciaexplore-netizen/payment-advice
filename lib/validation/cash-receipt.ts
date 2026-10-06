import { z } from "zod";
import { GSTIN_RE } from "@/lib/validation/payment-advice";

const requiredText = (message: string) => z.string().trim().min(1, message);

export const CASH_RECEIPT_PARTICULARS = [
  "Sale of Directory",
  "Sale of Safety Material",
  "Sampada / Casual Sale",
  "Computer Printout / Xerox",
  "Hall Hiring Charges",
  "Course / Seminar Fee",
  "Others (Specify)",
] as const;

// Validates the already-composed display string the form sends (e.g.
// "Sale of Directory - Defence Directory - Member (Member ID: 123)"), not
// the raw particulars enum - the client collapses its richer sub-fields
// (directory type, member ID, free-text "specify") into this one string
// before it ever reaches the API, same as the form already did.
const receiptItemSchema = z.object({
  particulars: requiredText("Enter particulars for every line").max(300, "Use at most 300 characters for particulars"),
  copies: z.number({ error: "Enter the number of copies" }).int("Copies must be a whole number").positive("Copies must be greater than zero").max(100000, "Copies exceeds the supported limit"),
  price: z.number({ error: "Enter a price" }).positive("Price must be greater than zero").max(100000000, "Price exceeds the supported limit"),
  billNo: z.string().trim().max(100, "Use at most 100 characters for the bill number").optional().default(""),
  billDate: z.string().trim().max(10, "Enter a valid date").optional().default(""),
});

// branch is deliberately not part of this schema - it is never taken from
// the request body. It comes from the authenticated session's branchScope
// (see app/api/cash-receipts/route.ts), the same "never client-trusted"
// rule the server-computed receiptDate also follows.
export const cashReceiptSchema = z.object({
  partyName: requiredText("Enter the party name").max(200, "Use at most 200 characters for the party name"),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_RE, "Enter a valid 15-character GSTIN").optional().or(z.literal("")),
  items: z.array(receiptItemSchema).min(1, "Add at least one receipt item").max(20, "Add at most 20 receipt items"),
});

export type CashReceiptFormValues = z.input<typeof cashReceiptSchema>;
export type CashReceiptInput = z.output<typeof cashReceiptSchema>;
