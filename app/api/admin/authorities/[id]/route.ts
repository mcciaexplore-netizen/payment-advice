import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { authorityFormSchema } from "@/lib/validation/vendor";
import { countInProgressForAuthority } from "@/lib/advice/deactivation-safety";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  // `force` isn't a real field on authorityFormSchema — an escape hatch
  // past the in-progress-submissions warning below, same pattern as staff.
  const force = typeof body === "object" && body !== null && body.force === true;
  const parsed = authorityFormSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  if (values.isActive === false && !force) {
    const inProgressCount = await countInProgressForAuthority(id);
    if (inProgressCount > 0) {
      return NextResponse.json(
        {
          error: `This authority has ${inProgressCount} submission(s) still in progress that depend on them — deactivating won't affect those submissions, but confirm you want to proceed.`,
          inProgressCount,
        },
        { status: 409 },
      );
    }
  }

  const [authority] = await db
    .update(recommendingAuthorities)
    .set({
      ...(values.authorityName !== undefined && { authorityName: values.authorityName }),
      ...(values.email !== undefined && { email: values.email ?? null }),
      ...(values.isActive !== undefined && { isActive: values.isActive }),
    })
    .where(eq(recommendingAuthorities.id, id))
    .returning();

  if (!authority) {
    return NextResponse.json({ error: "Authority not found" }, { status: 404 });
  }

  return NextResponse.json({ authority });
}
