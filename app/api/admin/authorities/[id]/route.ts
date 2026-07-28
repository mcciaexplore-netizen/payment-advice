import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { authorityFormSchema } from "@/lib/validation/vendor";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = authorityFormSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const [authority] = await db
    .update(recommendingAuthorities)
    .set({
      ...(values.department !== undefined && { department: values.department }),
      ...(values.headName !== undefined && { headName: values.headName }),
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
