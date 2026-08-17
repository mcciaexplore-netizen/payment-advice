import { Resend } from "resend";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import {
  type AuthorityApprovalEmailData,
  type PaymentDoneEmailData,
  type PaymentEntryEmailData,
  type SentBackEmailData,
  type SubmissionConfirmationEmailData,
  type VerifiedEmailData,
  renderAuthorityApprovalEmail,
  renderPaymentDoneEmail,
  renderPaymentEntryEmail,
  renderSentBackEmail,
  renderSubmissionConfirmationEmail,
  renderVerifiedEmail,
} from "@/lib/email/templates";

type EmailMessage = { subject: string; html: string };
type EmailProvider = "gmail" | "resend";

function isLiveMode(): boolean {
  return process.env.EMAIL_MODE === "live";
}

/**
 * "gmail" is the current interim default (Gmail SMTP via an App Password —
 * see AGENT_HANDOFF.md for why: mcciapune.com isn't DNS-verified in Resend
 * yet, and Gmail works immediately with no DNS wait). Set
 * EMAIL_PROVIDER=resend to switch back once that domain is verified —
 * everything below this point (Resend client, getFrom's resend branch)
 * stays intact and ready, just dormant while gmail is the default.
 */
function getProvider(): EmailProvider {
  return process.env.EMAIL_PROVIDER === "resend" ? "resend" : "gmail";
}

function getFrom(): string {
  if (getProvider() === "gmail") {
    // Gmail SMTP requires "from" to match the authenticated account — you
    // can't send "as" a different address the way Resend allowed with a
    // verified domain.
    const user = process.env.GMAIL_USER;
    if (!user) {
      throw new Error("GMAIL_USER environment variable is not set");
    }
    return user;
  }
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
}

// Constructed lazily (not at module load) so importing this file never
// requires RESEND_API_KEY to be set — only actually sending in live mode
// with EMAIL_PROVIDER=resend does, matching how lib/db/index.ts lazily
// creates its connection. Kept fully intact and unused while gmail is the
// default provider, ready for EMAIL_PROVIDER=resend once mcciapune.com is
// DNS-verified.
let cachedResendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!cachedResendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    cachedResendClient = new Resend(apiKey);
  }
  return cachedResendClient;
}

// Same lazy-construction reasoning as getResendClient — only required when
// EMAIL_MODE=live and EMAIL_PROVIDER=gmail (the current default).
let cachedGmailTransport: nodemailer.Transporter | null = null;
function getGmailTransport(): nodemailer.Transporter {
  if (!cachedGmailTransport) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD environment variables are not set");
    }
    cachedGmailTransport = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return cachedGmailTransport;
}

function preview(kind: string, message: EmailMessage) {
  console.info(`[Email preview: ${kind}]`, message);
}

/**
 * The one place that actually hands an email to a provider's SDK/transport
 * — everything in send() around this call (mode check, override redirect,
 * subject prefixing, try/catch, logging) is provider-agnostic and
 * unchanged. Normalizes both providers to the same "resolves with an id,
 * or throws" shape so send()'s single try/catch keeps working unmodified:
 * Resend's SDK returns `{error}` instead of throwing for API-level
 * failures, so that case is converted into a thrown error here rather than
 * needing a second error-handling path.
 */
async function dispatch(
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ id?: string }> {
  if (getProvider() === "gmail") {
    const info = await getGmailTransport().sendMail({ from, to, subject, html });
    return { id: info.messageId };
  }
  const result = await getResendClient().emails.send({ from, to, subject, html });
  if (result.error) {
    throw new Error(`Resend error: ${JSON.stringify(result.error)}`);
  }
  return { id: result.data?.id };
}

