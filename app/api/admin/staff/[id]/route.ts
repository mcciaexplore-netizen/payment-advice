import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { staffMembers, staffAuthorityOptions } from "@/lib/db/schema";
import { staffMemberFormSchema } from "@/lib/validation/vendor";

export const runtime = "nodejs";

// A standalone schema, not `.pick()` off staffMemberFormSchema — Zod
// doesn't allow .pick()/.omit() on a schema with .superRefine() attached.
const toggleActiveSchema = z.object({ isActive: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  // A quick "Deactivate"/"Activate" toggle sends only { isActive } and must
  // not touch this staff member's authority assignments; the full staff
  // edit form always sends fullName alongside everything else.
  const isToggleOnly =
    body && typeof body === "object" && Object.keys(body).length === 1 && "isActive" in body;

  if (isToggleOnly) {
    const parsed = toggleActiveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    const [staff] = await db
      .update(staffMembers)
      .set({ isActive: parsed.data.isActive, updatedAt: new Date() })
      .where(eq(staffMembers.id, id))
      .returning();
    if (!staff) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    return NextResponse.json({ staff });
  }

  const parsed = staffMemberFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const staff = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(staffMembers)
      .set({ fullName: values.fullName, isActive: values.isActive, updatedAt: new Date() })
      .where(eq(staffMembers.id, id))
      .returning();
    if (!updated) return null;

    // Full replace, not a diff — simplest correct approach for "up to 2,
    // reorderable" options, and avoids stale rows if an authority is removed.
    await tx.delete(staffAuthorityOptions).where(eq(staffAuthorityOptions.staffMemberId, id));
    const options: { staffMemberId: string; recommendingAuthorityId: string; sortOrder: number }[] = [];
    if (values.firstAuthorityId) {
      options.push({ staffMemberId: id, recommendingAuthorityId: values.firstAuthorityId, sortOrder: 1 });
    }
    if (values.secondAuthorityId) {
      options.push({ staffMemberId: id, recommendingAuthorityId: values.secondAuthorityId, sortOrder: 2 });
    }
    if (options.length > 0) {
      await tx.insert(staffAuthorityOptions).values(options);
    }

    return updated;
  });

  if (!staff) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }
  return NextResponse.json({ staff });
}
