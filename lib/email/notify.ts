import {
  type AuthorityApprovalEmailData,
  type SentBackEmailData,
  type SubmissionConfirmationEmailData,
  renderAuthorityApprovalEmail,
  renderSentBackEmail,
  renderSubmissionConfirmationEmail,
} from "@/lib/email/templates";

// TODO: no email provider wired up yet — see AGENT_HANDOFF.md
// notifyAuthorityApproval() is ready but has no call site yet — wire it in once the Approval Workflow feature (see AGENT_HANDOFF.md) lands.
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
