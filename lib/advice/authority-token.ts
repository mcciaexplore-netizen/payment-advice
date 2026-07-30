import { randomBytes } from "node:crypto";

/**
 * Unlike the 14-day edit-token TTL, this is generous (90 days): the
 * authority-approval link is the first gate a submission has to clear, and
 * an expired link with no reminder/resend mechanism would strand the whole
 * payment with no way to recover except a full send-back/resubmit cycle.
 */
export const AUTHORITY_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function generateAuthorityToken(): { token: string; expiresAt: Date } {
  return {
    token: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + AUTHORITY_TOKEN_TTL_MS),
  };
}

/**
 * Returns a user-facing error if this token can no longer be acted on
 * (already approved, already rejected, or expired while still pending) —
 * or null if Approve/Send Back are still valid actions. Shared by the
 * approve and reject routes so double-action prevention can't drift between
 * them.
 */
export function authorityActionError(advice: {
  authorityApprovedAt: Date | null;
  authorityRejectedAt: Date | null;
  authorityTokenExpiresAt: Date | null;
}): string | null {
  if (advice.authorityApprovedAt) {
    return "This Payment Advice has already been approved.";
  }
  if (advice.authorityRejectedAt) {
    return "This Payment Advice has already been sent back to the submitter.";
  }
  if (advice.authorityTokenExpiresAt && advice.authorityTokenExpiresAt < new Date()) {
    return "This approval link has expired. Please contact Accounts.";
  }
  return null;
}
