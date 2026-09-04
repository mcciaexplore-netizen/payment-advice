import { formatDateOnly } from "@/lib/date-time";

/** Escapes every dynamic value before it is interpolated into email HTML. */
function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceTokens(template: string, values: Record<string, string | number | undefined>): string {
  return Object.entries(values).reduce(
    (html, [token, value]) => html.replaceAll(`{{${token}}}`, escapeHtml(value ?? "")),
    template,
  );
}

function shell(accent: "#E8A33D" | "#2E8B57", body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#F4F5F7;font-family:'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F5F7;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:8px;overflow:hidden;max-width:600px;width:100%;"><tr><td style="background-color:#0B1F3A;padding:28px 32px;"><img src="https://mcciapune.com/media/printmedia2023/mccialogo.png" alt="MCCIA" width="160" height="38" style="display:block;width:160px;height:38px;border:0;"><div style="font-family:Georgia,'Times New Roman',serif;color:#FFFFFF;font-size:18px;font-weight:bold;letter-spacing:.3px;margin-top:14px;">Mahratta Chamber of Commerce, Industries &amp; Agriculture</div><div style="color:#C9D3E0;font-size:12px;padding-top:4px;">Senapati Bapat Road, Pune 411 016</div></td></tr><tr><td style="background-color:${accent};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>${body}<tr><td style="background-color:#F9FAFB;padding:20px 32px;border-top:1px solid #E5E7EB;"><p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">This is an automated notification from the MCCIA Payment Advice system.<br>Please do not reply directly to this email.</p></td></tr></table></td></tr></table></body></html>`;
}

function details(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;margin-bottom:24px;">${rows.map(([label, value], index) => `<tr><td style="padding:12px 16px;${index < rows.length - 1 ? "border-bottom:1px solid #E5E7EB;" : ""}font-size:13px;color:#6B7280;width:40%;">${label}</td><td style="padding:12px 16px;${index < rows.length - 1 ? "border-bottom:1px solid #E5E7EB;" : ""}font-size:14px;color:#111827;${label === "Amount" ? "font-weight:700;color:#2E8B57;" : ""}">${value}</td></tr>`).join("")}</table>`;
}

function button(href: string, label: string, outlined = false): string {
  const style = outlined
    ? "border-radius:6px;border:1px solid #2E8B57;"
    : "border-radius:6px;background-color:#0B1F3A;";
  const color = outlined ? "#2E8B57" : "#FFFFFF";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;"><tr><td style="${style}"><a href="${href}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:${color};text-decoration:none;border-radius:6px;">${label}</a></td></tr></table>`;
}

export interface AuthorityApprovalEmailData {
  displayNo: string;
  /** "Payment Advice" for NEFT, "Cash Payment Voucher" for Cash — see
   * lib/advice/document-identity.ts. */
  documentLabel: string;
  authorityName: string;
  submittedByName: string;
  payeeName: string;
  amount: string | number;
  natureOfExpenditure: string;
  billReference: string;
  paymentMode: string;
  formDate: string;
  approvalLink: string;
  revisionCount?: number;
  previousRemarks?: string | null;
}

export interface SentBackEmailData {
  displayNo: string;
  documentLabel: string;
  submittedByName: string;
  sentBackBy: string;
  remarks: string;
  payeeName: string;
  amount: string | number;
  editLink: string;
}

export interface SubmissionConfirmationEmailData {
  displayNo: string;
  documentLabel: string;
  authorityName: string;
  submittedByName: string;
  payeeName: string;
  amount: string | number;
  paymentMode: string;
  formDate: string;
  // Cash submissions never get a Payment Advice PDF, only the Cash Voucher
  // — omitted (not just absent) rather than always present, mirroring how
  // cashVoucherPdfLink already only applies for Cash.
  paymentAdvicePdfLink?: string;
  cashVoucherPdfLink?: string;
}

