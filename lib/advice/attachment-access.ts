import { hasFinanceRole, type AdminSessionPayload } from "@/lib/auth";

export type AttachmentAccessAdvice = {
  submittedByEmail: string;
  recommendingAuthorityId: string;
  branch: string | null;
  submittedByDepartment: string;
};

export type AttachmentAccessViewer = {
  /** admin_users.email for session.adminUserId, read fresh from the DB. */
  email: string | null;
  /** The viewer's current admin_user_roles rows, read fresh from the DB, so a
   * revoked grant stops working immediately rather than at session expiry. */
  roleRows: Array<{ role: string; recommendingAuthorityId: string | null; scopeValue: string | null }>;
};

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** Whether this session may view or download a submission's attachments
 * from the Authority / Team dashboards. Mirrors exactly who can already see
 * the row in app/authority/page.tsx, so the buttons never reach a file the
 * person could not already find in their own list:
 * - Finance (PAYMENT_ADVICE / CASH_VOUCHER / ALL): any submission.
 * - The submitter: submitted_by_email equals their login email (the
 *   dashboard's My Submissions filter, also the only scope SELF and
 *   CASH_RECEIPT grants have).
 * - AUTHORITY: submissions routed to their recommending authority.
 * - BRANCH: submissions whose branch matches their scope (case-insensitive,
 *   same as the Team Submissions query).
 * - DEPARTMENT: submissions whose submitter department matches their scope.
 * Anyone else: no. Callers answer "no" with 404, never 403. */
export function canViewAdviceAttachments(
  session: AdminSessionPayload | null,
  viewer: AttachmentAccessViewer,
  advice: AttachmentAccessAdvice,
): boolean {
  if (!session) return false;
  if (hasFinanceRole(session)) return true;
  if (viewer.email && advice.submittedByEmail === viewer.email) return true;
  return viewer.roleRows.some((row) =>
    (row.role === "AUTHORITY" && Boolean(row.recommendingAuthorityId) && row.recommendingAuthorityId === advice.recommendingAuthorityId) ||
    (row.role === "BRANCH" && sameText(row.scopeValue, advice.branch)) ||
    (row.role === "DEPARTMENT" && sameText(row.scopeValue, advice.submittedByDepartment)),
  );
}

/** Builds a Content-Disposition value that keeps the original filename,
 * including non-ASCII names (RFC 6266 filename*), without letting quotes or
 * line breaks in a stored name break the header. */
export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function attachmentContentType(fileName: string): string {
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.png$/i.test(fileName)) return "image/png";
  return "application/pdf";
}
