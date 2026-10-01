import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const approveVendorRequestSchema = z.object({
  companyName: z.string().trim().min(1, "Vendor name is required"),
  address: z.string().trim().min(1, "Vendor address is required"),
  gstin: optionalTrimmed,
});

export type ApproveVendorRequestInput = z.infer<typeof approveVendorRequestSchema>;
