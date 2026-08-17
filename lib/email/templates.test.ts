import { describe, expect, it } from "vitest";
import {
  renderAuthorityApprovalEmail,
  renderSentBackEmail,
  renderSubmissionConfirmationEmail,
  renderVerifiedEmail,
  renderPaymentDoneEmail,
  renderPaymentEntryEmail,
} from "./templates";

describe("email templates", () => {
  it("renders a fully substituted authority approval email with the expected subject", () => {
    const message = renderAuthorityApprovalEmail({
      displayNo: "MCCIA/2026-27/0001",
      documentLabel: "Payment Advice",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "1,250.00",
      natureOfExpenditure: "Event printing",
      billReference: "INV-101",
      paymentMode: "NEFT",
      formDate: "30/07/2026",
      approvalLink: "https://example.test/approval/token",
    });
    expect(message.subject).toBe("Approval Required: Payment Advice MCCIA/2026-27/0001");
    expect(message.html).toContain("Event printing");
    expect(message.html).not.toContain("{{");
  });

  it("uses 'Cash Payment Voucher' + cash_voucher_no in the authority approval subject/body for Cash submissions", () => {
    const message = renderAuthorityApprovalEmail({
      displayNo: "CASH/MCCIA/2026-27/0001",
      documentLabel: "Cash Payment Voucher",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "1,250.00",
      natureOfExpenditure: "Event printing",
      billReference: "INV-101",
      paymentMode: "CASH",
      formDate: "30/07/2026",
      approvalLink: "https://example.test/approval/token",
    });
    expect(message.subject).toBe("Approval Required: Cash Payment Voucher CASH/MCCIA/2026-27/0001");
    expect(message.html).toContain("CASH/MCCIA/2026-27/0001");
    expect(message.html).toContain("Cash Payment Voucher Approval Request");
    expect(message.html).not.toContain("{{");
  });

  it("renders the sent-back subject and escapes free-text remarks", () => {
    const message = renderSentBackEmail({
      displayNo: "MCCIA/2026-27/0002",
      documentLabel: "Payment Advice",
      submittedByName: "Priya Sharma",
      sentBackBy: "Admin",
      remarks: "Please correct <script>alert(1)</script> & resubmit",
      payeeName: "Acme Supplies",
      amount: "850.00",
      editLink: "https://example.test/edit/token",
    });
    expect(message.subject).toBe("Action Required: Payment Advice MCCIA/2026-27/0002 Sent Back");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; resubmit");
    expect(message.html).not.toContain("<script>alert(1)</script>");
    expect(message.html).not.toContain("{{");
  });

  it("uses 'Cash Payment Voucher' + cash_voucher_no in the sent-back subject/body for Cash submissions", () => {
    const message = renderSentBackEmail({
      displayNo: "CASH/MCCIA/2026-27/0002",
      documentLabel: "Cash Payment Voucher",
      submittedByName: "Priya Sharma",
      sentBackBy: "Admin",
      remarks: "Please fix the total",
      payeeName: "Acme Supplies",
      amount: "850.00",
      editLink: "https://example.test/edit/token",
    });
    expect(message.subject).toBe("Action Required: Cash Payment Voucher CASH/MCCIA/2026-27/0002 Sent Back");
    expect(message.html).toContain("Your Cash Payment Voucher submission has been sent back");
  });

  it("renders the submission subject and omits the Cash Voucher button without its link", () => {
    const message = renderSubmissionConfirmationEmail({
      displayNo: "MCCIA/2026-27/0003",
      documentLabel: "Payment Advice",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "NEFT",
      formDate: "30/07/2026",
      paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
    });
    expect(message.subject).toBe("Payment Advice MCCIA/2026-27/0003 Submitted");
    expect(message.html).toContain("Download Payment Advice");
    expect(message.html).not.toContain("Download Cash Payment Voucher");
    expect(message.html).not.toContain("{{");
  });

  it("includes the Cash Voucher button, and omits the Payment Advice button, for Cash submissions", () => {
    const message = renderSubmissionConfirmationEmail({
      displayNo: "CASH/MCCIA/2026-27/0004",
      documentLabel: "Cash Payment Voucher",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "CASH",
      formDate: "30/07/2026",
      cashVoucherPdfLink: "https://example.test/advice/id/cash-voucher-pdf",
    });
    expect(message.subject).toBe("Cash Payment Voucher CASH/MCCIA/2026-27/0004 Submitted");
    expect(message.html).toContain("Download Cash Payment Voucher");
    expect(message.html).toContain("https://example.test/advice/id/cash-voucher-pdf");
    expect(message.html).not.toContain("Download Payment Advice");
    expect(message.html).not.toContain("{{");
  });

  it("still includes the Payment Advice button for NEFT submissions (unaffected by the Cash change)", () => {
    const message = renderSubmissionConfirmationEmail({
      displayNo: "MCCIA/2026-27/0005",
      documentLabel: "Payment Advice",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "NEFT",
      formDate: "30/07/2026",
      paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
    });
    expect(message.html).toContain("Download Payment Advice");
    expect(message.html).toContain("https://example.test/advice/id/pdf");
    expect(message.html).not.toContain("Download Cash Payment Voucher");
    expect(message.html).not.toContain("{{");
  });

  it("even a mislabeled Cash payload (paymentAdvicePdfLink present) omits the button — paymentMode decides, not link presence", () => {
    const message = renderSubmissionConfirmationEmail({
      displayNo: "CASH/MCCIA/2026-27/0006",
      documentLabel: "Cash Payment Voucher",
      authorityName: "Asha Rao",
      submittedByName: "Priya Sharma",
      payeeName: "Acme Supplies",
      amount: "850.00",
      paymentMode: "CASH",
      formDate: "30/07/2026",
      paymentAdvicePdfLink: "https://example.test/advice/id/pdf",
      cashVoucherPdfLink: "https://example.test/advice/id/cash-voucher-pdf",
    });
    expect(message.html).not.toContain("Download Payment Advice</a>");
  });
});

