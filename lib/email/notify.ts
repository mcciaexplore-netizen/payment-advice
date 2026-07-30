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

// TODO: no email provider wired up yet — see AGENT_HANDOFF.md
function preview(kind: string, message: { subject: string; html: string }) {
  console.info(`[Email preview: ${kind}]`, message);
}

export function notifyAuthorityApproval(data: AuthorityApprovalEmailData) {
  const message = renderAuthorityApprovalEmail(data);
  preview("authority approval", message);
  return message;
}

export function notifySentBack(data: SentBackEmailData) {
  const message = renderSentBackEmail(data);
  preview("sent back", message);
  return message;
}

export function notifySubmissionConfirmation(data: SubmissionConfirmationEmailData) {
  const message = renderSubmissionConfirmationEmail(data);
  preview("submission confirmation", message);
  return message;
}

// No email is sent for "Received & In Process" or "Sanctioned" transitions
// — not requested, dashboard-only for now. See AGENT_HANDOFF.md.
export function notifyVerified(data: VerifiedEmailData) {
  const message = renderVerifiedEmail(data);
  preview("verified", message);
  return message;
}
