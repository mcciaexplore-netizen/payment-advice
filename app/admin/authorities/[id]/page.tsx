import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { AuthorityForm } from "@/components/admin/AuthorityForm";

export const dynamic = "force-dynamic";

export default async function EditAuthorityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [authority] = await db
    .select()
    .from(recommendingAuthorities)
    .where(eq(recommendingAuthorities.id, id))
    .limit(1);
  if (!authority) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-3xl text-[#0b1f3a]">Edit Recommending Authority</h1>
      <AuthorityForm
        authorityId={authority.id}
        initialValues={{
          department: authority.department,
          headName: authority.headName,
          email: authority.email ?? undefined,
          isActive: authority.isActive,
        }}
      />
    </div>
  );
}
