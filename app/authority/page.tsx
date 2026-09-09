import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull, isNull, or, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUserRoles, adminUsers, paymentAdvices, paymentEntries, recommendingAuthorities } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { displayNoFor } from "@/lib/advice/document-identity";
import { pipelineStageFor } from "@/lib/advice/pipeline-stage";
import { StageBadge } from "@/components/admin/StageBadge";
import { StageLegend } from "@/components/admin/StageLegend";
import { PaymentMode } from "@/lib/validation/payment-advice";
import { formatIstDate } from "@/lib/date-time";
import { buildTabCondition, isAdminTab } from "@/lib/admin/filters";
import { PIPELINE_SUMMARY_STAGES, PipelineSummary } from "@/components/admin/PipelineSummary";
import { StageAgingIndicator } from "@/components/admin/StageAgingIndicator";
import { compareByCurrentStageAge } from "@/lib/advice/stage-aging";
import { DgExecutiveDashboard } from "@/components/admin/DgExecutiveDashboard";
import { buildDgSummaryMetrics, calculateDgIntervalMetrics } from "@/lib/advice/dg-dashboard";
import { submissionPdfHref } from "@/lib/advice/submission-pdf";

export const dynamic = "force-dynamic";

type AuthorityView = "pending" | "history" | "my-submissions";
type TeamView = "team-submissions" | "my-submissions";
type DashboardRole = "AUTHORITY" | "BRANCH" | "DEPARTMENT";
type DashboardGrant = { role: DashboardRole; recommendingAuthorityId: string | null; scopeValue: string | null };

function date(value: Date | string) { return formatIstDate(value); }
function caseInsensitiveEq(column: typeof paymentAdvices.branch | typeof paymentAdvices.submittedByDepartment, value: string) {
  return sql`lower(${column}) = lower(${value})`;
}
function isDashboardRole(value: string | undefined): value is DashboardRole {
  return value === "AUTHORITY" || value === "BRANCH" || value === "DEPARTMENT";
}
function roleLabel(grant: DashboardGrant): string {
  return grant.role === "AUTHORITY" ? "Recommendations" : `${grant.role === "BRANCH" ? "Branch" : "Department"}: ${grant.scopeValue}`;
}

