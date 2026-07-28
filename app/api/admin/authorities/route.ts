import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { authorityFormSchema } from "@/lib/validation/vendor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = authorityFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const [authority] = await db
    .insert(recommendingAuthorities)
    .values({
      department: values.department,
      headName: values.headName,
      email: values.email ?? null,
      isActive: values.isActive,
    })
    .returning();

  return NextResponse.json({ authority });
}
