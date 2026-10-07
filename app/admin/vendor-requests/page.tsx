import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { VendorRequestAction } from "@/components/admin/VendorRequestAction";
import { VendorReviewAction } from "@/components/admin/VendorReviewAction";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentAdvices, vendorRequests, vendors } from "@/lib/db/schema";
import { formatDateOnly, formatIstDateTime } from "@/lib/date-time";
import { findPossibleDuplicateVendors } from "@/lib/advice/vendor-requests";

export const dynamic = "force-dynamic";

const MSME_STATUS_LABELS: Record<string, string> = {
  MICRO: "Micro",
  SMALL: "Small",
  MEDIUM: "Medium",
  NOT_REGISTERED: "Not Registered",
  UNKNOWN: "Not Sure",
};

function money(value: string): string {
  return `₹ ${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function stateOf(request: { approvedAt: Date | null; sentBackAt: Date | null }): "Approved" | "Sent Back" | "Pending" {
  if (request.approvedAt) return "Approved";
  if (request.sentBackAt) return "Sent Back";
  return "Pending";
}

type Tab = "requests" | "review";

export default async function VendorRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getAdminSession();
  if (!hasFinanceRole(session)) return null;

  const sp = await searchParams;
  const activeTab: Tab = sp.tab === "review" ? "review" : "requests";

  const [requestRows, activeVendors, reviewRows] = await Promise.all([
    db
      .select({
        id: vendorRequests.id,
        requestedName: vendorRequests.requestedName,
        requestedAddress: vendorRequests.requestedAddress,
        requestedGstin: vendorRequests.requestedGstin,
        requestedVendorEmail: vendorRequests.requestedVendorEmail,
        msmeStatus: vendorRequests.msmeStatus,
        msmeDocumentUrl: vendorRequests.msmeDocumentUrl,
        msmeEmailSentAt: vendorRequests.msmeEmailSentAt,
        requestedByName: vendorRequests.requestedByName,
        requestedByEmail: vendorRequests.requestedByEmail,
        approvedAt: vendorRequests.approvedAt,
        sentBackAt: vendorRequests.sentBackAt,
        sentBackRemarks: vendorRequests.sentBackRemarks,
        createdAt: vendorRequests.createdAt,
        paymentAdviceId: vendorRequests.paymentAdviceId,
        paSerialNo: paymentAdvices.serialNo,
        paPendingVendorRequestId: paymentAdvices.pendingVendorRequestId,
      })
      .from(vendorRequests)
      .leftJoin(paymentAdvices, eq(paymentAdvices.id, vendorRequests.paymentAdviceId))
      .orderBy(desc(vendorRequests.createdAt)),
    db.select({ id: vendors.id, companyName: vendors.companyName }).from(vendors).where(eq(vendors.isActive, true)),
    db
      .select({
        id: paymentAdvices.id,
        serialNo: paymentAdvices.serialNo,
        payeeName: paymentAdvices.payeeName,
        payeeAddress: paymentAdvices.payeeAddress,
        amount: paymentAdvices.amount,
        formDate: paymentAdvices.formDate,
        submittedAt: paymentAdvices.submittedAt,
      })
      .from(paymentAdvices)
      .where(
        and(
          eq(paymentAdvices.paymentMode, "NEFT"),
          eq(paymentAdvices.isAdvance, false),
          isNull(paymentAdvices.vendorId),
        ),
      )
      .orderBy(asc(paymentAdvices.submittedAt), asc(paymentAdvices.serialNo)),
  ]);

  const pendingCount = requestRows.filter((r) => stateOf(r) === "Pending").length;
  const msmeFollowUpCount = requestRows.filter((r) => stateOf(r) === "Pending" && !r.msmeDocumentUrl).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Vendor Addition Requests</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          New vendor requests from submitters, and historical Payment Advice payees still waiting
          on a canonical vendor link.
        </p>
      </header>

      <div className="flex gap-1 border-b border-gray-200" role="tablist" aria-label="Vendor Addition Requests tabs">
        <TabLink href="/admin/vendor-requests" active={activeTab === "requests"}>
          New Requests{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </TabLink>
        <TabLink href="/admin/vendor-requests?tab=review" active={activeTab === "review"}>
          Historical Review{reviewRows.length > 0 ? ` (${reviewRows.length})` : ""}
        </TabLink>
      </div>

      {activeTab === "requests" ? (
        <NewRequestsTab
          rows={requestRows}
          activeVendors={activeVendors}
          pendingCount={pendingCount}
          msmeFollowUpCount={msmeFollowUpCount}
        />
      ) : (
        <HistoricalReviewTab rows={reviewRows} />
      )}
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-[#0b1f3a] text-[#0b1f3a]"
          : "border-transparent text-gray-500 hover:text-[#0b1f3a]"
      }`}
    >
      {children}
    </Link>
  );
}

type RequestRow = {
  id: string;
  requestedName: string;
  requestedAddress: string;
  requestedGstin: string | null;
  requestedVendorEmail: string;
  msmeStatus: string | null;
  msmeDocumentUrl: string | null;
  msmeEmailSentAt: Date | null;
  requestedByName: string;
  requestedByEmail: string;
  approvedAt: Date | null;
  sentBackAt: Date | null;
  sentBackRemarks: string | null;
  createdAt: Date;
  paymentAdviceId: string;
  paSerialNo: string | null;
  paPendingVendorRequestId: string | null;
};