const AUTHORITY_APPROVAL_TEMPLATE = shell("#E8A33D", `<tr><td style="padding:32px;"><p style="margin:0 0 4px;font-size:13px;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;">{{document_label}} Approval Request</p><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0B1F3A;">{{display_no}}</h1>{{resubmission_note}}<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#1F2937;">Dear {{authority_name}},<br><br>You've been selected as the Recommending Authority for this {{document_label}}, submitted by <strong>{{submitted_by_name}}</strong> on {{form_date}}. Please review the details below and approve or send it back with remarks.</p>${details([["Payee", "{{payee_name}}"], ["Amount", "₹ {{amount}}"], ["Nature of Expenditure", "{{nature_of_expenditure}}"], ["Bill / Reference No.", "{{bill_reference}}"], ["Payment Mode", "{{payment_mode}}"]])}${button("{{approval_link}}", "Review &amp; Approve")}<p style="margin:0;font-size:12px;line-height:1.6;color:#9CA3AF;text-align:center;">This link is unique to you and does not require a login.<br>If the button doesn't work, copy this link into your browser:<br><a href="{{approval_link}}" style="color:#2E8B57;word-break:break-all;">{{approval_link}}</a></p></td></tr>`);

const SENT_BACK_TEMPLATE = shell("#E8A33D", `<tr><td style="padding:32px;"><p style="margin:0 0 4px;font-size:13px;color:#B45309;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Action Required</p><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0B1F3A;">{{document_label}} {{display_no}} Sent Back</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#1F2937;">Dear {{submitted_by_name}},<br><br>Your {{document_label}} submission has been sent back by <strong>{{sent_back_by}}</strong> and needs corrections before it can proceed. Please review the remarks below, make the necessary changes, and resubmit.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;margin-bottom:24px;"><tr><td style="padding:16px;"><p style="margin:0 0 6px;font-size:12px;color:#92400E;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Remarks</p><p style="margin:0;font-size:14px;line-height:1.6;color:#78350F;">{{remarks}}</p></td></tr></table>${details([["Payee", "{{payee_name}}"], ["Amount", "₹ {{amount}}"]])}${button("{{edit_link}}", "Edit &amp; Resubmit")}<p style="margin:0;font-size:12px;line-height:1.6;color:#9CA3AF;text-align:center;">This link expires in 14 days and does not require a login.<br>If the button doesn't work, copy this link into your browser:<br><a href="{{edit_link}}" style="color:#2E8B57;word-break:break-all;">{{edit_link}}</a></p></td></tr>`);

const SUBMISSION_CONFIRMATION_TEMPLATE = shell("#2E8B57", `<tr><td style="padding:32px;"><p style="margin:0 0 4px;font-size:13px;color:#2E8B57;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Submission Confirmed</p><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0B1F3A;">{{display_no}}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#1F2937;">Dear {{submitted_by_name}},<br><br>Your {{document_label}} has been submitted successfully. It has been routed to <strong>{{authority_name}}</strong> (Recommending Authority) for approval. You'll be notified once it's actioned.</p>${details([["Payee", "{{payee_name}}"], ["Amount", "₹ {{amount}}"], ["Payment Mode", "{{payment_mode}}"], ["Date", "{{form_date}}"]])}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">{{payment_advice_button}}{{cash_voucher_button}}</table><p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6B7280;text-align:center;">Remember to attach the corresponding documents (Bill, etc.) as required. For Cash payments, funds are typically disbursed within 3–4 business days after approval.</p></td></tr>`);

