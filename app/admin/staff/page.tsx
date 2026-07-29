import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { staffMembers, recommendingAuthorities, staffAuthorityOptions } from "@/lib/db/schema";
import { AuthorityActiveToggle } from "@/components/admin/AuthorityActiveToggle";
import { StaffActiveToggle } from "@/components/admin/StaffActiveToggle";
import { NewAuthorityInlineForm } from "@/components/admin/NewAuthorityInlineForm";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const [authorities, staff, options] = await Promise.all([
    db.select().from(recommendingAuthorities).orderBy(asc(recommendingAuthorities.authorityName)),
    db.select().from(staffMembers).orderBy(asc(staffMembers.fullName)),
    db
      .select({
        staffMemberId: staffAuthorityOptions.staffMemberId,
        sortOrder: staffAuthorityOptions.sortOrder,
        authorityName: recommendingAuthorities.authorityName,
      })
      .from(staffAuthorityOptions)
      .innerJoin(
        recommendingAuthorities,
        eq(staffAuthorityOptions.recommendingAuthorityId, recommendingAuthorities.id),
      )
      .orderBy(asc(staffAuthorityOptions.sortOrder)),
  ]);

  const optionsByStaffId = new Map<string, string[]>();
  for (const o of options) {
    const list = optionsByStaffId.get(o.staffMemberId) ?? [];
    list.push(o.authorityName);
    optionsByStaffId.set(o.staffMemberId, list);
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Staff &amp; Recommending Authorities</h1>
        <p className="mt-1 text-sm text-gray-600">
          Staff members drive the public form&apos;s name auto-fill; recommending authorities are
          the pool of approvers assigned to them.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl text-[#0b1f3a]">Recommending Authorities</h2>
        </div>
        <NewAuthorityInlineForm />
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {authorities.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No recommending authorities yet.
                  </td>
                </tr>
              ) : (
                authorities.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#0b1f3a]">{a.authorityName}</td>
                    <td className="px-4 py-3">{a.email ?? "—"}</td>
                    <td className="px-4 py-3">{a.isActive ? "Active" : "Inactive"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <AuthorityActiveToggle authorityId={a.id} isActive={a.isActive} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl text-[#0b1f3a]">Staff Members</h2>
          <Link
            href="/admin/staff/new"
            className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90"
          >
            New Staff Member
          </Link>
        </div>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Recommending Authorities</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No staff members yet.
                  </td>
                </tr>
              ) : (
                staff.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#0b1f3a]">{s.fullName}</td>
                    <td className="px-4 py-3">
                      {(optionsByStaffId.get(s.id) ?? []).join(", ") || (
                        <span className="text-gray-400">None assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{s.isActive ? "Active" : "Inactive"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/admin/staff/${s.id}`}
                        className="mr-4 font-medium text-[#0b1f3a] hover:underline"
                      >
                        Edit
                      </Link>
                      <StaffActiveToggle staffId={s.id} isActive={s.isActive} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