describe("renderVerifiedEmail", () => {
  it("renders the exact specified subject and eyebrow/header, substituting the document label for NEFT", () => {
    const message = renderVerifiedEmail({
      displayNo: "MCCIA/2026-27/0007",
      submittedByName: "Priya Sharma",
      verifiedBy: "Sunil Salunke",
      documentLabel: "Payment Advice",
      payeeName: "Acme Supplies",
      amount: "1,250.00",
      formDate: "30/07/2026",
    });
    expect(message.subject).toBe("Payment Advice MCCIA/2026-27/0007 Verified");
    expect(message.html).toContain(">Verified<");
    expect(message.html).toContain("MCCIA/2026-27/0007");
    expect(message.html).toContain("Priya Sharma");
    expect(message.html).toContain("Sunil Salunke");
    expect(message.html).toContain("Payment Advice");
    expect(message.html).toContain("It is now Ready for Payment");
    expect(message.html).not.toContain("{{");
  });

  it("substitutes the Cash Payment Voucher document label for Cash", () => {
    const message = renderVerifiedEmail({
      displayNo: "CASH/MCCIA/2026-27/0008",
      submittedByName: "Priya Sharma",
      verifiedBy: "Aabha Khatavkar",
      documentLabel: "Cash Payment Voucher",
      payeeName: "Acme Supplies",
      amount: "850.00",
      formDate: "30/07/2026",
    });
    expect(message.html).toContain("Cash Payment Voucher");
    expect(message.html).not.toContain("{{");
  });

  // Supersedes an earlier session's test asserting the subject was ALWAYS
  // the literal "Payment Advice {serial}" even for Cash, "per the exact
  // specified copy" of that session's brief. This session's brief
  // explicitly names "verified" among the 5 emails that must say "Cash
  // Payment Voucher" + cash_voucher_no for Cash submissions — a direct,
  // deliberate reversal of that earlier decision, flagged in
  // AGENT_HANDOFF.md rather than silently overwritten.
  it("uses 'Cash Payment Voucher {display_no}' subject for a Cash submission, using cash_voucher_no", () => {
    const message = renderVerifiedEmail({
      displayNo: "CASH/MCCIA/2026-27/0009",
      submittedByName: "Priya Sharma",
      verifiedBy: "Vaidehi Marathe",
      documentLabel: "Cash Payment Voucher",
      payeeName: "Acme Supplies",
      amount: "850.00",
      formDate: "30/07/2026",
    });
    expect(message.subject).toBe("Cash Payment Voucher CASH/MCCIA/2026-27/0009 Verified");
  });

  it("does not include a download button/link — this email is informational only", () => {
    const message = renderVerifiedEmail({
      displayNo: "MCCIA/2026-27/0010",
      submittedByName: "Priya Sharma",
      verifiedBy: "Chandrashekhar Shah",
      documentLabel: "Payment Advice",
      payeeName: "Acme Supplies",
      amount: "850.00",
      formDate: "30/07/2026",
    });
    expect(message.html).not.toContain("<a href");
  });
});

