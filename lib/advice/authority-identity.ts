/**
 * Lightweight identity confirmation for /authority-approval/[token] — not a
 * login system. The token itself (unguessable, emailed only to the named
 * Recommending Authority) was previously the only real protection; if that
 * email is ever forwarded or an inbox shared/compromised, anyone with the
 * link could approve or reject a real payment. This adds one extra check:
 * the visitor must type the email on file for THIS advice's authority
 * before Approve/Send Back are shown. See AGENT_HANDOFF.md for the full
 * writeup of the risk this closes.
 */

const IDENTITY_COOKIE_PREFIX = "mccia_authority_identity_";

/** One cookie per token (not a single shared cookie) so an authority with
 * more than one pending approval doesn't have to re-confirm on one link
 * just because they confirmed on another. Safe to derive the cookie name
 * directly from the token: forging it requires already knowing the token,
 * the same bar the rest of this link-based flow already relies on. */
export function identityCookieName(token: string): string {
  return `${IDENTITY_COOKIE_PREFIX}${token}`;
}

export function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Rolling window, enforced by counting recent AUTHORITY_IDENTITY_CHECK_FAILED
 * audit_log rows for this advice rather than an in-memory map — unlike the
 * admin login route's per-instance rate limiter, this is real DB state, so
 * it holds up across Vercel serverless cold starts/instances, and it's
 * scoped per-token (per-advice) as asked, not per-IP. */
export const IDENTITY_ATTEMPT_LIMIT = 5;
export const IDENTITY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
