import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { sendVendorMsmeRequestEmail } from "@/lib/email/notify";
import { computeMsmeRequestDeadline, MSME_REQUEST_EMAIL_FIXED_CC } from "@/lib/advice/msme-email-template";
import { vendorMsmeEmailSchema } from "@/lib/validation/vendor-msme-email";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

// Same two static reference documents every submitter downloads today (see
// public/msme/) - read server-side so they can be attached directly to the
// real email, same path.join(process.cwd(), "public", ...) pattern already
// used to read the logo into generated PDFs (lib/pdf/PaymentAdviceDocument.tsx).
async function loadMsmeAttachments() {
  const dir = path.join(process.cwd(), "public", "msme");
  const [notification, declaration] = await Promise.all([
    fs.readFile(path.join(dir, "mca-notification.pdf")),
    fs.readFile(path.join(dir, "non-msme-declaration-template.docx")),
  ]);
  return [
    { filename: "MCA-Notification.pdf", content: notification },
    { filename: "Non-MSME-Declaration-Template.docx", content: declaration },
  ];
}

// Public, unauthenticated - called directly from the Payment Advice form's
// "Request to add vendor" panel, before the PA itself is ever submitted (a
// vendor_requests row can't exist yet at this point: its payment_advice_id
// is NOT NULL). The real vendor_requests row is created later, at PA
// submission, carrying msme_email_sent_at/msme_email_message_id through as
// extra form fields - same pattern already used for the MSME document
// upload. This route's own VENDOR_MSME_EMAIL_SENT audit_log row is written
// immediately instead, with no payment_advice_id/vendor_request_id yet
// known, so the send is traceable even if the submitter never finishes
// submitting the PA afterward.
export async function POST(req: NextRequest) {
  const parsed = vendorMsmeEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { vendorName, vendorEmail, submitterName, submitterEmail } = parsed.data;
  const cc = [submitterEmail, MSME_REQUEST_EMAIL_FIXED_CC];

  let attachments;
  try {
    attachments = await loadMsmeAttachments();
  } catch (err) {
    console.error("Could not load MSME email attachments:", err);
    return NextResponse.json(
      { error: "Could not load the reference documents. Please try again." },
      { status: 500 },
    );
  }

  try {
    const { messageId } = await sendVendorMsmeRequestEmail(
      { vendorName, submitterName, deadline: computeMsmeRequestDeadline() },
      vendorEmail,
      cc,
      attachments,
    );
    const sentAt = new Date();
    await db.insert(auditLog).values({
      action: "VENDOR_MSME_EMAIL_SENT",
      actor: submitterName,
      ipAddress: clientIp(req),
      details: { vendorEmail, cc, messageId },
    });
    return NextResponse.json({ sentAt: sentAt.toISOString(), messageId: messageId ?? null });
  } catch (err) {
    console.error("Failed to send vendor MSME request email:", err);
    return NextResponse.json(
      { error: "Could not send the email. Please check the vendor's email address and try again." },
      { status: 502 },
    );
  }
}
