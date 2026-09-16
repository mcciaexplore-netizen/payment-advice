import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { vendorBankAccounts } from "@/lib/db/schema";

export const runtime = "nodejs";

const patchSchema = z.object({
  restrictedToEmails: z.array(z.string().trim().email()).max(20),
});

// Finance Admin only (gated by proxy.ts's /api/admin/* rule). Lets an
// account be restricted to one or more submitter emails, or cleared back to
// visible-to-everyone by sending an empty array. This is the only place
// `restricted_to_emails` is written — see the GET
// /api/vendors/[id]/bank-accounts route for where it's enforced.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const deduped = Array.from(
    new Set(parsed.data.restrictedToEmails.map((email) => email.toLowerCase())),
  );

  const [account] = await db
    .update(vendorBankAccounts)
    .set({ restrictedToEmails: deduped.length > 0 ? deduped : null })
    .where(eq(vendorBankAccounts.id, id))
    .returning();

  if (!account) {
    return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}