export default async function TeamDashboard({ searchParams }: { searchParams: Promise<{ view?: string; role?: string; stage?: string }> }) {
  const session = await getAdminSession();
  if (!session) return null;
  const [accounts, roleRows, authorityRows] = await Promise.all([
    db.select({ email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.id, session.adminUserId)).limit(1),
    db.select({ role: adminUserRoles.role, recommendingAuthorityId: adminUserRoles.recommendingAuthorityId, scopeValue: adminUserRoles.scopeValue })
      .from(adminUserRoles).where(eq(adminUserRoles.adminUserId, session.adminUserId)),
    session.recommendingAuthorityId
      ? db.select({ authorityName: recommendingAuthorities.authorityName }).from(recommendingAuthorities)
          .where(eq(recommendingAuthorities.id, session.recommendingAuthorityId)).limit(1)
      : Promise.resolve([]),
  ]);
  const account = accounts[0];
  if (!account) return null;
  const grants = roleRows.filter((row): row is DashboardGrant =>
    (row.role === "AUTHORITY" && Boolean(row.recommendingAuthorityId)) ||
    ((row.role === "BRANCH" || row.role === "DEPARTMENT") && Boolean(row.scopeValue)),
  );
  if (grants.length === 0) return null;

  const params = await searchParams;
  const requestedRole = isDashboardRole(params.role) ? params.role : undefined;
  const activeGrant = grants.find((grant) => grant.role === requestedRole) ?? grants[0];
  const isAuthority = activeGrant.role === "AUTHORITY";
  const isDg = isAuthority && authorityRows[0]?.authorityName.trim().toUpperCase() === "DG";
  if (isDg && (!params.view || params.view === "executive")) return loadDgExecutiveDashboard();
  const authorityView: AuthorityView = params.view === "history" ? "history" : params.view === "my-submissions" ? "my-submissions" : "pending";
  const teamView: TeamView = params.view === "my-submissions" ? "my-submissions" : "team-submissions";
  const view = isAuthority ? authorityView : teamView;

  const ownSubmissions = eq(paymentAdvices.submittedByEmail, account.email);
  const authorityScope = eq(paymentAdvices.recommendingAuthorityId, activeGrant.recommendingAuthorityId!);
  const teamScope = activeGrant.role === "BRANCH"
    ? caseInsensitiveEq(paymentAdvices.branch, activeGrant.scopeValue!)
    : activeGrant.role === "DEPARTMENT"
      ? caseInsensitiveEq(paymentAdvices.submittedByDepartment, activeGrant.scopeValue!)
      : authorityScope;
  const scopeWhere = view === "my-submissions" ? ownSubmissions : isAuthority
    ? and(authorityScope, view === "history"
      ? or(isNotNull(paymentAdvices.authorityApprovedAt), isNotNull(paymentAdvices.authorityRejectedAt))
      : and(eq(paymentAdvices.status, "SUBMITTED"), isNull(paymentAdvices.authorityApprovedAt), isNull(paymentAdvices.authorityRejectedAt)))
    : teamScope;
  const requestedStage = isAdminTab(params.stage) && params.stage !== "all" ? params.stage : undefined;
  const showSummary = view === "my-submissions" || !isAuthority;
  const summaryScope = view === "my-submissions" ? ownSubmissions : teamScope;
  const where = requestedStage && showSummary ? and(scopeWhere, buildTabCondition(requestedStage)) : scopeWhere;

  const [rawRows, summaryRows] = await Promise.all([
    db.select({
    id: paymentAdvices.id, serialNo: paymentAdvices.serialNo, cashVoucherNo: paymentAdvices.cashVoucherNo,
    advanceNo: paymentAdvices.advanceNo, isAdvance: paymentAdvices.isAdvance, paymentMode: paymentAdvices.paymentMode,
    payeeName: paymentAdvices.payeeName, amount: paymentAdvices.amount, nature: paymentAdvices.natureOfExpenditure,
    submittedBy: paymentAdvices.submittedByName, submittedAt: paymentAdvices.submittedAt, status: paymentAdvices.status,
    approvedAt: paymentAdvices.authorityApprovedAt, rejectedAt: paymentAdvices.authorityRejectedAt,
    authorityRemarks: paymentAdvices.authorityRemarks, adminRemarks: paymentAdvices.adminRemarks,
    financeReceivedAt: paymentAdvices.financeReceivedAt, verifiedAt: paymentAdvices.verifiedAt,
    paymentDoneAt: paymentAdvices.paymentDoneAt, totalPaid: paymentAdvices.totalPaid, revisionCount: paymentAdvices.revisionCount,
    updatedAt: paymentAdvices.updatedAt, sentBackAt: paymentAdvices.sentBackAt,
  }).from(paymentAdvices).where(where).orderBy(desc(paymentAdvices.submittedAt)),
    showSummary ? Promise.all(PIPELINE_SUMMARY_STAGES.map(async ({ tab }) => {
      const [result] = await db.select({ count: count(), sum: sum(paymentAdvices.amount) })
        .from(paymentAdvices)
        .where(and(summaryScope, buildTabCondition(tab)));
      return { tab, count: result?.count ?? 0, sum: Number(result?.sum ?? 0) };
    })) : Promise.resolve([]),
  ]);

  const firstPaymentByAdvice = new Map<string, Date>();
  if (rawRows.length > 0) {
    const entries = await db.select({ adviceId: paymentEntries.paymentAdviceId, paidAt: paymentEntries.paidAt })
      .from(paymentEntries)
      .where(inArray(paymentEntries.paymentAdviceId, rawRows.map((row) => row.id)));
    for (const entry of entries) {
      const existing = firstPaymentByAdvice.get(entry.adviceId);
      if (!existing || entry.paidAt < existing) firstPaymentByAdvice.set(entry.adviceId, entry.paidAt);
    }
  }
  const rows = rawRows.map((row) => ({ ...row, firstPaymentAt: firstPaymentByAdvice.get(row.id) ?? null }));
  if (!(isAuthority && view === "history")) {
    rows.sort(compareByCurrentStageAge);
  }

  const subtitle = isAuthority
    ? view === "history" ? "Your previous recommendation decisions"
      : view === "my-submissions" ? `${rows.length} submission${rows.length === 1 ? "" : "s"} made using ${account.email}`
      : `${rows.length} submission${rows.length === 1 ? "" : "s"} waiting for you`
    : view === "my-submissions" ? `${rows.length} submission${rows.length === 1 ? "" : "s"} made using ${account.email}`
      : `${rows.length} submission${rows.length === 1 ? "" : "s"} in ${activeGrant.scopeValue}`;

  return <div className="flex flex-col gap-6">
    <header><h1 className="font-heading text-3xl text-[#0b1f3a]">{isAuthority ? "Authority Recommendations" : "Team Submissions"}</h1><p className="mt-1 text-sm text-gray-600">{subtitle}</p></header>
    {grants.length > 1 ? <nav aria-label="Dashboard role" className="flex flex-wrap gap-2 rounded-lg bg-gray-100 p-1.5">
      {grants.map((grant) => <Link key={grant.role} href={`/authority?role=${grant.role}`} className={`rounded-md px-3 py-2 text-sm font-medium ${grant.role === activeGrant.role ? "bg-white text-[#0b1f3a] shadow-sm" : "text-gray-600 hover:text-[#0b1f3a]"}`}>{roleLabel(grant)}</Link>)}
    </nav> : null}
    <nav className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-0">
      {isAuthority ? <>
        <Tab href={`/authority?role=AUTHORITY${isDg ? "&view=pending" : ""}`} active={view === "pending"}>Pending My Recommendation</Tab>
        <Tab href="/authority?role=AUTHORITY&view=history" active={view === "history"}>History</Tab>
        <Tab href="/authority?role=AUTHORITY&view=my-submissions" active={view === "my-submissions"}>My Submissions</Tab>
      </> : <>
        <Tab href={`/authority?role=${activeGrant.role}`} active={view === "team-submissions"}>Team Submissions</Tab>
        <Tab href={`/authority?role=${activeGrant.role}&view=my-submissions`} active={view === "my-submissions"}>My Submissions</Tab>
      </>}
      <div className="ml-auto mb-1.5"><StageLegend /></div>
    </nav>
    {showSummary ? <PipelineSummary
      metrics={summaryRows}
      hrefFor={(tab) => `/authority?role=${activeGrant.role}&view=${view}&stage=${tab}`}
    /> : null}
    {rows.length === 0 ? <div className="rounded-lg border border-gray-200 p-10 text-center text-sm text-gray-500">
      {isAuthority && view === "history" ? "No decisions recorded yet." : view === "my-submissions" ? "No submissions found for your login email." : isAuthority ? "Nothing is waiting for your recommendation." : "No submissions found for this team scope."}
    </div> : <div className="overflow-x-auto rounded-lg border border-gray-200"><table className="w-full text-left text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Reference</th><th className="p-3">Payee / Particulars</th><th className="p-3">Amount</th><th className="p-3">Submitted</th><th className="p-3">{isAuthority && view === "history" ? "Decision" : isAuthority && view === "pending" ? "Action" : "Current Stage"}</th>{view === "my-submissions" ? <th className="p-3">Download</th> : null}{isAuthority && view === "history" ? <th className="p-3">Action</th> : null}</tr></thead>
      <tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.id} className="align-top">
        <td className="p-3 font-medium text-[#0b1f3a]">{displayNoFor(row.paymentMode as PaymentMode, row.serialNo, row.cashVoucherNo, row.isAdvance, row.advanceNo)}</td>
        <td className="p-3"><div className="font-medium">{row.payeeName}</div><div className="mt-1 max-w-xs text-xs text-gray-600">{row.nature}</div>{isAuthority && view === "pending" && row.revisionCount >= 1 ? <div className="mt-2 max-w-sm rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"><strong>Resubmission — revision {row.revisionCount}</strong>{row.adminRemarks ? <div className="mt-1">Previous remarks: {row.adminRemarks}</div> : null}</div> : null}</td>
        <td className="p-3 whitespace-nowrap">₹ {Number(row.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        <td className="p-3 whitespace-nowrap">{view !== "my-submissions" ? <div>{row.submittedBy}</div> : null}<div className="text-xs text-gray-500">{date(row.submittedAt)}</div></td>
        <td className="p-3">{isAuthority && view === "pending" ? <div className="flex flex-col items-start gap-2"><StageBadge stage="Waiting on Authority" /><StageAgingIndicator advice={row} /><ViewLink adviceId={row.id} from="pending" /></div> : isAuthority && view === "history" ? <div className="text-xs"><StageBadge stage={row.approvedAt ? "Awaiting Finance Review" : "Sent Back"} /><div className="mt-1 text-gray-500">{date(row.approvedAt ?? row.rejectedAt!)}</div>{row.authorityRemarks ? <div className="mt-1 max-w-xs text-gray-600">{row.authorityRemarks}</div> : null}</div> : <div className="text-xs"><StageBadge stage={pipelineStageFor(row)} /><div><StageAgingIndicator advice={row} /></div>{row.adminRemarks ? <div className="mt-2 max-w-xs rounded bg-amber-50 px-2 py-1 text-amber-800">Sent-back remarks: {row.adminRemarks}</div> : null}</div>}</td>
        {view === "my-submissions" ? <td className="p-3"><a href={submissionPdfHref(row)} download className="inline-flex whitespace-nowrap rounded-md border border-[#0b1f3a] px-3 py-2 text-xs font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5">Download PDF</a></td> : null}
        {isAuthority && view === "history" ? <td className="p-3"><ViewLink adviceId={row.id} from="history" /></td> : null}
      </tr>)}</tbody>
    </table></div>}
  </div>;
}