export function renderAuthorityApprovalEmail(data: AuthorityApprovalEmailData) {
  const revisionCount = data.revisionCount ?? 0;
  const previousRemarks = data.previousRemarks
    ? `<p style="margin:8px 0 0;line-height:1.5;">Previous remarks: ${escapeHtml(data.previousRemarks)}</p>`
    : "";
  const resubmissionNote = revisionCount >= 1
    ? `<div style="margin:0 0 20px;padding:14px 16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;color:#78350F;font-size:14px;"><strong>This is a resubmission (revision ${revisionCount}) after being sent back with corrections.</strong>${previousRemarks}</div>`
    : "";
  const template = AUTHORITY_APPROVAL_TEMPLATE.replace("{{resubmission_note}}", resubmissionNote);
  return {
    subject: `${revisionCount >= 1 ? `[Resubmission — Revision ${revisionCount}] ` : ""}Approval Required: ${data.documentLabel} ${data.displayNo}`,
    html: replaceTokens(template, {
      display_no: data.displayNo, document_label: data.documentLabel, authority_name: data.authorityName,
      submitted_by_name: data.submittedByName, payee_name: data.payeeName,
      amount: data.amount, nature_of_expenditure: data.natureOfExpenditure,
      bill_reference: data.billReference, payment_mode: data.paymentMode,
      form_date: formatDateOnly(data.formDate), approval_link: data.approvalLink,
    }),
  };
}

export function renderSentBackEmail(data: SentBackEmailData) {
  return {
    subject: `Action Required: ${data.documentLabel} ${data.displayNo} Sent Back`,
    html: replaceTokens(SENT_BACK_TEMPLATE, {
      display_no: data.displayNo, document_label: data.documentLabel, submitted_by_name: data.submittedByName,
      sent_back_by: data.sentBackBy, remarks: data.remarks,
      payee_name: data.payeeName, amount: data.amount, edit_link: data.editLink,
    }),
  };
}

export interface VerifiedEmailData {
  displayNo: string;
  submittedByName: string;
  verifiedBy: string;
  /** "Payment Advice" for NEFT, "Cash Payment Voucher" for Cash — see
   * lib/advice/document-identity.ts. */
  documentLabel: string;
  payeeName: string;
  amount: string | number;
  formDate: string;
}

const VERIFIED_TEMPLATE = shell("#2E8B57", `<tr><td style="padding:32px;"><p style="margin:0 0 4px;font-size:13px;color:#2E8B57;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Verified</p><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0B1F3A;">{{display_no}}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#1F2937;">Dear {{submitted_by_name}}, your {{document_label}} has been verified by <strong>{{verified_by}}</strong>. It is now Ready for Payment.</p>${details([["Payee", "{{payee_name}}"], ["Amount", "₹ {{amount}}"], ["Date", "{{form_date}}"]])}</td></tr>`);

export function renderVerifiedEmail(data: VerifiedEmailData) {
  return {
    subject: `${data.documentLabel} ${data.displayNo} Verified`,
    html: replaceTokens(VERIFIED_TEMPLATE, {
      display_no: data.displayNo, submitted_by_name: data.submittedByName,
      verified_by: data.verifiedBy, document_label: data.documentLabel,
      payee_name: data.payeeName, amount: data.amount, form_date: formatDateOnly(data.formDate),
    }),
  };
}

export interface PaymentDoneEmailData {
  displayNo: string;
  submittedByName: string;
  /** "Payment Advice" for NEFT, "Cash Payment Voucher" for Cash — same
   * caller-supplied derivation as VerifiedEmailData.documentLabel. */
  documentLabel: string;
  payeeName: string;
  amount: string | number;
  formDate: string;
}

const PAYMENT_DONE_TEMPLATE = shell("#2E8B57", `<tr><td style="padding:32px;"><p style="margin:0 0 4px;font-size:13px;color:#2E8B57;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Payment Done</p><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0B1F3A;">{{display_no}}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#1F2937;">Dear {{submitted_by_name}}, your {{document_label}} {{display_no}} has been paid.</p>${details([["Payee", "{{payee_name}}"], ["Amount", "₹ {{amount}}"], ["Date", "{{form_date}}"]])}</td></tr>`);

export function renderPaymentDoneEmail(data: PaymentDoneEmailData) {
  return {
    subject: `${data.documentLabel} ${data.displayNo} — Payment Done`,
    html: replaceTokens(PAYMENT_DONE_TEMPLATE, {
      display_no: data.displayNo, submitted_by_name: data.submittedByName,
      document_label: data.documentLabel, payee_name: data.payeeName,
      amount: data.amount, form_date: formatDateOnly(data.formDate),
    }),
  };
}

