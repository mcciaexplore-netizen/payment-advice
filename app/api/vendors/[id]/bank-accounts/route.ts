import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendorBankAccounts } from "@/lib/db/schema";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public endpoint: once a vendor is selected on the public form, this
// drives the zero/one/multiple-accounts auto-fill logic — see
// components/form/VendorBankAccountFields.tsx. Ordered most-recently-used
// first so a multi-account list reads naturally.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ accounts: [] });
  }

  const results = await db
    .select({
      id: vendorBankAccounts.id,
      bankAccountNo: vendorBankAccounts.bankAccountNo,
      bankIfsc: vendorBankAccounts.bankIfsc,
      beneficiaryName: vendorBankAccounts.beneficiaryName,
      lastUsedAt: vendorBankAccounts.lastUsedAt,
    })
    .from(vendorBankAccounts)
    .where(eq(vendorBankAccounts.vendorId, id))
    .orderBy(desc(vendorBankAccounts.lastUsedAt));

  return NextResponse.json({ accounts: results });
}
