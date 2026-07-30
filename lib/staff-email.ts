import { db } from "@/lib/db";
import { staffMembers } from "@/lib/db/schema";
import { normalizeName } from "@/lib/staff-authority-emails";

/**
 * Resolves any name (in particular the 6 hardcoded VERIFIER_NAMES /
 * SANCTIONER_NAMES in lib/validation/payment-advice.ts) to a staff email by
 * looking it up against staff_members — the single source of truth for
 * staff emails. Deliberately not a second hardcoded name->email map.
 * Returns null (not an error) for no match, e.g. "DG" (a role, not a
 * person) or any name not in the staff roster.
 */
export async function resolveStaffEmailByName(name: string): Promise<string | null> {
  const target = normalizeName(name);
  if (!target) return null;
  const rows = await db.select({ fullName: staffMembers.fullName, email: staffMembers.email }).from(staffMembers);
  const match = rows.find((r) => normalizeName(r.fullName) === target);
  return match?.email ?? null;
}
