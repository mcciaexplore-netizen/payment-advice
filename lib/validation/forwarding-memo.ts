import { z } from "zod";

const requiredText = (message: string) => z.string().trim().min(1, message);
const dateOnly = z.iso.date("Enter a valid date").refine(
  (value) => !value.startsWith("0000-"),
  "Enter a valid date",
);
const optionalText = z.string().trim().transform((value) => value || undefined).optional();

// Validate the paper's data independently of the existing disbursement forms.
// Number allocation, date policy, access and workflow belong in the eventual
// submission service, once those business decisions have been confirmed.
export const forwardingMemoSchema = z.object({
  memoDate: dateOnly,
  partyName: requiredText("Enter the party name"),
  partyAddress: requiredText("Enter the party address"),
  purpose: requiredText("Enter the purpose in details"),
  billNo: optionalText,
  billDate: optionalText.pipe(dateOnly.optional()),
  instrumentMode: z.enum(["CHEQUE", "DD"], { error: "Select Cheque or D.D." }),
  instrumentNo: requiredText("Enter the cheque or D.D. number"),
  instrumentDate: dateOnly,
  drawnOnBank: requiredText("Enter the bank name"),
  amount: z.number({ error: "Enter the amount" })
    .positive("Amount must be greater than zero")
    .multipleOf(0.01, "Use at most two decimal places")
    .max(999_999_999_999.99, "Amount exceeds the supported limit"),
  // Keep the typed name inside the PDF's physical-signature block.
  submittedByName: requiredText("Enter the submitter's name").max(200, "Use at most 200 characters for the submitter's name"),
});

export type ForwardingMemoFormValues = z.input<typeof forwardingMemoSchema>;
export type ForwardingMemoInput = z.output<typeof forwardingMemoSchema>;
