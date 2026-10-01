import { addCalendarDays, formatDateOnly, todayInIst } from "@/lib/date-time";

/**
 * Plain text only - this is what goes into a mailto: body and a copy-to-
 * clipboard box, both rendered by the submitter's own email client, never
 * sent by this app. No HTML template needed (mailto doesn't render HTML
 * anyway). Exact copy as specified - do not reword without checking with
 * the human, since this references a specific MCA statutory order.
 */
export function buildMsmeRequestEmail(input: {
  vendorName: string;
  submitterName: string;
  /** Defaults to today in IST - a param only so this stays pure/testable
   * without faking the system clock. */
  today?: string;
}): { subject: string; body: string } {
  const today = input.today ?? todayInIst();
  const deadline = formatDateOnly(addCalendarDays(today, 7));

  const subject = `MSME Status Declaration Required — ${input.vendorName}`;

  const body = `Dear ${input.vendorName},

As per the Ministry of Corporate Affairs' Specified Companies (Furnishing of information about payment to micro and small enterprise suppliers) Order, 2019 (attached), companies must report payments to MSME suppliers delayed beyond 45 days.

To comply, we need your MSME status on record. Please share one of the following within 7 days:

1. If registered as Micro/Small/Medium — your Udyam Registration Certificate, or
2. If not registered under MSME — a signed declaration on your letterhead (template attached)

If we don't hear back by ${deadline}, we'll record your status as non-MSME for reporting purposes.

This is a statutory requirement — we appreciate a prompt response.

Regards,
${input.submitterName}
Mahratta Chamber of Commerce, Industries & Agriculture`;

  return { subject, body };
}

export function buildMsmeMailtoHref(input: { vendorEmail?: string; subject: string; body: string }): string {
  const to = input.vendorEmail ? encodeURIComponent(input.vendorEmail) : "";
  const params = new URLSearchParams({ subject: input.subject, body: input.body });
  return `mailto:${to}?${params.toString()}`;
}
