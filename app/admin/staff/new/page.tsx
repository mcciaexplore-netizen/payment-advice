import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { StaffForm } from "@/components/admin/StaffForm";

export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  const authorities = await db
    .select({ id: recommendingAuthorities.id, authorityName: recommendingAuthorities.authorityName })
    .from(recommendingAuthorities)
    .orderBy(asc(recommendingAuthorities.authorityName));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-3xl text-[#0b1f3a]">New Staff Member</h1>
      <StaffForm allAuthorities={authorities} />
    </div>
  );
}
