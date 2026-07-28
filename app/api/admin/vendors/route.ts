import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { vendorFormSchema } from "@/lib/validation/vendor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = vendorFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid vendor data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const [vendor] = await db
    .insert(vendors)
    .values({
      companyName: values.companyName,
      contactPerson: values.contactPerson ?? null,
      contactPhone: values.contactPhone ?? null,
      address: values.address ?? null,
      email: values.email ?? null,
      gstin: values.gstin ?? null,
      udyamNumber: values.udyamNumber ?? null,
      isMsme: values.isMsme,
      isActive: values.isActive,
    })
    .returning();

  return NextResponse.json({ vendor });
}
