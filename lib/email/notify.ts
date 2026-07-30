import { Resend } from "resend";
import {
  type AuthorityApprovalEmailData,
  type SentBackEmailData,
  type SubmissionConfirmationEmailData,
  type VerifiedEmailData,
  renderAuthorityApprovalEmail,
  renderSentBackEmail,
  renderSubmissionConfirmationEmail,
  renderVerifiedEmail,
} from "@/lib/email/templates";

type EmailMessage = { subject: string; html: string };

function isLiveMode(): boolean {
  return process.env.EMAIL_MODE === "live";
}

function getFrom(): string {
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
}

// Constructed lazily (not at module load) so importing this file never
// requires RESEND_API_KEY to be set — only actually sending in live mode
// does, matching how lib/db/index.ts lazily creates its connection.
let cachedClient: Resend | null = null;
function getResendClient(): Resend {
  if (!cachedClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    cachedClient = new Resend(apiKey);
  }
  return cachedClient;
}

function preview(kind: string, message: EmailMessage) {
  console.info(`[Email preview: ${kind}]`, message);
}

/**
 * Preview mode (default, and whenever EMAIL_MODE isn't exactly "live"):
 * exact prior behavior — render + console.log, no network call.
 *
 * Live mode: sends via Resend. When EMAIL_TEST_OVERRIDE_RECIPIENT is set,
 * every email is redirected there instead of `to`, with the subject
 * prefixed "[TEST — would go to: {to}] ", so the full
 * render->send->deliver pipeline can be verified against a real inbox
 * before trusting real recipient data.
 *
 * Resend failures (network, invalid recipient, rate limit — the SDK
 * returns `{error}` rather than throwing for API-level failures, but a
 * network-level failure can still throw) are caught and logged, never
 * thrown — every caller sits inside a real workflow action (submit,
 * send-back, verify, generate authority link), none of which should fail
 * or roll back because an email didn't send. Email is a notification, not
 * a gate.
 */
async function send(kind: string, to: string, message: EmailMessage): Promise<void> {
  if (!isLiveMode()) {
    preview(kind, message);
    return;
  }

  const override = process.env.EMAIL_TEST_OVERRIDE_RECIPIENT;
  const recipient = override || to;
  const subject = override ? `[TEST — would go to: ${to}] ${message.subject}` : message.subject;

  try {
    const result = await getResendClient().emails.send({
      from: getFrom(),
      to: recipient,
      subject,
      html: message.html,
    });
    if (result.error) {
      console.error(`[Email] Resend returned an error sending "${kind}" to ${recipient}:`, result.error);
      return;
    }
    console.info(
      `[Email sent: ${kind}] to ${recipient}${override ? ` (redirected from ${to})` : ""}, id ${result.data?.id}`,
    );
  } catch (err) {
    console.error(`[Email] Failed to send "${kind}" via Resend:`, err);
  }
}

export async function notifyAuthorityApproval(
  data: AuthorityApprovalEmailData,
  to: string | null,
) {
  const message = renderAuthorityApprovalEmail(data);
  if (!to) {
    console.warn(`No email on file for authority ${data.authorityName}, falling back to preview.`);
    preview("authority approval", message);
    return message;
  }
  await send("authority approval", to, message);
  return message;
}

export async function notifySentBack(data: SentBackEmailData, to: string) {
  const message = renderSentBackEmail(data);
  await send("sent back", to, message);
  return message;
}

export async function notifySubmissionConfirmation(
  data: SubmissionConfirmationEmailData,
  to: string,
) {
  const message = renderSubmissionConfirmationEmail(data);
  await send("submission confirmation", to, message);
  return message;
}

// No email is sent for "Received & In Process" or "Sanctioned" transitions
// — not requested, dashboard-only for now. See AGENT_HANDOFF.md.
export async function notifyVerified(data: VerifiedEmailData, to: string) {
  const message = renderVerifiedEmail(data);
  await send("verified", to, message);
  return message;
}
