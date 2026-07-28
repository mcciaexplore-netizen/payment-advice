import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { vendorFormSchema } from "@/lib/validation/vendor";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = vendorFormSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid vendor data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const [vendor] = await db
    .update(vendors)
    .set({
      ...(values.companyName !== undefined && { companyName: values.companyName }),
      ...(values.contactPerson !== undefined && { contactPerson: values.contactPerson ?? null }),
      ...(values.contactPhone !== undefined && { contactPhone: values.contactPhone ?? null }),
      ...(values.address !== undefined && { address: values.address ?? null }),
      ...(values.email !== undefined && { email: values.email ?? null }),
      ...(values.gstin !== undefined && { gstin: values.gstin ?? null }),
      ...(values.udyamNumber !== undefined && { udyamNumber: values.udyamNumber ?? null }),
      ...(values.isMsme !== undefined && { isMsme: values.isMsme }),
      ...(values.isActive !== undefined && { isActive: values.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, id))
    .returning();

  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  return NextResponse.json({ vendor });
}
