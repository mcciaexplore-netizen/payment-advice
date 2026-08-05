import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  AdminRole,
  createAdminSessionToken,
} from "@/lib/auth";
import { findActiveAdminUserByEmail, recordAdminLogin, verifyPassword } from "@/lib/admin-users";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Best-effort, per-instance rate limiting: Vercel serverless functions don't
// share memory across invocations/instances, so this doesn't guarantee a
// hard global cap of 5 attempts/15min under heavy distributed traffic, but
// it does throttle sustained brute-forcing against any given warm instance.
// No extra infra (Redis/KV) is in the fixed tech stack to do better in Phase 1.
const attemptsByIp = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const entry = attemptsByIp.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    attemptsByIp.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip: string) {
  const entry = attemptsByIp.get(ip);
  if (!entry || Date.now() - entry.windowStart > WINDOW_MS) {
    attemptsByIp.set(ip, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

function clearAttempts(ip: string) {
  attemptsByIp.delete(ip);
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const email = body?.email;
  const password = body?.password;

  if (typeof email !== "string" || typeof password !== "string") {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const user = await findActiveAdminUserByEmail(email);
  // Runs the (deliberately slow) bcrypt compare against a fixed dummy hash
  // even when no matching user exists, so a nonexistent-email response
  // takes the same time as a wrong-password one — timing alone can't be
  // used to enumerate which emails are registered.
  const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8n7Kn8b0Q3E1Y3jz3aOVfV1c5b1u0G";
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  clearAttempts(ip);
  await recordAdminLogin(user.id);
  const token = await createAdminSessionToken({
    adminUserId: user.id,
    fullName: user.fullName,
    adminRole: user.role as AdminRole,
  });
  const res = NextResponse.json({ ok: true, fullName: user.fullName, role: user.role });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
