import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";

/** A regular Payment Advice (NEFT) submission's vendorId must name a real,
 * currently-active vendor — Zod can only check it's a UUID shape, not that
 * it actually exists, so both /api/submit and /api/edit/[token] call this
 * before writing anything. Returns false for a missing, deleted, or
 * deactivated vendor id, including a direct API call that bypasses the
 * client typeahead entirely. */
export async function isActiveVendor(vendorId: string): Promise<boolean> {
  const [vendor] = await db
    .select({ isActive: vendors.isActive })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);
  return vendor?.isActive === true;
}
