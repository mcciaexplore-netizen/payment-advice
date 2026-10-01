import { addCalendarDays, formatDateOnly, todayInIst } from "@/lib/date-time";

/** Fixed CC recipient on every MSME request email, alongside the submitter's
 * own address - per the 2026-10-01 revision brief, so Sunil Salunke always
 * has visibility into these requests. Not configurable per-request. */
export const MSME_REQUEST_EMAIL_FIXED_CC = "sunils@mcciapune.com";

/**
 * 7 calendar days from "today" (IST), formatted DD/MM/YYYY - the deadline
 * quoted in the MSME request email's body (see
 * lib/email/templates.ts's renderVendorMsmeRequestEmail). `today` is a
 * param only so this stays pure/testable without faking the system clock.
 *
 * As of 2026-10-01, the app sends this email itself (lib/email/notify.ts's
 * sendVendorMsmeRequestEmail) rather than handing the submitter a mailto:
 * link - this module used to also build the plain-text subject/body and a
 * mailto: href for that copy/paste flow; both were removed along with the
 * UI that used them.
 */
export function computeMsmeRequestDeadline(today: string = todayInIst()): string {
  return formatDateOnly(addCalendarDays(today, 7));
}