describe("renderPaymentDoneEmail", () => {
  it("renders the Payment Advice subject/body for NEFT", () => {
    const message = renderPaymentDoneEmail({
      displayNo: "MCCIA/2026-27/0011",
      submittedByName: "Priya Sharma",
      documentLabel: "Payment Advice",
      payeeName: "Acme Supplies",
      amount: "1,250.00",
      formDate: "30/07/2026",
    });
    expect(message.subject).toBe("Payment Advice MCCIA/2026-27/0011 — Payment Done");
    expect(message.html).toContain("MCCIA/2026-27/0011 has been paid");
  });

  it("uses 'Cash Payment Voucher' + cash_voucher_no for Cash", () => {
    const message = renderPaymentDoneEmail({
      displayNo: "CASH/MCCIA/2026-27/0012",
      submittedByName: "Priya Sharma",
      documentLabel: "Cash Payment Voucher",
      payeeName: "Acme Supplies",
      amount: "850.00",
      formDate: "30/07/2026",
    });
    expect(message.subject).toBe("Cash Payment Voucher CASH/MCCIA/2026-27/0012 — Payment Done");
    expect(message.html).toContain("CASH/MCCIA/2026-27/0012 has been paid");
  });
});

describe("renderPaymentEntryEmail", () => {
  const base = {
    displayNo: "MCCIA/2026-27/0050",
    submittedByName: "Priya Sharma",
    documentLabel: "Payment Advice",
    payeeName: "Acme Supplies",
    entryAmount: "400.00",
    remarks: "Basic Amount paid now",
    totalPaid: "400.00",
    billPassedFor: "1,000.00",
    remaining: "600.00",
    formDate: "01/08/2026",
  };

  it("labels a partial payment clearly, states the remaining balance, and never mentions 'Payment Complete'", () => {
    const message = renderPaymentEntryEmail({ ...base, isFinal: false });
    expect(message.subject).toBe("Payment Advice MCCIA/2026-27/0050 — Partial Payment Recorded");
    expect(message.html).toContain("This is a partial payment");
    expect(message.html).toContain("600.00");
    expect(message.html).not.toContain("Payment Complete");
  });

  it("labels the final payment clearly and never claims a balance remains", () => {
    const message = renderPaymentEntryEmail({
      ...base,
      entryAmount: "600.00",
      totalPaid: "1,000.00",
      remaining: "0.00",
      isFinal: true,
    });
    expect(message.subject).toBe("Payment Advice MCCIA/2026-27/0050 — Payment Complete");
    expect(message.html).toContain("full billed amount has now been settled");
    expect(message.html).not.toContain("Partial Payment Recorded");
  });

  it("shows this entry's own amount and remarks, not a cumulative figure", () => {
    const message = renderPaymentEntryEmail({ ...base, isFinal: false });
    expect(message.html).toContain("₹ 400.00");
    expect(message.html).toContain("Basic Amount paid now");
  });

  it("escapes HTML in remarks", () => {
    const message = renderPaymentEntryEmail({
      ...base,
      remarks: "<script>alert(1)</script>",
      isFinal: false,
    });
    expect(message.html).not.toContain("<script>alert(1)</script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});
