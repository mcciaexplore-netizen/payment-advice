import { z } from "zod";

export const vendorMsmeEmailSchema = z.object({
  vendorName: z.string().trim().min(1, "Vendor name is required"),
  vendorEmail: z.string().trim().email("Enter a valid vendor email"),
  submitterName: z.string().trim().min(1, "Your name is required"),
  submitterEmail: z.string().trim().email("Enter a valid email"),
});

export type VendorMsmeEmailInput = z.infer<typeof vendorMsmeEmailSchema>;
