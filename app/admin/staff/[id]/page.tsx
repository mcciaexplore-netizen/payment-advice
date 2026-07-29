import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { staffMembers, recommendingAuthorities, staffAuthorityOptions } from "@/lib/db/schema";
import { StaffForm } from "@/components/admin/StaffForm";

export const dynamic = "force-dynamic";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [staff] = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1);
  if (!staff) notFound();

  const [authorities, options] = await Promise.all([
    db
      .select({ id: recommendingAuthorities.id, authorityName: recommendingAuthorities.authorityName })
      .from(recommendingAuthorities)
      .orderBy(asc(recommendingAuthorities.authorityName)),
    db
      .select()
      .from(staffAuthorityOptions)
      .where(eq(staffAuthorityOptions.staffMemberId, id))
      .orderBy(asc(staffAuthorityOptions.sortOrder)),
  ]);

  const first = options.find((o) => o.sortOrder === 1);
  const second = options.find((o) => o.sortOrder === 2);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-3xl text-[#0b1f3a]">Edit Staff Member</h1>
      <StaffForm
        staffId={staff.id}
        allAuthorities={authorities}
        initialValues={{
          fullName: staff.fullName,
          isActive: staff.isActive,
          firstAuthorityId: first?.recommendingAuthorityId,
          secondAuthorityId: second?.recommendingAuthorityId,
        }}
      />
    </div>
  );
}
