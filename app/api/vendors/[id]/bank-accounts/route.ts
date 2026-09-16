import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendorBankAccounts } from "@/lib/db/schema";
import { isBankAccountVisibleToEmail } from "@/lib/advice/vendor-bank-accounts";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public endpoint: once a vendor is selected on the public form, this
// drives the zero/one/multiple-accounts auto-fill logic — see
// components/form/VendorBankAccountFields.tsx. Ordered most-recently-used
// first so a multi-account list reads naturally.
//
// `restrictedToEmails` filtering happens HERE, before anything is sent to
// the browser — never fetch every account and hide restricted ones on the
// client. Regular submitters aren't logged in, so the only identity signal
// available is the "Your Email" they typed, passed as `?email=`. A row
// with a non-empty `restrictedToEmails` is dropped entirely (case-
// insensitively) unless the caller's email is in that list; the caller
// sees exactly the same shape (a possibly-empty accounts array) as a
// vendor with no bank-account history at all, with nothing hinting a
// restricted record was excluded.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ accounts: [] });
  }

  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();

  const results = await db
    .select({
      id: vendorBankAccounts.id,
      bankAccountNo: vendorBankAccounts.bankAccountNo,
      bankIfsc: vendorBankAccounts.bankIfsc,
      beneficiaryName: vendorBankAccounts.beneficiaryName,
      lastUsedAt: vendorBankAccounts.lastUsedAt,
      restrictedToEmails: vendorBankAccounts.restrictedToEmails,
    })
    .from(vendorBankAccounts)
    .where(eq(vendorBankAccounts.vendorId, id))
    .orderBy(desc(vendorBankAccounts.lastUsedAt));

  const visible = results
    .filter((row) => isBankAccountVisibleToEmail(row.restrictedToEmails, email))
    .map((row) => ({
      id: row.id,
      bankAccountNo: row.bankAccountNo,
      bankIfsc: row.bankIfsc,
      beneficiaryName: row.beneficiaryName,
      lastUsedAt: row.lastUsedAt,
    }));

  return NextResponse.json({ accounts: visible });
}
