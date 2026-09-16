import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const vendorReviewActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("link"),
    vendorId: z.string().uuid("Select a valid vendor"),
  }),
  z.object({
    action: z.literal("create"),
    companyName: z.string().trim().min(1, "Canonical vendor name is required"),
    address: optionalTrimmed,
  }),
]);

export type VendorReviewAction = z.infer<typeof vendorReviewActionSchema>;
