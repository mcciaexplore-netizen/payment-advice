import Link from "next/link";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { AuthorityActiveToggle } from "@/components/admin/AuthorityActiveToggle";

export const dynamic = "force-dynamic";

export default async function AuthoritiesPage() {
  const rows = await db
    .select()
    .from(recommendingAuthorities)
    .orderBy(recommendingAuthorities.department);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Recommending Authorities</h1>
        <Link
          href="/admin/authorities/new"
          className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
        >
          New Authority
        </Link>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Head Name</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No recommending authorities yet.
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#0b1f3a]">{a.department}</td>
                  <td className="px-4 py-3">{a.headName}</td>
                  <td className="px-4 py-3">{a.email ?? "—"}</td>
                  <td className="px-4 py-3">{a.isActive ? "Active" : "Inactive"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/admin/authorities/${a.id}`}
                      className="mr-4 font-medium text-[#0b1f3a] hover:underline"
                    >
                      Edit
                    </Link>
                    <AuthorityActiveToggle authorityId={a.id} isActive={a.isActive} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
