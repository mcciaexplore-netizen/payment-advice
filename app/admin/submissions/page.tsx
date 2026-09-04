import Link from "next/link";
import { Fragment } from "react";
import { and, count, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";
import { StatusChip } from "@/components/admin/StatusChip";
import {
  ADMIN_LIST_PAGE_SIZE,
  AdminTab,
  buildAdviceWhere,
  buildAdminListOrderBy,
  buildTabCondition,
  isAdminTab,
  parseAdviceFilterParams,
  searchParamsRecordToURLSearchParams,
  SortColumn,
} from "@/lib/admin/filters";
import { PaymentMode, Status } from "@/lib/validation/payment-advice";
import { getAdminSession } from "@/lib/admin-session";
import { displayNoFor, submissionTypeLabelFor } from "@/lib/advice/document-identity";
import { defaultPaymentModeForRoles } from "@/lib/admin/role-scope";
import { SentBackIndicators } from "@/components/admin/SentBackIndicators";
import { sentBackStatus } from "@/lib/advice/send-back-status";
import { formatDateOnly } from "@/lib/date-time";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

function formatAmount(value: string) {
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function queryString(base: SearchParamsRecord, updates: Record<string, string | undefined>) {
  const params = searchParamsRecordToURLSearchParams(base);
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") params.delete(key);
    else params.set(key, value);
  }
  return `?${params.toString()}`;
}

function SortHeader({
  label,
  column,
  searchParams,
  currentSort,
  currentDir,
}: {
  label: string;
  column: SortColumn;
  searchParams: SearchParamsRecord;
  currentSort?: string;
  currentDir?: string;
}) {
  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === "desc" ? "asc" : "desc";
  return (
    <Link
      href={queryString(searchParams, { sort: column, dir: nextDir, page: undefined })}
      className="flex items-center gap-1 hover:text-[#0b1f3a]"
    >
      {label}
      {isActive ? <span>{currentDir === "asc" ? "▲" : "▼"}</span> : null}
    </Link>
  );
}

export default async function AdminListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const sp = await searchParams;
  const session = await getAdminSession();

  const filterParams = parseAdviceFilterParams(searchParamsRecordToURLSearchParams(sp));
  // Default filter, not an authorization wall: only applied when the URL
  // never mentioned paymentMode at all (a fresh landing) — an explicit
  // "All" selection submits paymentMode="" and is left alone. Any signed-in
  // user can still change or clear this filter; nothing is backend-blocked.
  if (sp.paymentMode === undefined && session) {
    filterParams.paymentMode = defaultPaymentModeForRoles(session.roles);
  }

  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: AdminTab = isAdminTab(tabParam) ? tabParam : "waiting_authority";
  const baseWhere = buildAdviceWhere(filterParams);
  const where = and(baseWhere, buildTabCondition(tab));
  const sort = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const dir = Array.isArray(sp.dir) ? sp.dir[0] : sp.dir;
  const orderBy = buildAdminListOrderBy(tab, sort, dir);

  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Math.max(1, Number(pageParam) || 1);

  const [
    rows,
    totalsRow,
    waitingCount,
    awaitingFinanceCount,
    advancePaymentCount,
    receivedCount,
    verifiedCount,
    partialPaymentDoneCount,
    fullyPaymentSettledCount,
    paymentDoneCount,
    sentBackCount,
  ] = await Promise.all([
    db
      .select({
        id: paymentAdvices.id,
        serialNo: paymentAdvices.serialNo,
        cashVoucherNo: paymentAdvices.cashVoucherNo,
        isAdvance: paymentAdvices.isAdvance,
        advanceNo: paymentAdvices.advanceNo,
        formDate: paymentAdvices.formDate,
        payeeName: paymentAdvices.payeeName,
        amount: paymentAdvices.amount,
        paymentMode: paymentAdvices.paymentMode,
        submittedByName: paymentAdvices.submittedByName,
        submittedByDepartment: paymentAdvices.submittedByDepartment,
        status: paymentAdvices.status,
        adminRemarks: paymentAdvices.adminRemarks,
        sentBackAt: paymentAdvices.sentBackAt,
        editTokenExpiresAt: paymentAdvices.editTokenExpiresAt,
      })
      .from(paymentAdvices)
      .where(where)
      .orderBy(...orderBy)
      .limit(ADMIN_LIST_PAGE_SIZE)
      .offset((page - 1) * ADMIN_LIST_PAGE_SIZE),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(where),
    // Also selects sum() (not just count()) so these same 6 queries can
    // back both the tab badges (count only) and, for the ALL-role
    // dashboard, the summary cards (count + total amount) — one set of
    // queries, two UI uses, always in sync with each other.
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("waiting_authority"))),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("awaiting_finance"))),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("advance_payment"))),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("received_in_process"))),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("verified_ready_payment"))),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("partial_payment_done"))),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("fully_payment_settled"))),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("payment_done"))),
    db
      .select({ count: count(), sum: sum(paymentAdvices.amount) })
      .from(paymentAdvices)
      .where(and(baseWhere, buildTabCondition("sent_back"))),
  ]);

  const totalCount = totalsRow[0]?.count ?? 0;
  const totalAmount = Number(totalsRow[0]?.sum ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_LIST_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl text-[#0b1f3a]">Submissions</h1>
          <p className="mt-1 text-sm text-gray-600">
            {totalCount} matching · ₹ {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} total
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href={`/api/admin/export?${searchParamsRecordToURLSearchParams(sp).toString()}`}
            className="rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
          >
            Export to Excel
          </a>
          <Link
            href="/admin/vendors/new"
            className="rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
          >
            New Vendor
          </Link>
          <Link
            href="/admin/staff"
            className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
          >
            Manage Staff &amp; Authorities
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabLink
          label="Waiting on Authority"
          tab="waiting_authority"
          activeTab={tab}
          count={waitingCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink
          label="Awaiting Finance Review"
          tab="awaiting_finance"
          activeTab={tab}
          count={awaitingFinanceCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink
          label="Advance Payment"
          tab="advance_payment"
          activeTab={tab}
          count={advancePaymentCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink
          label="Received & In Process"
          tab="received_in_process"
          activeTab={tab}
          count={receivedCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink
          label="Verified — Ready for Payment"
          tab="verified_ready_payment"
          activeTab={tab}
          count={verifiedCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink
          label="Partial Payment Done"
          tab="partial_payment_done"
          activeTab={tab}
          count={partialPaymentDoneCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink
          label="Fully Payment Settled"
          tab="fully_payment_settled"
          activeTab={tab}
          count={fullyPaymentSettledCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink
          label="Payment Done (Cash)"
          tab="payment_done"
          activeTab={tab}
          count={paymentDoneCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink
          label="Sent Back"
          tab="sent_back"
          activeTab={tab}
          count={sentBackCount[0]?.count ?? 0}
          searchParams={sp}
        />
        <TabLink label="All" tab="all" activeTab={tab} count={null} searchParams={sp} />
      </div>

      <form
        method="get"
        className="grid grid-cols-2 gap-4 rounded-md border border-gray-200 p-4 sm:grid-cols-4 lg:grid-cols-7"
      >
        <input type="hidden" name="tab" value={tab} />
        {tab === "all" ? (
          <FilterField label="Status">
            <select name="status" defaultValue={filterParams.status ?? ""} className="admin-filter-input">
              <option value="">All</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="SENT_BACK">Sent Back</option>
              <option value="APPROVED">Approved</option>
            </select>
          </FilterField>
        ) : null}
        <FilterField label="From (Form Date)">
          <input type="date" name="dateFrom" defaultValue={filterParams.dateFrom ?? ""} className="admin-filter-input" />
        </FilterField>
        <FilterField label="To (Form Date)">
          <input type="date" name="dateTo" defaultValue={filterParams.dateTo ?? ""} className="admin-filter-input" />
        </FilterField>
        <FilterField label="Payee">
          <input type="text" name="payee" defaultValue={filterParams.payee ?? ""} className="admin-filter-input" />
        </FilterField>
        <FilterField label="Department">
          <input type="text" name="department" defaultValue={filterParams.department ?? ""} className="admin-filter-input" />
        </FilterField>
        <FilterField label="Payment Mode">
          <select name="paymentMode" defaultValue={filterParams.paymentMode ?? ""} className="admin-filter-input">
            <option value="">All</option>
            <option value="NEFT">NEFT</option>
            <option value="CASH">Cash</option>
          </select>
        </FilterField>
        <FilterField label="Search (serial / bill / payee)">
          <input type="text" name="q" defaultValue={filterParams.q ?? ""} className="admin-filter-input" />
        </FilterField>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-7">
          <button
            type="submit"
            className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
          >
            Apply filters
          </button>
          <Link href="/admin/submissions" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Clear
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3"><SortHeader label="Reference No." column="serialNo" searchParams={sp} currentSort={sort} currentDir={dir} /></th>
              <th className="px-4 py-3"><SortHeader label="Form Date" column="formDate" searchParams={sp} currentSort={sort} currentDir={dir} /></th>
              <th className="px-4 py-3"><SortHeader label="Payee" column="payeeName" searchParams={sp} currentSort={sort} currentDir={dir} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Amount" column="amount" searchParams={sp} currentSort={sort} currentDir={dir} /></th>
              <th className="px-4 py-3"><SortHeader label="Mode" column="paymentMode" searchParams={sp} currentSort={sort} currentDir={dir} /></th>
              <th className="px-4 py-3"><SortHeader label="Submitted By" column="submittedByName" searchParams={sp} currentSort={sort} currentDir={dir} /></th>
              <th className="px-4 py-3"><SortHeader label="Department" column="submittedByDepartment" searchParams={sp} currentSort={sort} currentDir={dir} /></th>
              <th className="px-4 py-3"><SortHeader label="Status" column="status" searchParams={sp} currentSort={sort} currentDir={dir} /></th>
              {tab === "sent_back" ? <th className="px-4 py-3">Remarks</th> : null}
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={tab === "sent_back" ? 10 : 9} className="px-4 py-8 text-center text-gray-500">
                  No submissions match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const sendBack = sentBackStatus(row.sentBackAt, row.editTokenExpiresAt);
                const typeLabel = submissionTypeLabelFor(row.paymentMode as PaymentMode, row.isAdvance);
                const previousRow = rows[index - 1];
                const previousTypeLabel = previousRow
                  ? submissionTypeLabelFor(previousRow.paymentMode as PaymentMode, previousRow.isAdvance)
                  : null;
                return (
                <Fragment key={row.id}>
                {typeLabel !== previousTypeLabel ? (
                  <tr className="border-y border-gray-200 bg-[#0b1f3a]/5">
                    <td colSpan={tab === "sent_back" ? 10 : 9} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#0b1f3a]">
                      {typeLabel}
                    </td>
                  </tr>
                ) : null}
                <tr className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${tab === "sent_back" && sendBack?.isExpired ? "bg-red-50/70" : tab === "sent_back" && sendBack?.isStale ? "bg-amber-50/70" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-[#0b1f3a]">
                    <div>{displayNoFor(
                        row.paymentMode as PaymentMode,
                        row.serialNo,
                        row.cashVoucherNo,
                        row.isAdvance,
                        row.advanceNo,
                      )}</div>
                    <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-normal text-gray-600">
                      {typeLabel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateOnly(row.formDate)}</td>
                  <td className="px-4 py-3">{row.payeeName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">₹ {formatAmount(row.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.paymentMode}
                    {row.isAdvance ? " (Advance)" : ""}
                  </td>
                  <td className="px-4 py-3">{row.submittedByName}</td>
                  <td className="px-4 py-3">{row.submittedByDepartment}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-2">
                      <StatusChip status={row.status as Status} />
                      {tab === "sent_back" ? <SentBackIndicators sentBackAt={row.sentBackAt} editTokenExpiresAt={row.editTokenExpiresAt} /> : null}
                    </div>
                  </td>
                  {tab === "sent_back" ? (
                    <td className="max-w-[240px] truncate px-4 py-3" title={row.adminRemarks ?? ""}>
                      {row.adminRemarks ?? "—"}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/admin/advice/${row.id}`} className="font-medium text-[#0b1f3a] hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Link
            aria-disabled={page <= 1}
            href={queryString(sp, { page: String(Math.max(1, page - 1)) })}
            className={`rounded-md border border-gray-300 px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-gray-50"}`}
          >
            Previous
          </Link>
          <Link
            aria-disabled={page >= totalPages}
            href={queryString(sp, { page: String(Math.min(totalPages, page + 1)) })}
            className={`rounded-md border border-gray-300 px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-gray-50"}`}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
      {label}
      {children}
    </label>
  );
}

function TabLink({
  label,
  tab,
  activeTab,
  count,
  searchParams,
}: {
  label: string;
  tab: AdminTab;
  activeTab: AdminTab;
  count: number | null;
  searchParams: SearchParamsRecord;
}) {
  const isActive = tab === activeTab;
  return (
    <Link
      href={queryString(searchParams, { tab, page: undefined })}
      className={`rounded-md border px-4 py-2 text-sm font-medium ${
        isActive
          ? "border-[#0b1f3a] bg-[#0b1f3a] text-white"
          : "border-gray-300 bg-white text-gray-600 hover:border-[#0b1f3a] hover:text-[#0b1f3a]"
      }`}
    >
      {label}
      {count !== null ? ` (${count})` : ""}
    </Link>
  );
}
