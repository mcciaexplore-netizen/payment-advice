import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { VendorRequestAction } from "@/components/admin/VendorRequestAction";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentAdvices, vendorRequests, vendors } from "@/lib/db/schema";
import { formatIstDateTime } from "@/lib/date-time";
import { findPossibleDuplicateVendors } from "@/lib/advice/vendor-requests";

export const dynamic = "force-dynamic";

const MSME_STATUS_LABELS: Record<string, string> = {
  MICRO: "Micro",
  SMALL: "Small",
  MEDIUM: "Medium",
  NOT_REGISTERED: "Not Registered",
  UNKNOWN: "Not Sure",
};

function stateOf(request: { approvedAt: Date | null; sentBackAt: Date | null }): "Approved" | "Sent Back" | "Pending" {
  if (request.approvedAt) return "Approved";
  if (request.sentBackAt) return "Sent Back";
  return "Pending";
}

export default async function VendorRequestsPage() {
  const session = await getAdminSession();
  if (!hasFinanceRole(session)) return null;

  const [rows, activeVendors] = await Promise.all([
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
  ]);

  const pendingCount = rows.filter((r) => stateOf(r) === "Pending").length;
  const msmeFollowUpCount = rows.filter((r) => stateOf(r) === "Pending" && !r.msmeDocumentUrl).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Vendor Addition Requests</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          New vendors requested by submitters directly from the Payment Advice form. Approving
          creates the vendor and backfills the linked submission; sending back returns it to the
          submitter through the usual edit-link flow.
        </p>
      </header>

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

function StateBadge({ state }: { state: "Pending" | "Approved" | "Sent Back" }) {
  const styles =
    state === "Approved"
      ? "bg-[#1e5c39]/10 text-[#1e5c39]"
      : state === "Sent Back"
        ? "bg-[#b3261e]/10 text-[#b3261e]"
        : "bg-amber-100 text-amber-900";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{state}</span>;
}
