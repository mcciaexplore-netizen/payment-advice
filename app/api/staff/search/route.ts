import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { staffMembers, staffAuthorityOptions, recommendingAuthorities } from "@/lib/db/schema";

export const runtime = "nodejs";

// Public endpoint: drives the Submitter Name typeahead and the Recommending
// Authority auto-fill on the public form — both need to work without login.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ staff: [] });
  }

  const staff = await db
    .select({ id: staffMembers.id, fullName: staffMembers.fullName })
    .from(staffMembers)
    .where(and(eq(staffMembers.isActive, true), ilike(staffMembers.fullName, `%${q}%`)))
    .limit(10);

  if (staff.length === 0) {
    return NextResponse.json({ staff: [] });
  }

  const staffIds = staff.map((s) => s.id);
  const options = await db
    .select({
      staffMemberId: staffAuthorityOptions.staffMemberId,
      sortOrder: staffAuthorityOptions.sortOrder,
      authorityId: recommendingAuthorities.id,
      authorityName: recommendingAuthorities.authorityName,
    })
    .from(staffAuthorityOptions)
    .innerJoin(
      recommendingAuthorities,
      eq(staffAuthorityOptions.recommendingAuthorityId, recommendingAuthorities.id),
    )
    .where(inArray(staffAuthorityOptions.staffMemberId, staffIds))
    .orderBy(asc(staffAuthorityOptions.sortOrder));

  const optionsByStaffId = new Map<string, { id: string; authorityName: string }[]>();
  for (const o of options) {
    const list = optionsByStaffId.get(o.staffMemberId) ?? [];
    list.push({ id: o.authorityId, authorityName: o.authorityName });
    optionsByStaffId.set(o.staffMemberId, list);
  }

  return NextResponse.json({
    staff: staff.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      authorityOptions: optionsByStaffId.get(s.id) ?? [],
    })),
  });
}