async function loadDgExecutiveDashboard() {
  const [stageRows, adviceRows, entryRows] = await Promise.all([
    Promise.all(PIPELINE_SUMMARY_STAGES.map(async ({ tab }) => {
      const [result] = await db.select({ count: count(), sum: sum(paymentAdvices.amount) })
        .from(paymentAdvices).where(buildTabCondition(tab));
      return { tab, count: result?.count ?? 0, sum: Number(result?.sum ?? 0) };
    })),
    db.select({
      id: paymentAdvices.id,
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      advanceNo: paymentAdvices.advanceNo,
      isAdvance: paymentAdvices.isAdvance,
      paymentMode: paymentAdvices.paymentMode,
      status: paymentAdvices.status,
      submittedAt: paymentAdvices.submittedAt,
      authorityApprovedAt: paymentAdvices.authorityApprovedAt,
      financeReceivedAt: paymentAdvices.financeReceivedAt,
      paymentDoneAt: paymentAdvices.paymentDoneAt,
    }).from(paymentAdvices),
    db.select({ adviceId: paymentEntries.paymentAdviceId, paidAt: paymentEntries.paidAt }).from(paymentEntries),
  ]);

  const summaryRows = buildDgSummaryMetrics(stageRows);

  const firstPaymentByAdvice = new Map<string, Date>();
  for (const entry of entryRows) {
    const existing = firstPaymentByAdvice.get(entry.adviceId);
    if (!existing || entry.paidAt < existing) firstPaymentByAdvice.set(entry.adviceId, entry.paidAt);
  }
  const intervalRows = adviceRows.map((row) => ({
    id: row.id,
    reference: displayNoFor(row.paymentMode as PaymentMode, row.serialNo, row.cashVoucherNo, row.isAdvance, row.advanceNo),
    status: row.status,
    submittedAt: row.submittedAt,
    authorityApprovedAt: row.authorityApprovedAt,
    financeReceivedAt: row.financeReceivedAt,
    paymentDoneAt: row.paymentDoneAt,
    firstPaymentAt: firstPaymentByAdvice.get(row.id) ?? null,
  }));
  return <DgExecutiveDashboard metrics={summaryRows} intervals={calculateDgIntervalMetrics(intervalRows)} />;
}

function ViewLink({ adviceId, from }: { adviceId: string; from: "pending" | "history" }) {
  return <Link href={`/authority/advice/${adviceId}?from=${from}`} className="inline-flex rounded-md bg-[#0b1f3a] px-3 py-2 text-xs font-medium text-white hover:bg-[#0b1f3a]/90">View</Link>;
}
function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`px-4 py-2 text-sm font-medium ${active ? "border-b-2 border-[#0b1f3a] text-[#0b1f3a]" : "text-gray-500"}`}>{children}</Link>;
}
