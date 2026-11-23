import { and, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { paymentAdvices } from "@/lib/db/schema";

/** Who sees which submissions on the Authority / Team dashboard. Used by the
 * dashboard page itself and by the Excel report route, so the report can
 * never include a row the table would not show: both build their scope from
 * this one place. */

export type DashboardRole = "AUTHORITY" | "BRANCH" | "DEPARTMENT" | "SELF" | "CASH_RECEIPT";
export type DashboardGrant = { role: DashboardRole; recommendingAuthorityId: string | null; scopeValue: string | null };
export type DashboardView = "pending" | "history" | "my-submissions" | "team-submissions" | "cash-receipts" | "my-refunds";

type RoleRow = { role: string; recommendingAuthorityId: string | null; scopeValue: string | null };

export function isDashboardRole(value: string | undefined): value is DashboardRole {
  return value === "AUTHORITY" || value === "BRANCH" || value === "DEPARTMENT" || value === "SELF" || value === "CASH_RECEIPT";
}

/** The dashboard entries an account has. A CASH_RECEIPT grant only becomes
 * its own entry when the account does NOT also hold BRANCH or SELF - those
 * already carry the Cash Receipts tab, so a second, more-restricted entry
 * would be redundant and confusing. */
export function pickDashboardGrants(roleRows: RoleRow[]) {
  const holdsBranchGrant = roleRows.some((row) => row.role === "BRANCH" && Boolean(row.scopeValue));
  const holdsSelfGrant = roleRows.some((row) => row.role === "SELF");
  const holdsCashReceiptGrant = roleRows.some((row) => row.role === "CASH_RECEIPT" && Boolean(row.scopeValue));
  const grants = roleRows.filter((row): row is DashboardGrant =>
    (row.role === "AUTHORITY" && Boolean(row.recommendingAuthorityId)) ||
    ((row.role === "BRANCH" || row.role === "DEPARTMENT") && Boolean(row.scopeValue)) ||
    row.role === "SELF" ||
    (row.role === "CASH_RECEIPT" && Boolean(row.scopeValue) && !holdsBranchGrant && !holdsSelfGrant),
  );
  return { grants, holdsCashReceiptGrant };
}

/** Which tab the request lands on, decided server-side so a restricted
 * grant (SELF / CASH_RECEIPT) can never reach Team Submissions whatever
 * ?view= asks for. */
export function resolveDashboardView(activeGrant: DashboardGrant, requestedView: string | undefined, holdsCashReceiptGrant: boolean, refundsTabEnabled = false) {
  const isAuthority = activeGrant.role === "AUTHORITY";
  const isRestrictedGrant = activeGrant.role === "SELF" || activeGrant.role === "CASH_RECEIPT";
  const isBranchGrant = activeGrant.role === "BRANCH";
  const canSeeCashReceiptsTab = isBranchGrant || activeGrant.role === "CASH_RECEIPT" || (activeGrant.role === "SELF" && holdsCashReceiptGrant);
  // My Refunds: every dashboard account's own refund requests, beside My
  // Submissions. Only once refunds are switched on (the table exists).
  const view: DashboardView = requestedView === "my-refunds" && refundsTabEnabled ? "my-refunds" : isAuthority
    ? requestedView === "history" ? "history" : requestedView === "my-submissions" ? "my-submissions" : "pending"
    : requestedView === "cash-receipts" && canSeeCashReceiptsTab ? "cash-receipts"
    : isRestrictedGrant || requestedView === "my-submissions" ? "my-submissions"
    : "team-submissions";
  return { view, isAuthority, isRestrictedGrant, isBranchGrant, canSeeCashReceiptsTab };
}

function caseInsensitiveEq(column: typeof paymentAdvices.branch | typeof paymentAdvices.submittedByDepartment, value: string) {
  return sql`lower(${column}) = lower(${value})`;
}

/** The base WHERE for a tab: exactly the submissions that tab may show.
 * Filters and search are only ever ANDed on top of this. */
export function dashboardScopeWhere(activeGrant: DashboardGrant, view: DashboardView, accountEmail: string): SQL | undefined {
  const ownSubmissions = eq(paymentAdvices.submittedByEmail, accountEmail);
  const authorityScope = eq(paymentAdvices.recommendingAuthorityId, activeGrant.recommendingAuthorityId!);
  // Defaults to ownSubmissions for a restricted grant rather than falling
  // through to authorityScope, so no code path can compute a branch-wide or
  // authority-wide query for one of them.
  const teamScope = activeGrant.role === "BRANCH"
    ? caseInsensitiveEq(paymentAdvices.branch, activeGrant.scopeValue!)
    : activeGrant.role === "DEPARTMENT"
      ? caseInsensitiveEq(paymentAdvices.submittedByDepartment, activeGrant.scopeValue!)
      : activeGrant.role === "SELF" || activeGrant.role === "CASH_RECEIPT"
        ? ownSubmissions
        : authorityScope;
  return view === "my-submissions" ? ownSubmissions : activeGrant.role === "AUTHORITY"
    ? and(authorityScope, view === "history"
      ? or(isNotNull(paymentAdvices.authorityApprovedAt), isNotNull(paymentAdvices.authorityRejectedAt), eq(paymentAdvices.status, "REJECTED"))
      : and(eq(paymentAdvices.status, "SUBMITTED"), isNull(paymentAdvices.authorityApprovedAt), isNull(paymentAdvices.authorityRejectedAt)))
    : teamScope;
}
