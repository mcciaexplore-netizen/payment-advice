import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PENDING_UPLOAD_PREFIX } from "@/lib/attachments/client-upload";

export const runtime = "nodejs";

const cleanupSchema = z.object({
  pathnames: z.array(z.string().startsWith(PENDING_UPLOAD_PREFIX).max(1024)).max(10),
});

export async function POST(request: Request) {
  const parsed = cleanupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cleanup request." }, { status: 400 });
  await Promise.allSettled(parsed.data.pathnames.map((pathname) => del(pathname)));
  return NextResponse.json({ ok: true });
}
