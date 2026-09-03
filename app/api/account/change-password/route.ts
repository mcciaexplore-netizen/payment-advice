import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUsers, auditLog } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hashPassword, verifyPassword } from "@/lib/admin-users";
import { changePasswordFormSchema } from "@/lib/validation/account";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Shared by both Finance Admin and Authority sessions — any signed-in
 * admin_users account may change its own password, regardless of role.
 * Lives under /api/account/ (not /api/admin/ or /api/authority/) so
 * proxy.ts can authorize it with "any valid session" instead of the
 * role-specific gates those two prefixes enforce. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = changePasswordFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, session.adminUserId))
    .limit(1);
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const currentOk = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!currentOk) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const newPasswordHash = await hashPassword(parsed.data.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(adminUsers)
      .set({ passwordHash: newPasswordHash })
      .where(eq(adminUsers.id, user.id));

    // Security-relevant event, kept as a permanent record — same reasoning
    // as AUTHORITY_IDENTITY_CHECK_FAILED. Never log the old/new password
    // anywhere, including here: `details` carries no password material.
    await tx.insert(auditLog).values({
      paymentAdviceId: null,
      action: "ADMIN_PASSWORD_CHANGED",
      actor: `${user.fullName} <${user.email}>`,
      ipAddress: clientIp(req),
      details: {},
    });
  });

  return NextResponse.json({ ok: true });
}
