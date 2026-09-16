import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { VendorReviewAction } from "@/components/admin/VendorReviewAction";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";
import { formatDateOnly, formatIstDateTime } from "@/lib/date-time";

export const dynamic = "force-dynamic";

function money(value: string): string {
  return `₹ ${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function VendorReviewPage() {
  const session = await getAdminSession();
  if (!hasFinanceRole(session)) return null;

  const rows = await db
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
    .orderBy(asc(paymentAdvices.submittedAt), asc(paymentAdvices.serialNo));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Vendor Review Queue</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Resolve historical Payment Advice payees that are not linked to a canonical vendor.
          Linking or creating a vendor updates only the payee name/address and vendor link; the
          reference number, amount, and workflow state are never changed.
        </p>
      </header>

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
