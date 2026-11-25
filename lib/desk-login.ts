/** Pages behind the Payment Desk sign-in: the home page and the forms it
 * links to. Emailed links (authority approval, sent-back edit), the
 * confirmation pages and every dashboard keep their own rules. */
export const DESK_PATHS: ReadonlySet<string> = new Set(["/", "/payment-advice", "/cash-voucher", "/advance", "/refund", "/forwarding-memo"]);

/** Where to go after signing in: only one of the desk pages, so a crafted
 * ?next= can never send someone to another site or an unexpected page. */
/** The edit page a sent-back third party refund email links to. An exact
 * pattern (one id, nothing else), so it can never point anywhere else. */
const REFUND_EDIT_PATH = /^\/refund\/edit\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeNextPath(next: string | undefined | null): string {
  return next && (DESK_PATHS.has(next) || REFUND_EDIT_PATH.test(next)) ? next : "/";
}
