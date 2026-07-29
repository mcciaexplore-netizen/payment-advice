import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { staffMembers, staffAuthorityOptions } from "@/lib/db/schema";
import { staffMemberFormSchema } from "@/lib/validation/vendor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = staffMemberFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const staff = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(staffMembers)
      .values({ fullName: values.fullName, isActive: values.isActive })
      .returning();

    const options: { staffMemberId: string; recommendingAuthorityId: string; sortOrder: number }[] = [];
    if (values.firstAuthorityId) {
      options.push({ staffMemberId: created.id, recommendingAuthorityId: values.firstAuthorityId, sortOrder: 1 });
    }
    if (values.secondAuthorityId) {
      options.push({ staffMemberId: created.id, recommendingAuthorityId: values.secondAuthorityId, sortOrder: 2 });
    }
    if (options.length > 0) {
      await tx.insert(staffAuthorityOptions).values(options);
    }

    return created;
  });

  return NextResponse.json({ staff });
}
