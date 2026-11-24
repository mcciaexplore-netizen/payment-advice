import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUserRoles, adminUsers, paymentAdvices, recommendingAuthorities } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { dashboardFilterCondition, dashboardOrderBy, parseDashboardFilters } from "@/lib/advice/dashboard-filters";
import { dashboardScopeWhere, isDashboardRole, pickDashboardGrants, resolveDashboardView } from "@/lib/advice/dashboard-scope";
import { buildDashboardReport } from "@/lib/advice/dashboard-report";
import { todayInIst } from "@/lib/date-time";
import { refundRequestsEnabled } from "@/lib/refund-requests";

export const runtime = "nodejs";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Excel report of the submissions a dashboard tab is showing. The URL is the
 * tab's own (role, view, stage, decision, search, dates, sort), so the file
 * holds exactly the rows the table lists, in the same order. The scope comes
 * from the same dashboardScopeWhere the page uses, then the filters narrow it
 * - a report can never include a row the person could not see on screen.
 * proxy.ts already limits /api/authority/* to dashboard sessions; this
 * re-derives the scope from the session itself, never from the URL. */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [accounts, roleRows] = await Promise.all([
    db.select({ email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.id, session.adminUserId)).limit(1),
    db.select({ role: adminUserRoles.role, recommendingAuthorityId: adminUserRoles.recommendingAuthorityId, scopeValue: adminUserRoles.scopeValue })
      .from(adminUserRoles).where(eq(adminUserRoles.adminUserId, session.adminUserId)),
  ]);
  const account = accounts[0];
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { grants, holdsCashReceiptGrant } = pickDashboardGrants(roleRows);
  if (grants.length === 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const requestedRole = isDashboardRole(params.role) ? params.role : undefined;
  const activeGrant = grants.find((grant) => grant.role === requestedRole) ?? grants[0];
  const { view, isAuthority } = resolveDashboardView(activeGrant, params.view, holdsCashReceiptGrant, refundRequestsEnabled());
  // Pending My Recommendation has no filters and no report; Cash Receipts has
  // its own report. Only the filterable submission tabs export here.
  if (view === "pending" || view === "cash-receipts" || view === "my-refunds" || view === "refund-requests") {
    return NextResponse.json({ error: "This tab has no report." }, { status: 400 });
  }

  const filters = parseDashboardFilters(params, { decision: isAuthority && view === "history" });
  const scopeWhere = dashboardScopeWhere(activeGrant, view, account.email);
  const filterCondition = dashboardFilterCondition(filters);
  const where = filterCondition ? and(scopeWhere, filterCondition) : scopeWhere;

  const rows = await db.select({
    serialNo: paymentAdvices.serialNo, cashVoucherNo: paymentAdvices.cashVoucherNo, advanceNo: paymentAdvices.advanceNo,
    isAdvance: paymentAdvices.isAdvance, paymentMode: paymentAdvices.paymentMode,
    payeeName: paymentAdvices.payeeName, nature: paymentAdvices.natureOfExpenditure, amount: paymentAdvices.amount, billNo: paymentAdvices.billNo,
    submittedBy: paymentAdvices.submittedByName, submittedByDepartment: paymentAdvices.submittedByDepartment, branch: paymentAdvices.branch,
    authorityName: recommendingAuthorities.authorityName,
    submittedAt: paymentAdvices.submittedAt, status: paymentAdvices.status,
    approvedAt: paymentAdvices.authorityApprovedAt, rejectedAt: paymentAdvices.authorityRejectedAt,
    financeReceivedAt: paymentAdvices.financeReceivedAt, verifiedAt: paymentAdvices.verifiedAt, paymentDoneAt: paymentAdvices.paymentDoneAt,
    totalPaid: paymentAdvices.totalPaid, revisionCount: paymentAdvices.revisionCount,
    authorityRemarks: paymentAdvices.authorityRemarks, adminRemarks: paymentAdvices.adminRemarks,
    finalRejectedAt: paymentAdvices.rejectedAt, finalRejectionRemarks: paymentAdvices.rejectionRemarks,
  }).from(paymentAdvices)
    .leftJoin(recommendingAuthorities, eq(paymentAdvices.recommendingAuthorityId, recommendingAuthorities.id))
    .where(where)
    .orderBy(...(dashboardOrderBy(filters.sort) ?? [desc(paymentAdvices.submittedAt)]));

  const kind = view === "my-submissions" ? "my-submissions" : view === "history" ? "recommendation-history" : "team-submissions";
  // "History" itself is a name Excel reserves for sheets.
  const file = await buildDashboardReport(rows, kind === "my-submissions" ? "My Submissions" : kind === "recommendation-history" ? "Recommendation History" : "Team Submissions");
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${kind}-${todayInIst()}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