/**
 * One email per payment_entries row — NEFT (Payment Advice) only, per the
 * multi-part payment model (see AGENT_HANDOFF.md). Deliberately not a
 * cumulative "payment summary" — each email is accurate only to the moment
 * that specific entry was recorded, showing that entry's own amount and
 * remarks, and stating plainly whether it was a partial payment (with the
 * remaining balance) or the final, fully-settling one. Two payments on one
 * advice send two separate emails.
 */
export interface PaymentEntryEmailData {
  displayNo: string;
  submittedByName: string;
  documentLabel: string;
  payeeName: string;
  entryAmount: string | number;
  remarks: string;
  isFinal: boolean;
  totalPaid: string | number;
  billPassedFor: string | number;
  remaining: string | number;
  formDate: string;
}

const PAYMENT_ENTRY_TEMPLATE = shell("#2E8B57", `<tr><td style="padding:32px;"><p style="margin:0 0 4px;font-size:13px;color:#2E8B57;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">{{status_label}}</p><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0B1F3A;">{{display_no}}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#1F2937;">Dear {{submitted_by_name}}, a payment of <strong>₹ {{entry_amount}}</strong> has been recorded against your {{document_label}} {{display_no}}.{{status_sentence}}</p>${details([["Payee", "{{payee_name}}"], ["This Payment", "₹ {{entry_amount}}"], ["Remarks", "{{remarks}}"], ["Paid So Far", "₹ {{total_paid}} of ₹ {{bill_passed_for}}"], ["Balance Remaining", "₹ {{remaining}}"], ["Date", "{{form_date}}"]])}</td></tr>`);

export function renderPaymentEntryEmail(data: PaymentEntryEmailData) {
  const statusLabel = data.isFinal ? "Payment Complete" : "Partial Payment Recorded";
  const statusSentence = data.isFinal
    ? " This is the final payment — the full billed amount has now been settled."
    : " This is a partial payment; ₹ {{remaining}} remains to be paid.";
  return {
    subject: `${data.documentLabel} ${data.displayNo} — ${statusLabel}`,
    html: replaceTokens(PAYMENT_ENTRY_TEMPLATE, {
      status_label: statusLabel,
      status_sentence: statusSentence,
      display_no: data.displayNo,
      submitted_by_name: data.submittedByName,
      document_label: data.documentLabel,
      payee_name: data.payeeName,
      entry_amount: data.entryAmount,
      remarks: data.remarks,
      total_paid: data.totalPaid,
      bill_passed_for: data.billPassedFor,
      remaining: data.remaining,
      form_date: formatDateOnly(data.formDate),
    }),
  };
}

export function renderSubmissionConfirmationEmail(data: SubmissionConfirmationEmailData) {
  const paymentAdviceButton = data.paymentMode !== "CASH" && data.paymentAdvicePdfLink
    ? `<tr><td align="center">${button("{{payment_advice_pdf_link}}", "Download Payment Advice")}</td></tr>`
    : "";
  const cashVoucherButton = data.paymentMode === "CASH" && data.cashVoucherPdfLink
    ? `<tr><td align="center">${button("{{cash_voucher_pdf_link}}", "Download Cash Payment Voucher", true)}</td></tr>`
    : "";
  const template = SUBMISSION_CONFIRMATION_TEMPLATE.replace(
    "{{payment_advice_button}}",
    paymentAdviceButton,
  ).replace("{{cash_voucher_button}}", cashVoucherButton);
  return {
    subject: `${data.documentLabel} ${data.displayNo} Submitted`,
    html: replaceTokens(template, {
      display_no: data.displayNo, document_label: data.documentLabel, authority_name: data.authorityName,
      submitted_by_name: data.submittedByName, payee_name: data.payeeName,
      amount: data.amount, payment_mode: data.paymentMode, form_date: formatDateOnly(data.formDate),
      payment_advice_pdf_link: data.paymentAdvicePdfLink,
      cash_voucher_pdf_link: data.cashVoucherPdfLink,
    }),
  };
}