/**
 * Preview mode (default, and whenever EMAIL_MODE isn't exactly "live"):
 * exact prior behavior — render + console.log, no network call.
 *
 * Live mode: sends via whichever provider EMAIL_PROVIDER selects (see
 * getProvider()). When EMAIL_TEST_OVERRIDE_RECIPIENT is set, every email is
 * redirected there instead of `to`, with the subject prefixed
 * "[TEST — would go to: {to}] ", so the full render->send->deliver
 * pipeline can be verified against a real inbox before trusting real
 * recipient data.
 *
 * Provider failures (network, invalid recipient, auth, rate limit) are
 * caught and logged, never thrown — every caller sits inside a real
 * workflow action (submit, send-back, verify, generate authority link),
 * none of which should fail or roll back because an email didn't send.
 * Email is a notification, not a gate.
 *
 * That said, a provider-level failure (e.g. missing/invalid SMTP
 * credentials — as happened when GMAIL_USER/GMAIL_APP_PASSWORD weren't set
 * in a deploy's env vars) is a real infrastructure problem, not the benign
 * "recipient has no email on file" case (that one never reaches send() at
 * all — see notifyAuthorityApproval's `!to` branch, which stays a plain
 * console.warn + preview by design). So in addition to the console.error
 * below, this writes a distinct `EMAIL_SEND_FAILED` audit_log row when an
 * adviceId is available, so it surfaces in that advice's Audit Trail in the
 * admin UI instead of only existing in Vercel's function logs. Best-effort:
 * a failure to write that row must not itself throw.
 */
async function send(
  kind: string,
  to: string,
  message: EmailMessage,
  adviceId?: string,
): Promise<void> {
  if (!isLiveMode()) {
    preview(kind, message);
    return;
  }

  const override = process.env.EMAIL_TEST_OVERRIDE_RECIPIENT;
  const recipient = override || to;
  const subject = override ? `[TEST — would go to: ${to}] ${message.subject}` : message.subject;

  try {
    const result = await dispatch(getFrom(), recipient, subject, message.html);
    console.info(
      `[Email sent: ${kind}] to ${recipient}${override ? ` (redirected from ${to})` : ""}, id ${result.id}`,
    );
  } catch (err) {
    const provider = getProvider();
    console.error(`[Email] Failed to send "${kind}" via ${provider}:`, err);
    if (adviceId) {
      try {
        await db.insert(auditLog).values({
          paymentAdviceId: adviceId,
          action: "EMAIL_SEND_FAILED",
          actor: "System",
          details: {
            kind,
            provider,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      } catch (auditErr) {
        console.error(`[Email] Also failed to write EMAIL_SEND_FAILED audit_log row:`, auditErr);
      }
    }
  }
}

export async function notifyAuthorityApproval(
  data: AuthorityApprovalEmailData,
  to: string | null,
  adviceId?: string,
) {
  const message = renderAuthorityApprovalEmail(data);
  if (!to) {
    console.warn(`No email on file for authority ${data.authorityName}, falling back to preview.`);
    preview("authority approval", message);
    return message;
  }
  await send("authority approval", to, message, adviceId);
  return message;
}

export async function notifySentBack(data: SentBackEmailData, to: string, adviceId?: string) {
  const message = renderSentBackEmail(data);
  await send("sent back", to, message, adviceId);
  return message;
}

export async function notifySubmissionConfirmation(
  data: SubmissionConfirmationEmailData,
  to: string,
  adviceId?: string,
) {
  const message = renderSubmissionConfirmationEmail(data);
  await send("submission confirmation", to, message, adviceId);
  return message;
}

// No email is sent for "Received & In Process" — not requested,
// dashboard-only. Sanctioned no longer exists as an active step at all (see
// AGENT_HANDOFF.md); Payment Done is the new, only terminal notification.
export async function notifyVerified(data: VerifiedEmailData, to: string, adviceId?: string) {
  const message = renderVerifiedEmail(data);
  await send("verified", to, message, adviceId);
  return message;
}

export async function notifyPaymentDone(data: PaymentDoneEmailData, to: string, adviceId?: string) {
  const message = renderPaymentDoneEmail(data);
  await send("payment done", to, message, adviceId);
  return message;
}

// NEFT's multi-part payment model (see AGENT_HANDOFF.md) — one email per
// payment_entries row, not a cumulative summary. Cash Voucher's single
// notifyPaymentDone() above is untouched and still fires exactly as before
// for Cash's one-shot "Mark Payment Done" action.
export async function notifyPaymentEntry(data: PaymentEntryEmailData, to: string, adviceId?: string) {
  const message = renderPaymentEntryEmail(data);
  await send(data.isFinal ? "payment entry (final)" : "payment entry (partial)", to, message, adviceId);
  return message;
}