function NewRequestsTab({
  rows,
  activeVendors,
  pendingCount,
  msmeFollowUpCount,
}: {
  rows: RequestRow[];
  activeVendors: { id: string; companyName: string }[];
  pendingCount: number;
  msmeFollowUpCount: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-medium">{pendingCount} pending</span> vendor addition request{pendingCount === 1 ? "" : "s"}.
        </div>
        {msmeFollowUpCount > 0 ? (
          <div className="rounded-md border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-950">
            <span className="font-medium">{msmeFollowUpCount}</span> pending request{msmeFollowUpCount === 1 ? "" : "s"} still need MSME follow-up - no document on file yet.
          </div>
        ) : null}
      </div>

      {rows.length ? (
        <div className="flex flex-col gap-5">
          {rows.map((row) => {
            const state = stateOf(row);
            const detached = row.paPendingVendorRequestId !== row.id && state === "Pending";
            const duplicates = state === "Pending"
              ? findPossibleDuplicateVendors(row.requestedName, activeVendors)
              : [];
            return (
              <article key={row.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-heading text-xl text-[#0b1f3a]">{row.requestedName}</p>
                      <StateBadge state={state} />
                      {state === "Pending" && !row.msmeDocumentUrl ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                          MSME follow-up needed
                        </span>
                      ) : null}
                      {detached ? (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                          No longer linked to its PA
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{row.requestedAddress}</p>
                    <p className="mt-1 text-xs text-gray-500">Vendor email: {row.requestedVendorEmail}</p>
                    {row.requestedGstin ? (
                      <p className="mt-1 text-xs text-gray-500">GSTIN: {row.requestedGstin}</p>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:text-right">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-500">MSME Status</dt>
                      <dd className="font-medium text-[#0b1f3a]">
                        {MSME_STATUS_LABELS[row.msmeStatus ?? "UNKNOWN"] ?? "Not Sure"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Payment Advice</dt>
                      <dd>
                        {row.paSerialNo ? (
                          <Link href={`/admin/advice/${row.paymentAdviceId}`} className="font-medium text-[#0b1f3a] hover:underline">
                            {row.paSerialNo}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Requested by</dt>
                      <dd className="text-gray-700">{row.requestedByName} ({row.requestedByEmail})</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-gray-500">Requested</dt>
                      <dd className="text-gray-700">{formatIstDateTime(row.createdAt)}</dd>
                    </div>
                  </dl>
                </div>

                {row.msmeDocumentUrl ? (
                  <a
                    href={`/api/admin/vendor-requests/${row.id}/msme-document`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm font-medium text-[#0b1f3a] underline hover:no-underline"
                  >
                    View MSME document
                  </a>
                ) : null}

                {row.msmeEmailSentAt ? (
                  <p className="mt-2 text-sm text-gray-600">
                    MSME request emailed to vendor on {formatIstDateTime(row.msmeEmailSentAt)}.
                  </p>
                ) : null}

                {state === "Sent Back" && row.sentBackRemarks ? (
                  <p className="mt-3 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                    <span className="font-medium">Sent back:</span> {row.sentBackRemarks}
                  </p>
                ) : null}

                {state === "Pending" && !detached ? (
                  <VendorRequestAction
                    requestId={row.id}
                    currentName={row.requestedName}
                    currentAddress={row.requestedAddress}
                    currentGstin={row.requestedGstin}
                    hasMsmeDocument={!!row.msmeDocumentUrl}
                    duplicates={duplicates.map((d) => ({ companyName: d.vendor.companyName, score: d.score }))}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="font-medium text-[#0b1f3a]">No vendor addition requests yet.</p>
        </div>
      )}
    </div>
  );
}

type ReviewRow = {
  id: string;
  serialNo: string;
  payeeName: string;
  payeeAddress: string;
  amount: string;
  formDate: string;
  submittedAt: Date;
};

function HistoricalReviewTab({ rows }: { rows: ReviewRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span className="font-medium">{rows.length} submission{rows.length === 1 ? "" : "s"}</span>
        {" "}currently need vendor review. Every resolution is attributed to your login and written
        to the submission&apos;s audit trail.
      </div>

      {rows.length ? (
        <div className="flex flex-col gap-5">
          {rows.map((row) => (
            <article key={row.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <Link
                    href={`/admin/advice/${row.id}`}
                    className="font-heading text-xl text-[#0b1f3a] hover:underline"
                  >
                    {row.serialNo}
                  </Link>
                  <p className="mt-2 font-medium text-[#0b1f3a]">{row.payeeName}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{row.payeeAddress}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:text-right">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Amount</dt>
                    <dd className="font-medium text-[#0b1f3a]">{money(row.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Form date</dt>
                    <dd className="font-medium text-[#0b1f3a]">{formatDateOnly(row.formDate)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-gray-500">Submitted</dt>
                    <dd className="text-gray-700">{formatIstDateTime(row.submittedAt)}</dd>
                  </div>
                </dl>
              </div>
              <VendorReviewAction
                adviceId={row.id}
                currentPayeeName={row.payeeName}
                currentPayeeAddress={row.payeeAddress}
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="font-medium text-[#0b1f3a]">No submissions need vendor review.</p>
          <p className="mt-1 text-sm text-gray-500">Every regular Payment Advice is linked.</p>
        </div>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: "Pending" | "Approved" | "Sent Back" }) {
  const styles =
    state === "Approved"
      ? "bg-[#1e5c39]/10 text-[#1e5c39]"
      : state === "Sent Back"
        ? "bg-[#b3261e]/10 text-[#b3261e]"
        : "bg-amber-100 text-amber-900";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{state}</span>;
}
