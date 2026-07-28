import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";

export const runtime = "nodejs";

// Public endpoint: the submitter typeahead in Section 2 of the form needs
// to search vendors without being logged in.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ vendors: [] });
  }

  const results = await db
    .select({
      id: vendors.id,
      companyName: vendors.companyName,
      contactPerson: vendors.contactPerson,
      contactPhone: vendors.contactPhone,
      address: vendors.address,
      email: vendors.email,
      gstin: vendors.gstin,
      udyamNumber: vendors.udyamNumber,
    })
    .from(vendors)
    .where(and(eq(vendors.isActive, true), ilike(vendors.companyName, `%${q}%`)))
    .limit(10);

  return NextResponse.json({ vendors: results });
}
