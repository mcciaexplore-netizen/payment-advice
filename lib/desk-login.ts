/** Pages behind the Payment Desk sign-in: the home page and the forms it
 * links to. Emailed links (authority approval, sent-back edit), the
 * confirmation pages and every dashboard keep their own rules. */
export const DESK_PATHS: ReadonlySet<string> = new Set(["/", "/payment-advice", "/cash-voucher", "/advance", "/refund", "/forwarding-memo"]);

/** Where to go after signing in: only one of the desk pages, so a crafted
 * ?next= can never send someone to another site or an unexpected page. */
export function safeNextPath(next: string | undefined | null): string {
  return next && DESK_PATHS.has(next) ? next : "/";
}
