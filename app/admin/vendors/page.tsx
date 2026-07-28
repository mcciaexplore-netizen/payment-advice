import Link from "next/link";
import { and, count, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { VendorActiveToggle } from "@/components/admin/VendorActiveToggle";

const PAGE_SIZE = 25;

export const dynamic = "force-dynamic";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = q ? and(ilike(vendors.companyName, `%${q}%`)) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(vendors)
      .where(where)
      .orderBy(vendors.companyName)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(vendors).where(where),
  ]);
  const totalPages = Math.max(1, Math.ceil((totalRow[0]?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Vendors</h1>
        <Link
          href="/admin/vendors/new"
          className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
        >
          New Vendor
        </Link>
      </div>

      <form method="get" className="flex gap-3">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by company name…"
          className="admin-filter-input w-72"
        />
        <button type="submit" className="rounded-md border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-50">
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">GSTIN</th>
              <th className="px-4 py-3">MSME</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No vendors found.
                </td>
              </tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#0b1f3a]">{v.companyName}</td>
                  <td className="px-4 py-3">{v.contactPerson ?? "—"}</td>
                  <td className="px-4 py-3">{v.gstin ?? "—"}</td>
                  <td className="px-4 py-3">{v.isMsme ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">{v.isActive ? "Active" : "Inactive"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/admin/vendors/${v.id}`} className="mr-4 font-medium text-[#0b1f3a] hover:underline">
                      Edit
                    </Link>
                    <VendorActiveToggle vendorId={v.id} isActive={v.isActive} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </div>
    </div>
  );
}
