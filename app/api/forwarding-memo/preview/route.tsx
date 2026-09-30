import { NextRequest, NextResponse } from "next/server";
import { renderForwardingMemoPdf } from "@/lib/pdf/render-forwarding-memo";
import { forwardingMemoSchema } from "@/lib/validation/forwarding-memo";

export const runtime = "nodejs";

/**
 * Local, database-free printable flow. This endpoint only validates the
 * submitted form and renders PDF bytes; it never stores, audits or emails
 * financial data.
 */
export async function POST(req: NextRequest) {
  const parsed = forwardingMemoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid forwarding memo data." },
      { status: 400 },
    );
  }

  try {
    const pdf = await renderForwardingMemoPdf(parsed.data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=forwarding-memo.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Forwarding Memo] local PDF rendering failed", error);
    return NextResponse.json(
      { error: "The forwarding memo PDF could not be generated." },
      { status: 500 },
    );
  }
}
