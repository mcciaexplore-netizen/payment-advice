import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  staffMembers,
  staffAuthorityOptions,
  recommendingAuthorities,
  paymentAdvices,
  refundRequests,
} from "@/lib/db/schema";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

// Public endpoint: drives the Submitter Name typeahead and the Recommending
// Authority auto-fill on the public form — both need to work without login.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ staff: [] });
  }

  const staff = await db
    .select({ id: staffMembers.id, fullName: staffMembers.fullName, email: staffMembers.email })
    .from(staffMembers)
    .where(and(eq(staffMembers.isActive, true), ilike(staffMembers.fullName, `%${q}%`)))
    .limit(10);

  if (staff.length === 0) {
    return NextResponse.json({ staff: [] });
  }

  const staffIds = staff.map((s) => s.id);
  const staffNames = staff.map((s) => s.fullName.trim().toLowerCase());
  const adviceName = sql<string>`lower(trim(${paymentAdvices.submittedByName}))`;
  const refundName = sql<string>`lower(trim(${refundRequests.submittedByName}))`;
  const [options, adviceHistory, refundHistory] = await Promise.all([
    db
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
      // A deactivated authority must not surface as a selectable option for
      // new submissions, even if a staff member is still linked to it.
      .where(
        and(inArray(staffAuthorityOptions.staffMemberId, staffIds), eq(recommendingAuthorities.isActive, true)),
      )
      .orderBy(asc(staffAuthorityOptions.sortOrder)),
    db
      .selectDistinctOn([adviceName], {
        name: adviceName,
        department: paymentAdvices.submittedByDepartment,
        branch: paymentAdvices.branch,
        recordedAt: paymentAdvices.submittedAt,
      })
      .from(paymentAdvices)
      .where(
        and(
          inArray(adviceName, staffNames),
          inArray(paymentAdvices.branch, [...BRANCH_OPTIONS]),
        ),
      )
      .orderBy(adviceName, desc(paymentAdvices.submittedAt)),
    db
      .selectDistinctOn([refundName], {
        name: refundName,
        department: refundRequests.submittedByDepartment,
        branch: refundRequests.branch,
        recordedAt: refundRequests.createdAt,
      })
      .from(refundRequests)
      .where(
        and(
          inArray(refundName, staffNames),
          isNotNull(refundRequests.branch),
          inArray(refundRequests.branch, [...BRANCH_OPTIONS]),
        ),
      )
      .orderBy(refundName, desc(refundRequests.createdAt)),
  ]);

  const optionsByStaffId = new Map<string, { id: string; authorityName: string }[]>();
  for (const o of options) {
    const list = optionsByStaffId.get(o.staffMemberId) ?? [];
    list.push({ id: o.authorityId, authorityName: o.authorityName });
    optionsByStaffId.set(o.staffMemberId, list);
  }

  const historyByName = new Map<
    string,
    { department: string; branch: string; recordedAt: Date }
  >();
  for (const record of [...adviceHistory, ...refundHistory]) {
    const previous = historyByName.get(record.name);
    if (!previous || record.recordedAt > previous.recordedAt) {
      historyByName.set(record.name, {
        department: record.department,
        branch: record.branch!,
        recordedAt: record.recordedAt,
      });
    }
  }

  return NextResponse.json({
    staff: staff.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      department: historyByName.get(s.fullName.trim().toLowerCase())?.department ?? null,
      branch: historyByName.get(s.fullName.trim().toLowerCase())?.branch ?? null,
      authorityOptions: optionsByStaffId.get(s.id) ?? [],
    })),
  });
}
