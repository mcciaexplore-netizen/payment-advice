import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { staffMembers, staffAuthorityOptions } from "@/lib/db/schema";
import { staffMemberFormSchema } from "@/lib/validation/vendor";
import { countInProgressForStaffName } from "@/lib/advice/deactivation-safety";

export const runtime = "nodejs";

// A standalone schema, not `.pick()` off staffMemberFormSchema — Zod
// doesn't allow .pick()/.omit() on a schema with .superRefine() attached.
// `force` isn't a real field, just an escape hatch past the in-progress
// warning below — kept out of staffMemberFormSchema so it can't leak into
// a real create/edit payload by accident.
const toggleActiveSchema = z.object({ isActive: z.boolean(), force: z.boolean().optional() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  // A quick "Deactivate"/"Activate" toggle sends only { isActive } (+ maybe
  // `force`) and must not touch this staff member's authority assignments;
  // the full staff edit form always sends fullName alongside everything else.
  const isToggleOnly =
    body &&
    typeof body === "object" &&
    "isActive" in body &&
    Object.keys(body).every((k) => k === "isActive" || k === "force");

  if (isToggleOnly) {
    const parsed = toggleActiveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    const [existing] = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

    if (parsed.data.isActive === false && !parsed.data.force) {
      const inProgressCount = await countInProgressForStaffName(existing.fullName);
      if (inProgressCount > 0) {
        return NextResponse.json(
          {
            error: `This staff member has ${inProgressCount} submission(s) still in progress that depend on them — deactivating won't affect those submissions, but confirm you want to proceed.`,
            inProgressCount,
          },
          { status: 409 },
        );
      }
    }

    const [staff] = await db
      .update(staffMembers)
      .set({ isActive: parsed.data.isActive, updatedAt: new Date() })
      .where(eq(staffMembers.id, id))
      .returning();
    if (!staff) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    return NextResponse.json({ staff });
  }

  // `force` isn't part of staffMemberFormSchema (which can't be `.extend()`ed
  // — it's a ZodEffects from `.superRefine()`, same reason the toggle above
  // needs its own schema) — pull it out before validating the rest.
  const force = typeof body === "object" && body !== null && body.force === true;
  const parsed = staffMemberFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  if (values.isActive === false && !force) {
    const [existing] = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    const inProgressCount = await countInProgressForStaffName(existing.fullName);
    if (inProgressCount > 0) {
      return NextResponse.json(
        {
          error: `This staff member has ${inProgressCount} submission(s) still in progress that depend on them — deactivating won't affect those submissions, but confirm you want to proceed.`,
          inProgressCount,
        },
        { status: 409 },
      );
    }
  }

  const staff = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(staffMembers)
      .set({ fullName: values.fullName, email: values.email ?? null, isActive: values.isActive, updatedAt: new Date() })
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
